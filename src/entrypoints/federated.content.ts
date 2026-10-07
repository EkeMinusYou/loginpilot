import { browser, type Browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { FederatedLoginController, findFederatedLoginButtons } from '../shared/federated-login';
import { normalizeOrigin } from '../shared/origins';
import { isContentMessage } from '../shared/message-validation';
import { MESSAGE_TYPES, type AutofillResponse, type CredentialSetupResponse } from '../shared/messages';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  runAt: 'document_start',
  main(ctx) {
    const origin = normalizeOrigin(location.href);
    if (!origin || window.top !== window || !globalThis.isSecureContext) return;
    const login = new FederatedLoginController({
      root: document,
      // SSR buttons may be visible before the site's module handlers are attached.
      canStart: () => !ctx.isInvalid && document.visibilityState === 'visible' && document.readyState === 'complete',
      getPolicy: async () => await browser.runtime.sendMessage({ type: MESSAGE_TYPES.getFederatedPolicy, origin }) as AutofillResponse,
    });
    let scheduled = false;
    const evaluate = (): void => {
      if (scheduled || ctx.isInvalid) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; if (!ctx.isInvalid) void login.evaluate(); });
    };
    const onInteraction = (event: Event): void => {
      if (!event.isTrusted || ctx.isInvalid) return;
      login.markUserInteraction();
      if (event.type !== 'click' || !(event.target instanceof Element)) return;
      const target = event.target;
      const candidate = findFederatedLoginButtons().find(({ control }) => control === target || control.contains(target));
      if (candidate) {
        // Store only a provider/origin hint before navigation, never an OAuth URL or token.
        void browser.runtime.sendMessage({ type: MESSAGE_TYPES.federatedUsed, origin, provider: candidate.provider }).catch(() => {});
      }
    };
    const onStorageChanged = (changes: Record<string, unknown>, area: string): void => {
      if (area !== 'local' || !['registeredOrigins', 'passkeyOrigins', 'federatedProviders'].some((key) => key in changes)) return;
      login.invalidatePolicy();
      evaluate();
    };
    const onMessage = (message: unknown, sender: Browser.runtime.MessageSender): Promise<CredentialSetupResponse> | undefined => {
      if (ctx.isInvalid || sender.id !== browser.runtime.id || sender.tab !== undefined || !isContentMessage(message) ||
        message.type !== MESSAGE_TYPES.siteRegistered || message.origin !== origin) return;
      return login.evaluate(true).then((started) => started ? { ok: true, filled: true } : { ok: false, error: 'federatedUnavailable' });
    };
    browser.runtime.onMessage.addListener(onMessage);
    browser.storage.onChanged.addListener(onStorageChanged);
    for (const type of ['keydown', 'beforeinput', 'paste', 'click']) document.addEventListener(type, onInteraction, { capture: true, passive: true });
    document.addEventListener('visibilitychange', evaluate);
    document.addEventListener('readystatechange', evaluate);
    const observer = new MutationObserver(evaluate);
    observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'aria-label', 'aria-labelledby', 'aria-hidden', 'hidden', 'inert', 'value', 'style', 'class', 'autocomplete', 'type', 'role', 'href'] });
    ctx.setInterval(evaluate, 500);
    evaluate();
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorageChanged);
      document.removeEventListener('visibilitychange', evaluate);
      document.removeEventListener('readystatechange', evaluate);
      for (const type of ['keydown', 'beforeinput', 'paste', 'click']) document.removeEventListener(type, onInteraction, true);
    });
  },
});
