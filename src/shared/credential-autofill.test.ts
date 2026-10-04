import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillStoredCredentials } from './credential-autofill';
import type { LoginFormCandidate } from './form-detector';

class Input {
  isConnected = true;
  private currentValue = '';
  get value(): string { return this.currentValue; }
  set value(value: string) { this.currentValue = value; }
}

function candidate(): LoginFormCandidate {
  return {
    form: { isConnected: true } as HTMLFormElement,
    usernameInput: new Input() as unknown as HTMLInputElement,
    passwordInput: new Input() as unknown as HTMLInputElement,
  };
}

const stored = { type: 'password', id: 'review@example.com', password: 'fixture-password' };
const get = vi.fn();

beforeEach(() => {
  get.mockReset().mockResolvedValue(stored);
  vi.stubGlobal('navigator', { credentials: { get } });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('HTMLInputElement', Input);
});
afterEach(() => vi.unstubAllGlobals());

describe('fillStoredCredentials', () => {
  it('requests silent credentials and fills the form without returning credentials', async () => {
    const form = candidate();
    expect(await fillStoredCredentials(form, 'silent', () => true)).toBe(true);
    expect(get).toHaveBeenCalledWith({ password: true, mediation: 'silent' });
    expect(form.usernameInput.value).toBe(stored.id);
    expect(form.passwordInput.value).toBe(stored.password);
  });

  it('uses the browser account chooser only for explicit setup', async () => {
    expect(await fillStoredCredentials(candidate(), 'optional', () => true)).toBe(true);
    expect(get).toHaveBeenCalledWith({ password: true, mediation: 'optional' });
  });

  it.each([null, { type: 'public-key', id: 'passkey' }, { ...stored, password: '' }])(
    'leaves the form untouched when usable password credentials are unavailable (%j)', async (credential) => {
      get.mockResolvedValue(credential);
      const form = candidate();
      expect(await fillStoredCredentials(form, 'silent', () => true)).toBe(false);
      expect(form.usernameInput.value).toBe('');
      expect(form.passwordInput.value).toBe('');
    },
  );

  it('handles browser refusal without throwing', async () => {
    get.mockRejectedValue(new Error('NotAllowedError'));
    expect(await fillStoredCredentials(candidate(), 'optional', () => true)).toBe(false);
  });

  it('does not request credentials on insecure pages or when interaction prevents filling', async () => {
    expect(await fillStoredCredentials(candidate(), 'silent', () => false)).toBe(false);
    vi.stubGlobal('isSecureContext', false);
    expect(await fillStoredCredentials(candidate(), 'silent', () => true)).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('does not replace a different prefilled account', async () => {
    const form = candidate();
    form.usernameInput.value = 'another@example.com';
    expect(await fillStoredCredentials(form, 'silent', () => true)).toBe(false);
    expect(form.usernameInput.value).toBe('another@example.com');
    expect(form.passwordInput.value).toBe('');
  });

  it('does not overwrite values edited while awaiting the browser', async () => {
    const form = candidate();
    get.mockImplementation(async () => {
      form.usernameInput.value = 'typed@example.com';
      return stored;
    });
    expect(await fillStoredCredentials(form, 'silent', () => true)).toBe(false);
    expect(form.usernameInput.value).toBe('typed@example.com');
    expect(form.passwordInput.value).toBe('');
  });

  it('does not fill if the page was hidden or the user started editing during the request', async () => {
    const form = candidate();
    let allowed = true;
    get.mockImplementation(async () => { allowed = false; return stored; });
    expect(await fillStoredCredentials(form, 'silent', () => allowed)).toBe(false);
    expect(form.passwordInput.value).toBe('');
  });

  it('does not fill a form removed during the request', async () => {
    const form = candidate();
    get.mockImplementation(async () => {
      Object.assign(form.form, { isConnected: false });
      return stored;
    });
    expect(await fillStoredCredentials(form, 'silent', () => true)).toBe(false);
    expect(form.passwordInput.value).toBe('');
  });

  it('does not request silent credentials over an existing password', async () => {
    const form = candidate();
    form.passwordInput.value = 'typed-password';
    expect(await fillStoredCredentials(form, 'silent', () => true)).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('leaves ordinary autofill available when the browser has no credential API', async () => {
    vi.stubGlobal('navigator', {});
    expect(await fillStoredCredentials(candidate(), 'silent', () => true)).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('allows explicit browser setup for an already filled account without replacing its values', async () => {
    const form = candidate();
    form.usernameInput.value = stored.id;
    form.passwordInput.value = stored.password;
    expect(await fillStoredCredentials(form, 'optional', () => true)).toBe(true);
    expect(get).toHaveBeenCalledOnce();
  });
});
