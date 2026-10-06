import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observePasskeyUsage } from './passkey-usage';

class AssertionResponse {}
const assertion = { type: 'public-key', response: new AssertionResponse() } as unknown as Credential;
const options: CredentialRequestOptions = { publicKey: { challenge: new Uint8Array([1]) } };

beforeEach(() => vi.stubGlobal('AuthenticatorAssertionResponse', AssertionResponse));
afterEach(() => vi.unstubAllGlobals());

function setup(result: Promise<Credential | null>, explicitButton = false) {
  const get = vi.fn(function (this: CredentialsContainer, _options?: CredentialRequestOptions) { return result; });
  const create = vi.fn(async () => assertion);
  const credentials = { get, create } as unknown as CredentialsContainer;
  const report = vi.fn();
  const restore = observePasskeyUsage(credentials, () => explicitButton, report);
  return { credentials, get, create, report, restore };
}

describe('passkey usage observer', () => {
  it('reports completion without changing the native promise, receiver, arguments or credential', async () => {
    const result = Promise.resolve(assertion);
    const { credentials, get, report } = setup(result);
    expect(credentials.get(options)).toBe(result);
    expect(get.mock.contexts[0]).toBe(credentials);
    expect(get.mock.calls[0]![0]).toBe(options);
    expect(await result).toBe(assertion);
    expect(report).toHaveBeenCalledExactlyOnceWith();
  });

  it('does not report a request before it completes', async () => {
    const deferred = Promise.withResolvers<Credential | null>();
    const { credentials, report } = setup(deferred.promise);
    credentials.get(options);
    expect(report).not.toHaveBeenCalled();
    deferred.resolve(assertion);
    await deferred.promise;
    expect(report).toHaveBeenCalledOnce();
  });

  it('does not report cancelled or rejected requests and preserves the rejection', async () => {
    const error = new DOMException('Cancelled', 'NotAllowedError');
    const result = Promise.reject(error);
    const { credentials, report } = setup(result);
    expect(credentials.get(options)).toBe(result);
    await expect(result).rejects.toBe(error);
    expect(report).not.toHaveBeenCalled();
  });

  it.each([null, { type: 'password' }, { type: 'public-key', response: {} }])(
    'ignores missing, password and attestation results: %j', async (value) => {
      const result = Promise.resolve(value as Credential | null);
      const { credentials, report } = setup(result);
      await credentials.get(options);
      expect(report).not.toHaveBeenCalled();
    },
  );

  it('does not observe credential creation or password retrieval', async () => {
    const { credentials, create, report } = setup(Promise.resolve(assertion));
    await credentials.create();
    await credentials.get({ password: true } as CredentialRequestOptions);
    expect(create).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });

  it('avoids treating an ambiguous security-key second factor as passkey usage', async () => {
    const { credentials, report } = setup(Promise.resolve(assertion));
    await credentials.get({ publicKey: { challenge: new Uint8Array([1]),
      allowCredentials: [{ type: 'public-key', id: new Uint8Array([2]) }] } });
    expect(report).not.toHaveBeenCalled();
  });

  it('recognizes an allow-listed credential when the page explicitly identifies a passkey flow', async () => {
    const { credentials, report } = setup(Promise.resolve(assertion), true);
    await credentials.get({ publicKey: { challenge: new Uint8Array([1]),
      allowCredentials: [{ type: 'public-key', id: new Uint8Array([2]) }] } });
    expect(report).toHaveBeenCalledExactlyOnceWith();
  });

  it('recognizes conditional requests and empty allow lists without an explicit button', async () => {
    const { credentials, report } = setup(Promise.resolve(assertion));
    await credentials.get({ ...options, mediation: 'conditional' });
    await credentials.get({ publicKey: { challenge: new Uint8Array([1]), allowCredentials: [] } });
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('never reads credential identifiers, challenge, signature or assertion bytes', async () => {
    const sensitiveRead = vi.fn(() => { throw new Error('Sensitive value accessed'); });
    const response = Object.create(AssertionResponse.prototype);
    for (const name of ['signature', 'authenticatorData', 'clientDataJSON', 'userHandle']) {
      Object.defineProperty(response, name, { get: sensitiveRead });
    }
    const credential = Object.assign(Object.create(null), { type: 'public-key', response });
    for (const name of ['id', 'rawId']) Object.defineProperty(credential, name, { get: sensitiveRead });
    const publicKey = { allowCredentials: [] };
    Object.defineProperty(publicKey, 'challenge', { get: sensitiveRead });
    const { credentials, report } = setup(Promise.resolve(credential));
    await credentials.get({ publicKey } as unknown as CredentialRequestOptions);
    expect(report).toHaveBeenCalledExactlyOnceWith();
    expect(sensitiveRead).not.toHaveBeenCalled();
  });

  it('keeps authentication intact when reporting throws', async () => {
    const result = Promise.resolve(assertion);
    const credentials = { get: vi.fn(() => result) } as unknown as CredentialsContainer;
    const report = vi.fn(() => { throw new Error('No bridge'); });
    observePasskeyUsage(credentials, () => false, report);
    expect(await credentials.get(options)).toBe(assertion);
    expect(report).toHaveBeenCalledOnce();
  });

  it('preserves synchronous errors from the original method', () => {
    const error = new TypeError('Illegal receiver');
    const get = vi.fn(() => { throw error; });
    const credentials = { get } as unknown as CredentialsContainer;
    const report = vi.fn();
    observePasskeyUsage(credentials, () => false, report);
    expect(() => credentials.get(options)).toThrow(error);
    expect(report).not.toHaveBeenCalled();
  });

  it('leaves an immutable method intact and restores an inherited method cleanly', async () => {
    const get = vi.fn(async () => assertion);
    const credentials = Object.create({ get }) as CredentialsContainer;
    const restore = observePasskeyUsage(credentials, () => false, vi.fn());
    expect(credentials.get).not.toBe(get);
    restore();
    expect(Object.hasOwn(credentials, 'get')).toBe(false);
    expect(credentials.get).toBe(get);
    Object.defineProperty(credentials, 'get', { value: get, writable: false, configurable: false });
    observePasskeyUsage(credentials, () => false, vi.fn());
    expect(credentials.get).toBe(get);
    expect(await credentials.get(options)).toBe(assertion);
  });
});
