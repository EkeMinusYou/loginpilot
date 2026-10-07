import { browser, type Browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { PASSKEY_ACCOUNT_INPUT_DELAY_MS, PasskeyLoginController, hasVisibleAuthenticationFrame } from '../shared/passkey-login';
import { normalizeOrigin } from '../shared/origins';
import { isContentMessage } from '../shared/message-validation';
import { MESSAGE_TYPES, type AutofillResponse, type CredentialSetupResponse, type PasskeyFrameResponse } from '../shared/messages';
import { PASSKEY_USAGE_EVENT } from '../shared/passkey-usage';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_start',
  main(ctx) {
    const origin = normalizeOrigin(location.href);
    if (!origin || !globalThis.isSecureContext) return;
    const login = new PasskeyLoginController({
      root: document,
      canStart: () => !ctx.isInvalid && document.visibilityState === 'visible',
      getPolicy: async () => await browser.runtime.sendMessage({ type: MESSAGE_TYPES.getPasskeyPolicy, origin }) as AutofillResponse,
    });
    let accountInputTimer: number | undefined;
    const clearAccountInputTimer = (): void => {
      if (accountInputTimer !== undefined) clearTimeout(accountInputTimer);
      accountInputTimer = undefined;
    };
    let usageReported = false;
    const onPasskeyUsed = (): void => {
      if (usageReported || ctx.isInvalid || document.visibilityState !== 'visible') return;
      usageReported = true;
      // Page-world events are untrusted hints. Derive the origin here, and let
      // the background validate the sender; only the popup may approve a site.
      void browser.runtime.sendMessage({ type: MESSAGE_TYPES.passkeyUsed, origin }).catch(() => {
        usageReported = false;
      });
    };
    document.addEventListener(PASSKEY_USAGE_EVENT, onPasskeyUsed);
    const onUserInteraction = (event: Event): void => {
      if (!event.isTrusted) return;
      const input = event.target;
      if (input instanceof HTMLInputElement &&
        input.matches('input[type="email"], input[autocomplete~="username" i]') &&
        !(event instanceof KeyboardEvent && event.key === 'Escape')) {
        login.pauseForAccountInput();
        clearAccountInputTimer();
        accountInputTimer = ctx.setTimeout(() => {
          accountInputTimer = undefined;
          void login.evaluate();
        }, PASSKEY_ACCOUNT_INPUT_DELAY_MS);
      } else {
        clearAccountInputTimer();
        login.markUserInteraction();
      }
    };
    for (const type of ['keydown', 'beforeinput', 'paste', 'click']) {
      document.addEventListener(type, onUserInteraction, { capture: true, passive: true });
    }
    const onMessage = (message: unknown, sender: Browser.runtime.MessageSender): Promise<CredentialSetupResponse | PasskeyFrameResponse> | undefined => {
      if (ctx.isInvalid || sender.id !== browser.runtime.id || sender.tab !== undefined || !isContentMessage(message)) return;
      if (message.type === MESSAGE_TYPES.checkPasskeyFrame && window.top === window) {
        if (message.origin !== undefined && message.origin !== origin) return;
        return Promise.resolve({ ok: true, visible: !ctx.isInvalid && document.visibilityState === 'visible' &&
          hasVisibleAuthenticationFrame(message.authenticationOrigin), origin });
      }
      if (message.origin !== origin) return;
      if (message.type === MESSAGE_TYPES.startPasskeyLogin) {
        return login.evaluate(true).then((started) => started
          ? { ok: true, filled: true }
          : { ok: false, error: 'passkeyUnavailable' });
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    let evaluationScheduled = false;
    const evaluate = (): void => {
      if (evaluationScheduled || ctx.isInvalid) return;
      evaluationScheduled = true;
      queueMicrotask(() => {
        evaluationScheduled = false;
        if (!ctx.isInvalid) void login.evaluate();
      });
    };
    const onStorageChanged = (changes: Record<string, unknown>, area: string): void => {
      if (area !== 'local' || !['registeredOrigins', 'passkeyOrigins', 'passkeyFrameOrigins', 'federatedProviders'].some((key) => key in changes)) return;
      login.invalidatePolicy();
      evaluate();
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    const observer = new MutationObserver(() => { login.invalidateCandidates(); evaluate(); });
    observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'aria-label', 'aria-labelledby', 'aria-hidden', 'hidden', 'inert', 'value', 'style', 'class', 'autocomplete', 'type', 'role', 'id'] });
    document.addEventListener('visibilitychange', evaluate);
    void login.evaluate();
    // CSS transitions and layout changes can make a button available without a DOM mutation.
    ctx.setInterval(evaluate, 250);
    ctx.onInvalidated(() => {
      clearAccountInputTimer();
      document.removeEventListener('visibilitychange', evaluate);
      document.removeEventListener(PASSKEY_USAGE_EVENT, onPasskeyUsed);
      observer.disconnect();
      browser.storage.onChanged.removeListener(onStorageChanged);
      browser.runtime.onMessage.removeListener(onMessage);
      for (const type of ['keydown', 'beforeinput', 'paste', 'click']) {
        document.removeEventListener(type, onUserInteraction, true);
      }
    });
  },
});
