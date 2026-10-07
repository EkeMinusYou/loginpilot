import { findLoginForm, hasCredentials, hasPendingPasswordAutofill, isCurrentLoginForm, type LoginFormCandidate } from './form-detector';
import { fillStoredCredentials } from './credential-autofill';
import { isControlAvailable } from './control-availability';
import type { AutofillResponse } from './messages';

interface FormState {
  interacted: boolean;
  generation: number;
  inFlight: boolean;
  credentialAttempted: boolean;
  previewReported: boolean;
  completed: boolean;
  idle?: Promise<void>;
  finish?: () => void;
}

interface PasswordLoginOptions {
  canStart: () => boolean;
  getPolicy: () => Promise<AutofillResponse>;
  reportCandidate: () => Promise<AutofillResponse>;
  schedule: (callback: () => void) => void;
}

function submitControls(form: HTMLFormElement): HTMLElement[] {
  const selector = '[onclick*="onLogin"], button[type="submit"], button:not([type]), input[type="submit"], input[type="image"]';
  const descendants = Array.from(form.querySelectorAll<HTMLElement>(selector));
  const associated = Array.from(form.ownerDocument.querySelectorAll<HTMLButtonElement | HTMLInputElement>(selector))
    .filter((control) => control.form === form);
  return [...new Set([...descendants, ...associated])];
}

export function submitLoginForm(candidate: LoginFormCandidate, canSubmit: () => boolean): boolean {
  const safe = (): boolean => canSubmit() && isCurrentLoginForm(candidate) && hasCredentials(candidate);
  if (!safe()) return false;
  const hadControl = submitControls(candidate.form).length > 0;
  // Framework handlers can replace fields or turn this into a registration form.
  for (const input of [candidate.usernameInput, candidate.passwordInput]) {
    for (const type of ['input', 'change']) {
      input.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      if (!safe()) return false;
    }
  }
  const controls = submitControls(candidate.form);
  if (hadControl && controls.length === 0) return false;
  if (controls.length) {
    const available = controls.filter(isControlAvailable);
    // Do not bypass a disabled/hidden control or choose among different actions.
    if (available.length !== 1) return false;
    available[0]!.click();
  } else {
    candidate.form.requestSubmit();
  }
  return true;
}

export class PasswordLoginController {
  private policyVersion = 0;
  private readonly states = new WeakMap<HTMLFormElement, FormState>();
  constructor(private readonly options: PasswordLoginOptions) {}

  invalidatePolicy(): void { this.policyVersion++; }

  private version(state: FormState): string { return `${state.generation}:${this.policyVersion}`; }

  private state(form: HTMLFormElement): FormState {
    let state = this.states.get(form);
    if (!state) {
      state = { interacted: false, generation: 0, inFlight: false, credentialAttempted: false, previewReported: false, completed: false };
      this.states.set(form, state);
    }
    return state;
  }

  markUserInteraction(form: HTMLFormElement): void {
    const state = this.state(form);
    state.interacted = true;
    state.generation++;
  }

  private guard(candidate: LoginFormCandidate, state: FormState, generation: string): boolean {
    return this.options.canStart() && !state.interacted && generation === this.version(state) && isCurrentLoginForm(candidate);
  }

  async register(candidate: LoginFormCandidate): Promise<boolean> {
    const state = this.state(candidate.form);
    // Invalidate old work; registration is an explicit request for this form.
    state.generation++;
    state.interacted = false;
    state.completed = false;
    state.previewReported = false;
    state.credentialAttempted = false;
    if (state.inFlight) await state.idle;
    if (!this.options.canStart() || state.interacted || !isCurrentLoginForm(candidate)) return false;
    if (!hasCredentials(candidate)) return this.requestCredentials(candidate, state, 'optional');
    void this.evaluate();
    return false;
  }

  private async requestCredentials(candidate: LoginFormCandidate, state: FormState, mediation: 'silent' | 'optional'): Promise<boolean> {
    if (state.inFlight) return false;
    state.inFlight = true;
    state.idle = new Promise((resolve) => { state.finish = resolve; });
    state.credentialAttempted = true;
    const generation = this.version(state);
    let filled = false;
    try {
      const policy = await this.options.getPolicy();
      if (policy.ok && policy.action === 'submit' && (policy.method === undefined || policy.method === 'password') && this.guard(candidate, state, generation)) {
        filled = await fillStoredCredentials(candidate, mediation, () => this.guard(candidate, state, generation));
      }
    } catch {
      // Ordinary browser autofill remains available after cancellation/disconnection.
    } finally {
      state.inFlight = false;
      state.finish?.();
    }
    if (filled) this.options.schedule(() => void this.evaluate());
    return filled;
  }

  async evaluate(): Promise<void> {
    if (!this.options.canStart()) return;
    const candidate = findLoginForm();
    if (!candidate) return;
    const state = this.state(candidate.form);
    if (state.inFlight || state.interacted || state.completed) return;
    if (!hasCredentials(candidate)) {
      if (!state.credentialAttempted) {
        await this.requestCredentials(candidate, state, 'silent');
      }
      if (!this.options.canStart() || state.interacted || !isCurrentLoginForm(candidate) ||
        !hasPendingPasswordAutofill(candidate) || state.previewReported) return;
      state.previewReported = true;
      try { await this.options.reportCandidate(); } catch { state.previewReported = false; }
      return;
    }
    state.inFlight = true;
    state.idle = new Promise((resolve) => { state.finish = resolve; });
    const generation = this.version(state);
    const username = candidate.usernameInput.value;
    const password = candidate.passwordInput.value;
    try {
      const policy = await this.options.reportCandidate();
      const safe = (): boolean => this.guard(candidate, state, generation) &&
        candidate.usernameInput.value === username && candidate.passwordInput.value === password;
      if (!safe()) return;
      if (policy.ok && policy.action === 'submit' && (policy.method === undefined || policy.method === 'password')) {
        state.completed = submitLoginForm(candidate, safe);
      } else if (policy.ok && policy.action === 'pending') {
        state.completed = true;
      }
    } catch {
      // Retry later if the extension worker was temporarily unavailable.
    } finally {
      state.inFlight = false;
      state.finish?.();
    }
  }
}
