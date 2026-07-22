import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { findLoginForm, hasAutofillMarker, hasCredentials, type LoginFormCandidate } from '../shared/form-detector';
import { MESSAGE_TYPES, type AutofillResponse, type ContentMessage } from '../shared/messages';
import { normalizeOrigin } from '../shared/origins';

interface FormState {
  lastShape: string;
  userInteracted: boolean;
}

function valueShape(candidate: LoginFormCandidate): string {
  return `${candidate.usernameInput.value.length}:${candidate.passwordInput.value.length}`;
}

function markUserInteraction(state: FormState): void {
  state.userInteracted = true;
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
  runAt: 'document_idle',
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

      const state: FormState = { lastShape: '', userInteracted: false };
      formStates.set(form, state);
      return state;
    }

    async function evaluate(): Promise<void> {
      const candidate = findLoginForm();
      if (!candidate) {
        return;
      }

      const state = getFormState(candidate.form);
      const shape = valueShape(candidate);

      if (!hasCredentials(candidate)) {
        reportedForms.delete(candidate.form);
        inFlightForms.delete(candidate.form);
        state.lastShape = shape;
        if (candidate.usernameInput.value.length === 0 && candidate.passwordInput.value.length === 0) {
          state.userInteracted = false;
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
      void evaluate();
    }

    function handleContentMessage(message: ContentMessage): void {
      if (message.type !== MESSAGE_TYPES.siteRegistered || message.origin !== origin) {
        return;
      }

      const candidate = findLoginForm();
      if (!candidate) {
        return;
      }

      reportedForms.delete(candidate.form);
      inFlightForms.delete(candidate.form);
      const state = getFormState(candidate.form);
      state.lastShape = '';
      state.userInteracted = false;
      void evaluate();
    }

    observeForms();

    const onRuntimeMessage = (message: unknown): void => {
      if (typeof message === 'object' && message !== null && 'type' in message && 'origin' in message) {
        handleContentMessage(message as ContentMessage);
      }
    };
    browser.runtime.onMessage.addListener(onRuntimeMessage);

    const observer = new MutationObserver(() => {
      observeForms();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    });

    for (const delay of [100, 300, 700, 1500, 3000]) {
      ctx.setTimeout(() => void evaluate(), delay);
    }
  },
});
