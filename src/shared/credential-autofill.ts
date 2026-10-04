import type { LoginFormCandidate } from './form-detector';

/** Keep password credentials inside the page; never return them to extension messaging. */
export async function fillStoredCredentials(
  candidate: LoginFormCandidate,
  mediation: 'silent' | 'optional',
  canFill: () => boolean,
): Promise<boolean> {
  const { usernameInput, passwordInput } = candidate;
  const initialUsername = usernameInput.value;
  const initialPassword = passwordInput.value;
  if (!canFill() || (initialPassword && mediation === 'silent') || !globalThis.isSecureContext || !navigator.credentials?.get) return false;

  try {
    // PasswordCredential is supported by Chrome but is absent from TypeScript's DOM definitions.
    const options: CredentialRequestOptions & { password: true } = { password: true, mediation };
    const credential = await navigator.credentials.get(options);
    if (!credential || credential.type !== 'password' || !('password' in credential)) return false;
    const password = credential.password;
    if (typeof password !== 'string' || !password || !credential.id) return false;
    if (!canFill() || !candidate.form.isConnected || !usernameInput.isConnected || !passwordInput.isConnected) return false;
    if (usernameInput.value !== initialUsername || passwordInput.value !== initialPassword) return false;
    if (initialUsername && initialUsername.trim() !== credential.id) return false;
    if (initialPassword) return initialPassword === password;

    // Use the native setter so framework-controlled fields receive the new values on input/change.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) return false;
    setValue.call(usernameInput, credential.id);
    setValue.call(passwordInput, password);
    return true;
  } catch {
    // Cancellation, unavailable credentials, and browser policy must leave the form untouched.
    return false;
  }
}
