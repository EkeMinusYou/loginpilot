import { browser, type Browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { PasskeyLoginController, hasVisibleAuthenticationFrame } from '../shared/passkey-login';
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
      reportCandidate: async () => await browser.runtime.sendMessage({ type: MESSAGE_TYPES.passkeyDetected, origin }) as AutofillResponse,
    });
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
      } else {
        login.markUserInteraction();
      }
    };
    for (const type of ['keydown', 'beforeinput', 'paste', 'click']) {
      document.addEventListener(type, onUserInteraction, { capture: true, passive: true });
    }
    const onMessage = (message: unknown, sender: Browser.runtime.MessageSender): Promise<CredentialSetupResponse | PasskeyFrameResponse> | undefined => {
      if (sender.id !== browser.runtime.id || sender.tab !== undefined || !isContentMessage(message) || message.origin !== origin) return;
      if (message.type === MESSAGE_TYPES.checkPasskeyFrame && window.top === window) {
        return Promise.resolve({ ok: true, visible: !ctx.isInvalid && document.visibilityState === 'visible' &&
          hasVisibleAuthenticationFrame(message.authenticationOrigin) });
      }
      if (message.type === MESSAGE_TYPES.startPasskeyLogin) {
        return login.evaluate(true).then((started) => started
          ? { ok: true, filled: true }
          : { ok: false, error: 'パスキーのログインボタンを開始できませんでした。対象ページで手動ログインしてください。' });
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    const observer = new MutationObserver(() => void login.evaluate());
    observer.observe(document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'aria-label', 'aria-labelledby', 'hidden', 'style', 'class'] });
    void login.evaluate();
    ctx.setInterval(() => void login.evaluate(), 1000);
    ctx.onInvalidated(() => {
      document.removeEventListener(PASSKEY_USAGE_EVENT, onPasskeyUsed);
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onMessage);
      for (const type of ['keydown', 'beforeinput', 'paste', 'click']) {
        document.removeEventListener(type, onUserInteraction, true);
      }
    });
  },
});
