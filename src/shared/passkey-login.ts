import { isControlAvailable as isAvailable } from './control-availability';
import type { AutofillResponse } from './messages';
import { normalizeOrigin } from './origins';

export const PASSKEY_ACCOUNT_INPUT_DELAY_MS = 300;

function controlLabel(control: HTMLElement): string {
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy.split(/\s+/).map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (labels) return labels;
  }
  return control.getAttribute('aria-label')?.trim() ||
    (control.tagName === 'INPUT' ? control.getAttribute('value') : control.textContent)?.trim() || '';
}

export function isSecureLoginOrigin(origin: string): boolean {
  const url = new URL(origin);
  return url.protocol === 'https:' || (url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
}

export function hasVisibleAuthenticationFrame(authenticationOrigin: string, root: ParentNode = document): boolean {
  const frames = Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe')).filter((frame) =>
    normalizeOrigin(frame.src) === authenticationOrigin,
  );
  return frames.length === 1 && isAvailable(frames[0]!);
}

function findPasskeyControls(root: ParentNode): HTMLElement[] {
  // Never interpret account creation, credential management, or generic sign-in as passkey login.
  if (root.querySelector('input[autocomplete~="new-password" i]')) return [];
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    'button, input[type="button"], input[type="submit"], [role="button"]',
  )).filter((control) => {
    const label = controlLabel(control).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
    if (!/(?:\bpasskeys?\b|パスキー)/u.test(label)) return false;
    if (/(?:\b(?:create|register|add|set up|setup|manage|delete|remove|enroll)\b|作成|登録|追加|設定|管理|削除)/u.test(label)) return false;
    return /(?:\b(?:sign[ -]?in|log[ -]?in|continue)\b|ログイン|サインイン)/u.test(label);
  });
  return candidates;
}

export function findPasskeyLoginButton(root: ParentNode = document): HTMLElement | null {
  const candidates = findPasskeyControls(root).filter(isAvailable);
  // Multiple choices can refer to different accounts; leave that decision to the user.
  return candidates.length === 1 ? candidates[0]! : null;
}

interface PasskeyLoginOptions {
  root: ParentNode;
  canStart: () => boolean;
  getPolicy: () => Promise<AutofillResponse>;
  reportCandidate: () => Promise<AutofillResponse>;
}

export class PasskeyLoginController {
  private attempted = false;
  private inFlight = false;
  private interacted = false;
  private reported = false;
  private generation = 0;
  private accountInputUntil = 0;
  private policy: AutofillResponse | undefined;
  private controls: HTMLElement[] | undefined;

  constructor(private readonly options: PasskeyLoginOptions) {}

  invalidateCandidates(): void {
    this.controls = undefined;
  }

  invalidatePolicy(): void {
    this.policy = undefined;
    this.generation++;
  }

  markUserInteraction(): void {
    this.interacted = true;
    this.generation += 1;
  }

  pauseForAccountInput(): void {
    // Account entry is part of passkey sign-in, rather than a choice to stop it.
    this.accountInputUntil = Date.now() + PASSKEY_ACCOUNT_INPUT_DELAY_MS;
    this.generation += 1;
  }

  async evaluate(explicit = false): Promise<boolean> {
    if (this.inFlight || !this.options.canStart()) return false;
    if (this.attempted) return false;
    if (!explicit && Date.now() < this.accountInputUntil) return false;
    if (explicit) {
      this.controls = undefined;
      this.policy = undefined;
      this.interacted = false;
      this.generation += 1;
      this.accountInputUntil = 0;
    }
    this.controls ??= findPasskeyControls(this.options.root);
    const available = this.controls.filter(isAvailable);
    if (available.length !== 1) return false;
    const candidate = available[0]!;
    this.inFlight = true;
    const generation = this.generation;
    try {
      const policy = this.policy ?? await this.options.getPolicy();
      if (!this.options.canStart() || generation !== this.generation) return false;
      // Cache only a denial. A permission to act always needs fresh frame proof.
      if (policy.ok && policy.action === 'ignore' && !policy.retry) this.policy = policy;
      if (policy.ok && policy.action === 'submit' && policy.method === 'passkey') {
        if (this.attempted || this.interacted || generation !== this.generation) return false;
        if (findPasskeyLoginButton(this.options.root) !== candidate) return false;
        // A cancellation must not trigger another prompt, even if the site replaces its button.
        this.attempted = true;
        candidate.click();
        return true;
      }
      if (policy.ok && policy.action === 'ignore' && !policy.retry && !this.reported) {
        const response = await this.options.reportCandidate();
        if (response.ok) this.reported = true;
      }
    } catch {
      // Leave browser policy failures and extension disconnection to the normal site UI.
    } finally {
      this.inFlight = false;
    }
    return false;
  }
}
