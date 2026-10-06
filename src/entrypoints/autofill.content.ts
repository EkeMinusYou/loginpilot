import { browser, type Browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { findLoginForm } from '../shared/form-detector';
import { PasswordLoginController } from '../shared/password-login';
import { MESSAGE_TYPES, type AutofillResponse, type CredentialSetupResponse } from '../shared/messages';
import { normalizeOrigin } from '../shared/origins';
import { isContentMessage } from '../shared/message-validation';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  main(ctx) {
    const origin = normalizeOrigin(location.href);
    if (!origin || window.top !== window) return;
    const login = new PasswordLoginController({
      canStart: () => !ctx.isInvalid && document.visibilityState === 'visible',
      getPolicy: async () => await browser.runtime.sendMessage({ type: MESSAGE_TYPES.getLoginPolicy, origin }) as AutofillResponse,
      reportCandidate: async () => await browser.runtime.sendMessage({ type: MESSAGE_TYPES.autofillDetected, origin }) as AutofillResponse,
      schedule: (callback) => { ctx.setTimeout(callback, 0); },
    });
    const evaluate = (): void => { void login.evaluate(); };
    const onInteraction = (event: Event): void => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target.form) login.markUserInteraction(target.form);
    };
    const onFocus = (): void => {
      evaluate();
      for (const delay of [100, 500, 1500]) ctx.setTimeout(evaluate, delay);
    };
    const observeForms = (): void => {
      if (ctx.isInvalid) return;
      const candidate = findLoginForm();
      if (candidate) {
        for (const input of [candidate.usernameInput, candidate.passwordInput]) {
          if (!input.getAttribute('autocomplete')) {
            input.setAttribute('autocomplete', input.type.toLowerCase() === 'password' ? 'current-password' : 'username');
          }
        }
      }
      evaluate();
    };
    const onRuntimeMessage = (message: unknown, sender: Browser.runtime.MessageSender): Promise<CredentialSetupResponse> | undefined => {
      if (ctx.isInvalid || sender.id !== browser.runtime.id || sender.tab !== undefined || !isContentMessage(message) ||
        message.type !== MESSAGE_TYPES.siteRegistered || message.origin !== origin) return;
      const candidate = findLoginForm();
      if (!candidate) return Promise.resolve({ ok: false, error: 'メールアドレスとパスワードの入力欄があるページで設定してください。' });
      return login.register(candidate).then((filled) => ({ ok: true, filled }));
    };
    const onStorageChanged = (changes: Record<string, unknown>, area: string): void => {
      if (area !== 'local' || !['registeredOrigins', 'passkeyOrigins', 'passkeyFrameOrigins'].some((key) => key in changes)) return;
      login.invalidatePolicy();
      evaluate();
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    for (const type of ['keydown', 'beforeinput', 'paste']) document.addEventListener(type, onInteraction, { capture: true, passive: true });
    for (const type of ['input', 'change', 'visibilitychange']) document.addEventListener(type, evaluate, { passive: true });
    document.addEventListener('focusin', onFocus, { passive: true });
    const observer = new MutationObserver(observeForms);
    observer.observe(document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['autocomplete', 'type', 'disabled', 'readonly', 'hidden', 'inert', 'aria-disabled', 'aria-hidden', 'style', 'class'] });
    ctx.setInterval(evaluate, 1000);
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.storage.onChanged.removeListener(onStorageChanged);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      for (const type of ['keydown', 'beforeinput', 'paste']) document.removeEventListener(type, onInteraction, true);
      for (const type of ['input', 'change', 'visibilitychange']) document.removeEventListener(type, evaluate);
      document.removeEventListener('focusin', onFocus);
    });
    observeForms();
    for (const delay of [100, 300, 700, 1500, 3000]) ctx.setTimeout(evaluate, delay);
  },
});
