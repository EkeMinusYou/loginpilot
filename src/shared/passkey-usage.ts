export const PASSKEY_USAGE_EVENT = 'login-pilot:passkey-used';

// This observer runs in the page's world. Its signal is only a registration hint,
// never proof that can authorize an origin or change a saved login preference.
export function observePasskeyUsage(
  credentials: CredentialsContainer,
  hasExplicitPasskeyButton: () => boolean,
  report: () => void,
): () => void {
  const original = credentials.get;
  const descriptor = Object.getOwnPropertyDescriptor(credentials, 'get');
  const then = Promise.prototype.then;
  const AssertionResponse = globalThis.AuthenticatorAssertionResponse;
  if (typeof original !== 'function' || typeof AssertionResponse !== 'function') return () => {};

  const wrapped = new Proxy(original, {
    apply(target, receiver, args: [CredentialRequestOptions?]) {
      // Preserve the native receiver, arguments, synchronous errors and promise.
      const result = Reflect.apply(target, receiver, args) as Promise<Credential | null>;
      try {
        const options = args[0];
        const publicKey = options?.publicKey;
        const allowed = publicKey?.allowCredentials;
        // An allow-list-only WebAuthn request may be a security-key second factor.
        // Prefer discoverable requests, or an explicitly identified passkey flow.
        const passkeyFlow = publicKey && (options?.mediation === 'conditional' ||
          allowed === undefined || allowed.length === 0 || hasExplicitPasskeyButton());
        if (passkeyFlow) {
          then.call(result, (credential: Credential | null) => {
            try {
              if (credential?.type === 'public-key' &&
                (credential as PublicKeyCredential).response instanceof AssertionResponse) report();
            } catch {
              // Reporting must never affect the site's authentication result.
            }
          }, () => {});
        }
      } catch {
        // Unusual options or unavailable hooks leave native authentication intact.
      }
      return result;
    },
  });
  try {
    Object.defineProperty(credentials, 'get', { configurable: true, writable: true,
      enumerable: descriptor?.enumerable ?? false, value: wrapped });
  } catch {
    return () => {};
  }
  return () => {
    if (credentials.get !== wrapped) return;
    if (descriptor) Object.defineProperty(credentials, 'get', descriptor);
    else Reflect.deleteProperty(credentials, 'get');
  };
}
