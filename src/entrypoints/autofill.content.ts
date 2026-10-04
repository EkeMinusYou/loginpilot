import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { findLoginForm, hasAutofillMarker, hasCredentials, hasPendingPasswordAutofill, type LoginFormCandidate } from '../shared/form-detector';
import {
  MESSAGE_TYPES,
  type AutofillResponse,
  type ContentMessage,
  type CredentialSetupResponse,
} from '../shared/messages';
import { normalizeOrigin } from '../shared/origins';
import { fillStoredCredentials } from '../shared/credential-autofill';

interface FormState {
  lastShape: string;
  userInteracted: boolean;
  autofillPreviewReported: boolean;
  credentialAttempted: boolean;
  credentialInFlight: boolean;
  interactionVersion: number;
}

function valueShape(candidate: LoginFormCandidate): string {
  return `${candidate.usernameInput.value.length}:${candidate.passwordInput.value.length}`;
}

function markUserInteraction(state: FormState): void {
  state.userInteracted = true;
  state.interactionVersion += 1;
}

function addAutocompleteHint(input: HTMLInputElement): void {
  if (input.getAttribute('autocomplete')) {
    return;
  }

  input.setAttribute('autocomplete', input.type.toLowerCase() === 'password' ? 'current-password' : 'username');
}

function notifyPageOfAutofill(candidate: LoginFormCandidate): void {
  for (const input of [candidate.usernameInput, candidate.passwordInput]) {
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
}

function submitLoginForm(candidate: LoginFormCandidate): void {
  notifyPageOfAutofill(candidate);

  const submitter = candidate.form.querySelector<HTMLElement>(
    '[onclick*="onLogin"], button[type="submit"], button:not([type]), input[type="submit"], input[type="image"]',
  );

  const isDisabled = submitter && 'disabled' in submitter && Boolean(submitter.disabled);
  if (submitter && !isDisabled && submitter.getClientRects().length > 0) {
    submitter.click();
    return;
  }

  candidate.form.requestSubmit();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main(ctx) {
    const origin = normalizeOrigin(location.href);
    if (!origin) {
      return;
    }

    const reportedForms = new WeakSet<HTMLFormElement>();
    const inFlightForms = new WeakSet<HTMLFormElement>();
    const formStates = new WeakMap<HTMLFormElement, FormState>();
    const observedInputs = new WeakSet<HTMLInputElement>();

    function getFormState(form: HTMLFormElement): FormState {
      const existing = formStates.get(form);
      if (existing) {
        return existing;
      }

      const state: FormState = {
        lastShape: '',
        userInteracted: false,
        autofillPreviewReported: false,
        credentialAttempted: false,
        credentialInFlight: false,
        interactionVersion: 0,
      };
      formStates.set(form, state);
      return state;
    }

    async function evaluate(): Promise<void> {
      const candidate = findLoginForm();
      if (!candidate) {
        return;
      }

      const state = getFormState(candidate.form);
      if (state.credentialInFlight) return;
      const shape = valueShape(candidate);

      if (!hasCredentials(candidate)) {
        const pendingAutofill = hasPendingPasswordAutofill(candidate);
        if (!pendingAutofill) reportedForms.delete(candidate.form);
        inFlightForms.delete(candidate.form);
        state.lastShape = shape;
        if (!state.credentialAttempted && !state.userInteracted && document.visibilityState === 'visible') {
          void requestCredentials(candidate, state, 'silent');
        }
        if (pendingAutofill) {
          if (!state.autofillPreviewReported && !state.userInteracted && document.visibilityState === 'visible') {
            void reportAutofillPreview(candidate, state);
          }
        }
        return;
      }

      if (reportedForms.has(candidate.form) || inFlightForms.has(candidate.form)) {
        return;
      }

      if (state.lastShape === shape) {
        return;
      }
      state.lastShape = shape;

      const likelyAutofill = hasAutofillMarker(candidate) || !state.userInteracted;
      if (!likelyAutofill) {
        return;
      }

      inFlightForms.add(candidate.form);
      const interactionVersion = state.interactionVersion;
      let response: AutofillResponse;
      try {
        response = (await browser.runtime.sendMessage({
          type: MESSAGE_TYPES.autofillDetected,
          origin,
        })) as AutofillResponse;
      } catch {
        inFlightForms.delete(candidate.form);
        return;
      }

      inFlightForms.delete(candidate.form);

      if (response.ok && response.action === 'submit') {
        if (!candidate.form.isConnected || !hasCredentials(candidate) || state.interactionVersion !== interactionVersion) return;
        try {
          submitLoginForm(candidate);
        } catch {
          inFlightForms.delete(candidate.form);
          return;
        }
        reportedForms.add(candidate.form);
      } else if (response.ok && response.action === 'pending') {
        reportedForms.add(candidate.form);
      }
    }

    function observeInput(input: HTMLInputElement): void {
      if (observedInputs.has(input)) {
        return;
      }

      const form = input.form;
      if (!form) {
        return;
      }

      observedInputs.add(input);

      const state = getFormState(form);
      input.addEventListener('keydown', () => markUserInteraction(state), { passive: true });
      input.addEventListener('beforeinput', () => markUserInteraction(state), { passive: true });
      input.addEventListener('paste', () => markUserInteraction(state), { passive: true });
      input.addEventListener('input', () => void evaluate(), { passive: true });
      input.addEventListener('change', () => void evaluate(), { passive: true });
      input.addEventListener(
        'focus',
        () => {
          void evaluate();
          for (const delay of [100, 500, 1500]) {
            ctx.setTimeout(() => void evaluate(), delay);
          }
        },
        { passive: true },
      );
    }

    function observeForms(): void {
      for (const input of Array.from(document.querySelectorAll('input'))) {
        observeInput(input);
      }

      const candidate = findLoginForm();
      if (candidate) {
        addAutocompleteHint(candidate.usernameInput);
        addAutocompleteHint(candidate.passwordInput);
      }

      void evaluate();
    }

    async function handleContentMessage(message: ContentMessage): Promise<CredentialSetupResponse> {
      if (message.origin !== origin || window.top !== window) {
        return { ok: false, error: '対象のログインページを開いてください。' };
      }

      const candidate = findLoginForm();
      if (!candidate) {
        return { ok: false, error: 'メールアドレスとパスワードの入力欄があるページで設定してください。' };
      }

      reportedForms.delete(candidate.form);
      inFlightForms.delete(candidate.form);
      const state = getFormState(candidate.form);
      state.lastShape = '';
      state.userInteracted = false;
      state.autofillPreviewReported = false;
      state.credentialAttempted = false;
      if (message.type === MESSAGE_TYPES.enableCredentialLogin) {
        const filled = await requestCredentials(candidate, state, 'optional');
        return { ok: true, filled };
      }
      void evaluate();
      return { ok: true, filled: false };
    }

    async function requestCredentials(
      candidate: LoginFormCandidate,
      state: FormState,
      mediation: 'silent' | 'optional',
    ): Promise<boolean> {
      if (state.credentialInFlight || window.top !== window) return false;
      state.credentialAttempted = true;
      state.credentialInFlight = true;
      let filled = false;
      try {
        // Check registration before asking Chrome for credentials, including when no preview is visible.
        const response = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.getLoginPolicy, origin }) as AutofillResponse;
        if (response.ok && response.action === 'submit') {
          filled = await fillStoredCredentials(candidate, mediation, () =>
            !ctx.isInvalid && !state.userInteracted && document.visibilityState === 'visible',
          );
        }
      } catch {
        // Continue observing ordinary autofill if the extension or browser is unavailable.
      } finally {
        state.credentialInFlight = false;
      }
      if (filled) {
        state.lastShape = '';
        reportedForms.delete(candidate.form);
        // Recheck registration through the normal submission path after the credential request.
        ctx.setTimeout(() => void evaluate(), 0);
      }
      return filled;
    }

    async function reportAutofillPreview(candidate: LoginFormCandidate, state: FormState): Promise<void> {
      state.autofillPreviewReported = true;
      try {
        // A native preview can be reported even when Chrome has not committed its DOM values.
        const response = (await browser.runtime.sendMessage({
          type: MESSAGE_TYPES.autofillDetected,
          origin,
        })) as AutofillResponse;
        if (response.ok && response.action === 'pending') reportedForms.add(candidate.form);
      } catch {
        state.autofillPreviewReported = false;
      }
    }

    observeForms();

    const onRuntimeMessage = (message: unknown): Promise<CredentialSetupResponse> | undefined => {
      if (typeof message === 'object' && message !== null && 'type' in message && 'origin' in message &&
          (message.type === MESSAGE_TYPES.siteRegistered || message.type === MESSAGE_TYPES.enableCredentialLogin)) {
        return handleContentMessage(message as ContentMessage);
      }
    };
    browser.runtime.onMessage.addListener(onRuntimeMessage);

    const observer = new MutationObserver(() => {
      observeForms();
    });
    observer.observe(document, { childList: true, subtree: true });
    ctx.setInterval(() => void evaluate(), 1000);
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    });

    for (const delay of [100, 300, 700, 1500, 3000]) {
      ctx.setTimeout(() => void evaluate(), delay);
    }
  },
});
