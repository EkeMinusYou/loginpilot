import { defineContentScript } from 'wxt/utils/define-content-script';
import { findPasskeyLoginButton } from '../shared/passkey-login';
import { observePasskeyUsage, PASSKEY_USAGE_EVENT } from '../shared/passkey-usage';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if (!globalThis.isSecureContext || !navigator.credentials) return;
    observePasskeyUsage(navigator.credentials, () => findPasskeyLoginButton() !== null, () => {
      // No credential, account ID, challenge or signature crosses the world boundary.
      document.dispatchEvent(new Event(PASSKEY_USAGE_EVENT));
    });
  },
});
