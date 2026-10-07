import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';

const mocks = vi.hoisted(() => ({
  browser: {
    i18n: { getUILanguage: vi.fn(() => 'ja') },
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test-extension${path}`, onMessage: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
    tabs: { get: vi.fn(), sendMessage: vi.fn() },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    notifications: { create: vi.fn(), clear: vi.fn(), onClicked: { addListener: vi.fn() } },
  },
}));
vi.mock('wxt/browser', () => ({ browser: mocks.browser }));

import background from '../entrypoints/background';
import { MESSAGE_TYPES } from './messages';

const popup = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
const content = { id: 'test-extension', url: 'https://example.com/login', tab: { id: 1 }, frameId: 0 };
const origin = 'https://example.com';
let stored: Record<string, unknown>;

function dispatch(message: unknown, sender: object = popup): Promise<unknown> {
  const listener = mocks.browser.runtime.onMessage.addListener.mock.calls[0]![0];
  return new Promise((resolve) => {
    const handled = listener(message, sender as Browser.runtime.MessageSender, resolve);
    if (!handled) resolve(undefined);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browser.i18n.getUILanguage.mockReturnValue('ja');
  stored = { registeredOrigins: [origin] };
  mocks.browser.storage.local.get.mockImplementation(async (key: string | string[]) => Object.fromEntries((Array.isArray(key) ? key : [key]).map((item) => [item, stored[item]])));
  mocks.browser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(stored, values); });
  mocks.browser.storage.local.remove.mockImplementation(async (key: string) => { delete stored[key]; });
  mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: `${origin}/login` });
  mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, filled: true });
  background.main();
});

describe('background message handling', () => {
  it.each([
    { type: MESSAGE_TYPES.passkeyDetected, origin },
    { type: MESSAGE_TYPES.federatedDetected, origin, provider: 'google' },
  ])('does not offer registration for unused login buttons (%j)', async (message) => {
    stored.registeredOrigins = [];
    expect(await dispatch(message, content)).toEqual({ ok: true, action: 'ignore' });
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({ pendingSite: null });
    expect(mocks.browser.notifications.create).not.toHaveBeenCalled();
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it.each([
    { origin, method: 'passkey', detectedAt: 1 },
    { origin, method: 'federated', provider: 'google', detectedAt: 1 },
  ])('hides old passive registration candidates after an update (%j)', async (pendingSite) => {
    stored.registeredOrigins = [];
    stored.pendingSite = pendingSite;
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({ pendingSite: null });
  });

  it('retains manual password login evidence and its origin after navigation', async () => {
    stored.registeredOrigins = [];
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: 'https://destination.example/home' });
    expect(await dispatch({ type: MESSAGE_TYPES.passwordUsed, origin }, content)).toEqual({ ok: true, action: 'pending' });
    await dispatch({ type: MESSAGE_TYPES.autofillDetected, origin }, content);
    expect(stored.pendingSite).toMatchObject({ origin, passwordUsed: true });
    expect(stored.registeredOrigins).toEqual([]);
    expect(mocks.browser.notifications.create).toHaveBeenCalledOnce();
    expect(mocks.browser.tabs.get).not.toHaveBeenCalled();
  });

  it('ignores manual password submission on registered sites', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.passwordUsed, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    expect(stored.pendingSite).toBeUndefined();
    expect(mocks.browser.notifications.create).not.toHaveBeenCalled();
  });
  it('registers an external provider and denies password and passkey automation on that site', async () => {
    stored.registeredOrigins = [];
    await dispatch({ type: MESSAGE_TYPES.federatedUsed, origin, provider: 'google' }, content);
    expect(stored.pendingSite).toMatchObject({ origin, method: 'federated', provider: 'google' });
    expect(await dispatch({ type: MESSAGE_TYPES.getFederatedPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'federated', provider: 'google', tabId: 1 });
    expect(stored.federatedProviders).toEqual({ [origin]: 'google' });
    expect(await dispatch({ type: MESSAGE_TYPES.getFederatedPolicy, origin }, content)).toEqual({ ok: true, action: 'submit', method: 'federated', provider: 'google' });
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore', method: 'federated' });
    expect(await dispatch({ type: MESSAGE_TYPES.autofillDetected, origin }, content)).toEqual({ ok: true, action: 'ignore', method: 'federated' });
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    expect(mocks.browser.tabs.sendMessage).toHaveBeenLastCalledWith(1, { type: MESSAGE_TYPES.siteRegistered, origin }, { frameId: 0 });
  });
  it('keeps a manually chosen external provider over later detection hints', async () => {
    stored.registeredOrigins = [];
    await dispatch({ type: MESSAGE_TYPES.federatedUsed, origin, provider: 'google' }, content);
    await dispatch({ type: MESSAGE_TYPES.autofillDetected, origin }, content);
    await dispatch({ type: MESSAGE_TYPES.federatedDetected, origin, provider: 'apple' }, content);
    expect(stored.pendingSite).toMatchObject({ method: 'federated', provider: 'google', federatedUsed: true });
    expect(stored.registeredOrigins).toEqual([]);
    await dispatch({ type: MESSAGE_TYPES.federatedUsed, origin, provider: 'apple' }, content);
    expect(stored.pendingSite).toMatchObject({ provider: 'apple', federatedUsed: true });
  });
  it('never changes a registered password or passkey site after external login use', async () => {
    for (const passkeyOrigins of [[], [origin]]) {
      stored.passkeyOrigins = passkeyOrigins;
      expect(await dispatch({ type: MESSAGE_TYPES.federatedUsed, origin, provider: 'google' }, content)).toEqual({ ok: true, action: 'ignore' });
      expect(stored.pendingSite).toBeUndefined();
      expect(await dispatch({ type: MESSAGE_TYPES.getFederatedPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    }
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });
  it('requires removal before changing a provider and deletes its preferences on removal', async () => {
    stored.federatedProviders = { [origin]: 'google' };
    for (const change of [{ method: 'federated', provider: 'apple' }, { method: 'password' }, { method: 'passkey' }]) {
      expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, ...change })).toEqual({ ok: false, error: 'reregisterToChangeMethod' });
    }
    expect(stored.federatedProviders).toEqual({ [origin]: 'google' });
    await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin });
    expect(stored.federatedProviders).toEqual({});
    expect(await dispatch({ type: MESSAGE_TYPES.getFederatedPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'federated', provider: 'apple' })).toMatchObject({ ok: true, federatedProviders: { [origin]: 'apple' } });
  });
  it('rejects insecure external login registration and ignores iframe detection', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin: 'http://example.com', method: 'federated', provider: 'google' })).toEqual({ ok: false, error: 'federatedHttpsOnly' });
    expect(await dispatch({ type: MESSAGE_TYPES.federatedDetected, origin, provider: 'google' }, { ...content, frameId: 1 })).toEqual({ ok: false, error: 'operationNotAllowed' });
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });
  it('ignores unknown providers and storage entries that belong to unregistered sites', async () => {
    stored.federatedProviders = { [origin]: 'unknown', 'https://other.example': 'google' };
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({ federatedProviders: {} });
    expect(await dispatch({ type: MESSAGE_TYPES.federatedUsed, origin, provider: 'unknown' }, content)).toBeUndefined();
    stored.pendingSite = { origin, method: 'federated', detectedAt: 1, provider: 'unknown' };
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({ pendingSite: null });
  });
  it('uses the saved display language for site notifications', async () => {
    stored.registeredOrigins = [];
    stored.language = 'en';
    await dispatch({ type: MESSAGE_TYPES.autofillDetected, origin }, content);
    expect(mocks.browser.notifications.create).toHaveBeenCalledWith('auto-signin-site-detected', expect.objectContaining({
      message: `Login autofill detected on ${origin}. Open Login Pilot to register this site.`,
    }));
    stored.language = 'auto';
    await dispatch({ type: MESSAGE_TYPES.autofillDetected, origin }, content);
    expect(mocks.browser.notifications.create).toHaveBeenLastCalledWith('auto-signin-site-detected', expect.objectContaining({
      message: `${origin} でログイン情報の自動入力を検知しました。拡張機能を開いて登録できます。`,
    }));
  });
  it.each([MESSAGE_TYPES.registerOrigin, MESSAGE_TYPES.removeOrigin, MESSAGE_TYPES.getPopupState])(
    'rejects %s from content scripts without reading or changing storage', async (type) => {
      expect(await dispatch({ type, origin, currentOrigin: origin }, content)).toEqual({ ok: false, error: 'operationNotAllowed' });
      expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
      expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
    },
  );

  it('ignores malformed messages before accessing state', async () => {
    expect(await dispatch({ type: 'enable-credential-login', origin, tabId: '1' })).toBeUndefined();
    expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('allows an authorized popup to register and remove an origin', async () => {
    const added = 'https://another.example';
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin: added })).toMatchObject({ ok: true, registeredOrigins: [added, origin] });
    expect(stored.registeredOrigins).toEqual([added, origin]);
    await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin: added });
    expect(stored.registeredOrigins).toEqual([origin]);
  });

  it('only authorizes registered origins for matching top-level content scripts', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'submit' });
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, { ...content, frameId: 1 })).toEqual({ ok: false, error: 'operationNotAllowed' });
    stored.registeredOrigins = [];
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
  });

  it.each(['enable-credential-login', 'start-passkey-login'])('rejects obsolete popup command %s', async (type) => {
    expect(await dispatch({ type, origin, tabId: 1 })).toBeUndefined();
    expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
  });

  it('does not forward registration notifications to a different origin', async () => {
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: 'https://another.example/login' });
    await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, tabId: 1 });
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('preserves the password method for existing installations', async () => {
    const state = await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin });
    expect(state).toMatchObject({ registeredOrigins: [origin], passkeyOrigins: [] });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyDetected, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    expect(mocks.browser.notifications.create).not.toHaveBeenCalled();
  });

  it('registers a passkey site and blocks password submission on it', async () => {
    stored.registeredOrigins = [];
    await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, content);
    expect(stored.pendingSite).toMatchObject({ origin, method: 'passkey', passkeyUsed: true });
    await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'passkey', tabId: 1 });
    expect(stored.passkeyOrigins).toEqual([origin]);
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'submit', method: 'passkey' });
    expect(await dispatch({ type: MESSAGE_TYPES.autofillDetected, origin }, content)).toEqual({ ok: true, action: 'ignore', method: 'passkey' });
    expect(mocks.browser.tabs.sendMessage).toHaveBeenLastCalledWith(1, { type: MESSAGE_TYPES.startPasskeyLogin, origin }, { frameId: 0 });
  });

  it('ignores the removed method change command', async () => {
    expect(await dispatch({ type: 'set-login-method', origin, method: 'passkey' })).toBeUndefined();
    expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it.each(['password', 'passkey'] as const)('requires removal before registering a different method from %s', async (method) => {
    stored.passkeyOrigins = method === 'passkey' ? [origin] : [];
    const nextMethod = method === 'passkey' ? 'password' : 'passkey';
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: nextMethod })).toEqual({
      ok: false, error: 'reregisterToChangeMethod',
    });
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
    expect(stored.passkeyOrigins).toEqual(method === 'passkey' ? [origin] : []);
    await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin });
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: nextMethod })).toMatchObject({ ok: true });
    expect(stored.registeredOrigins).toEqual([origin]);
    expect(stored.passkeyOrigins).toEqual(nextMethod === 'passkey' ? [origin] : []);
  });

  it('offers registration after passkey usage without granting automatic login', async () => {
    stored.registeredOrigins = [];
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, content)).toEqual({ ok: true, action: 'pending' });
    expect(stored.pendingSite).toMatchObject({ origin, method: 'passkey', passkeyUsed: true });
    expect(stored.registeredOrigins).toEqual([]);
    expect(stored.passkeyOrigins).toBeUndefined();
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({
      pendingSite: { origin, method: 'passkey', passkeyUsed: true },
    });
    await dispatch({ type: MESSAGE_TYPES.passkeyDetected, origin }, content);
    expect(stored.pendingSite).toMatchObject({ passkeyUsed: true });
    expect(mocks.browser.notifications.create).toHaveBeenCalledOnce();
  });

  it('ignores passkey usage on a registered password site without offering a switch', async () => {
    stored.language = 'en';
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    expect(stored.registeredOrigins).toEqual([origin]);
    expect(stored.passkeyOrigins).toBeUndefined();
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'submit' });
    expect(stored.pendingSite).toBeUndefined();
    expect(mocks.browser.notifications.create).not.toHaveBeenCalled();
  });

  it('does not offer a passkey frame candidate for a registered password site', async () => {
    const auth = 'https://idmsa.apple.com';
    const frame = { ...content, url: `${auth}/auth`, frameId: 3, documentId: 'auth-document' };
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: true });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyDetected, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore' });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore' });
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({ pendingSite: null });
    expect(mocks.browser.notifications.create).not.toHaveBeenCalled();
  });

  it('keeps the authenticating origin as the candidate when login immediately redirects the tab', async () => {
    stored.registeredOrigins = [];
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: 'https://destination.example/home' });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, content)).toEqual({ ok: true, action: 'pending' });
    expect(stored.pendingSite).toMatchObject({ origin, method: 'passkey', passkeyUsed: true });
    expect(stored.registeredOrigins).toEqual([]);
    expect(mocks.browser.tabs.get).not.toHaveBeenCalled();
  });

  it('does not re-prompt or re-authenticate an already approved passkey site after usage', async () => {
    stored.passkeyOrigins = [origin];
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    expect(stored.pendingSite).toBeUndefined();
    expect(mocks.browser.notifications.create).not.toHaveBeenCalled();
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps usage evidence and the parent/authentication pair after a frame policy refresh', async () => {
    const auth = 'https://idmsa.apple.com';
    const frame = { ...content, url: `${auth}/auth`, frameId: 3, documentId: 'auth-document' };
    stored.registeredOrigins = [];
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: true });
    await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin: auth }, frame);
    await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame);
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({
      pendingSite: { origin, authenticationOrigin: auth, method: 'passkey', passkeyUsed: true },
    });
    await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'passkey', authenticationOrigin: auth });
    expect(stored.passkeyOrigins).toEqual([origin]);
    expect(stored.passkeyFrameOrigins).toEqual({ [origin]: auth });
    expect(mocks.browser.tabs.sendMessage.mock.calls.every(([, message]) => message.type === MESSAGE_TYPES.checkPasskeyFrame)).toBe(true);
  });

  it('rejects forged usage senders before reading or changing stored preferences', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, popup)).toMatchObject({ ok: false });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin }, { ...content, url: 'https://other.example' })).toMatchObject({ ok: false });
    expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('accepts usage from a recently verified iframe removed after authentication, without trusting another document', async () => {
    const auth = 'https://idmsa.apple.com';
    const frame = { ...content, url: `${auth}/auth`, frameId: 3, documentId: 'auth-document' };
    stored.registeredOrigins = [];
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: true });
    await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame);
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: false });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin: auth }, { ...frame, documentId: 'another-document' })).toEqual({ ok: true, action: 'ignore' });
    expect(stored.pendingSite).toBeUndefined();
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin: auth }, frame)).toEqual({ ok: true, action: 'pending' });
    expect(stored.pendingSite).toMatchObject({ origin, authenticationOrigin: auth, passkeyUsed: true });
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore', retry: true });
    expect(stored.registeredOrigins).toEqual([]);
  });

  it('removes the method preference along with site registration', async () => {
    stored.passkeyOrigins = [origin];
    await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin });
    expect(stored.passkeyOrigins).toEqual([]);
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
  });

  it('registers an Apple authentication frame under its parent site and targets its document', async () => {
    const site = 'https://appstoreconnect.apple.com';
    const authenticationOrigin = 'https://idmsa.apple.com';
    const frame = { ...content, url: `${authenticationOrigin}/appleauth/auth/signin`, frameId: 3, documentId: 'apple-auth-document' };
    stored.registeredOrigins = [];
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: site });
    mocks.browser.tabs.sendMessage.mockImplementation(async (_tab, message) => message.type === MESSAGE_TYPES.checkPasskeyFrame
      ? { ok: true, visible: true } : { ok: true, filled: true });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin: authenticationOrigin }, frame)).toEqual({ ok: true, action: 'pending' });
    expect(stored.pendingSite).toMatchObject({ origin: site, method: 'passkey', authenticationOrigin });
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: authenticationOrigin }, frame)).toEqual({ ok: true, action: 'ignore' });
    await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin: site, method: 'passkey', authenticationOrigin, tabId: 1 });
    expect(stored.registeredOrigins).toEqual([site]);
    expect(stored.passkeyFrameOrigins).toEqual({ [site]: authenticationOrigin });
    await vi.waitFor(() => expect(mocks.browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: MESSAGE_TYPES.startPasskeyLogin, origin: authenticationOrigin }, { documentId: 'apple-auth-document' }));
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: authenticationOrigin }, frame)).toEqual({ ok: true, action: 'submit', method: 'passkey' });
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin: authenticationOrigin }, frame)).toMatchObject({ ok: false });
  });

  it('does not inherit permission from a registered authentication origin or another parent site', async () => {
    const auth = 'https://idmsa.apple.com';
    stored.registeredOrigins = [auth, 'https://appstoreconnect.apple.com'];
    stored.passkeyOrigins = [auth, 'https://appstoreconnect.apple.com'];
    stored.passkeyFrameOrigins = { 'https://appstoreconnect.apple.com': auth };
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: true });
    const frame = { ...content, url: `${auth}/auth`, frameId: 3 };
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore' });
    stored.registeredOrigins = [origin];
    stored.passkeyOrigins = [origin];
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore' });
    stored.passkeyFrameOrigins = { [origin]: auth };
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame)).toEqual({ ok: true, action: 'submit', method: 'passkey' });
  });

  it('rejects hidden frames and insecure embedding pages before reporting a candidate', async () => {
    const auth = 'https://idmsa.apple.com';
    const frame = { ...content, url: `${auth}/auth`, frameId: 3 };
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: false });
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyDetected, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore' });
    expect(stored.pendingSite).toBeUndefined();
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: 'http://example.com' });
    mocks.browser.tabs.sendMessage.mockClear();
    expect(await dispatch({ type: MESSAGE_TYPES.passkeyDetected, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore' });
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('does not replace an actual candidate with a cached but unused passkey frame', async () => {
    const auth = 'https://idmsa.apple.com';
    const frame = { ...content, url: `${auth}/auth`, frameId: 3, documentId: 'auth-document' };
    stored.registeredOrigins = [];
    mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: true });
    await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame);
    stored.pendingSite = { origin: 'https://another.example', detectedAt: 1 };
    expect(await dispatch({ type: MESSAGE_TYPES.getPopupState, currentOrigin: origin })).toMatchObject({ pendingSite: { origin: 'https://another.example' } });
  });

  it('rejects an authentication origin that was not detected', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'passkey', authenticationOrigin: 'https://forged.example' })).toMatchObject({ ok: false });
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('requires frame approval again after removal and denies a top-level flow when a frame is configured', async () => {
    stored.passkeyOrigins = [origin];
    stored.passkeyFrameOrigins = { [origin]: 'https://idmsa.apple.com' };
    expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
    await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin });
    expect(stored.passkeyFrameOrigins).toEqual({});
  });
});

it('authorizes a registered top-level passkey document without temporary tab URL access', async () => {
  stored.passkeyOrigins = [origin];
  mocks.browser.tabs.get.mockResolvedValue({ id: 1 });
  expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin }, content)).toEqual({ ok: true, action: 'submit', method: 'passkey' });
  expect(mocks.browser.tabs.get).not.toHaveBeenCalled();
});

it('gets the parent origin and frame visibility from the top-level script without tab URL access', async () => {
  const auth = 'https://auth.example';
  const frame = { ...content, url: `${auth}/login`, frameId: 3, documentId: 'auth-document' };
  stored.passkeyOrigins = [origin];
  stored.passkeyFrameOrigins = { [origin]: auth };
  mocks.browser.tabs.get.mockResolvedValue({ id: 1 });
  mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: true, origin });
  expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame)).toEqual({ ok: true, action: 'submit', method: 'passkey' });
  expect(mocks.browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: MESSAGE_TYPES.checkPasskeyFrame, authenticationOrigin: auth }, { frameId: 0 });
  mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, visible: false, origin });
  expect(await dispatch({ type: MESSAGE_TYPES.getPasskeyPolicy, origin: auth }, frame)).toEqual({ ok: true, action: 'ignore', retry: true });
  expect(await dispatch({ type: MESSAGE_TYPES.passkeyUsed, origin: auth }, { ...frame, documentId: 'different-document' })).toEqual({ ok: true, action: 'ignore' });
});

it('does not let notification failures turn a completed registration into a failure', async () => {
  stored.pendingSite = { origin, detectedAt: 1 };
  mocks.browser.notifications.clear.mockRejectedValueOnce(new Error('Notification unavailable'));
  expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'password' })).toMatchObject({ ok: true, registeredOrigins: [origin], pendingSite: null });
  expect(stored.registeredOrigins).toContain(origin);
  expect(stored.pendingSite).toBeUndefined();
});

it('returns the normalized saved state without another storage read after a mutation', async () => {
  const read = mocks.browser.storage.local.get.getMockImplementation()!;
  mocks.browser.storage.local.get.mockImplementation(async (...args) => {
    if (mocks.browser.storage.local.set.mock.calls.length) throw new Error('Read unavailable after saving');
    return read(...args);
  });
  expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin })).toMatchObject({
    ok: true, registeredOrigins: [origin], passkeyOrigins: [], passkeyFrameOrigins: {},
  });
});

it('returns saved registration state and allows removal while Chrome credential setup is still pending', async () => {
  const setup = Promise.withResolvers<unknown>();
  mocks.browser.tabs.sendMessage.mockReturnValue(setup.promise);
  const registration = dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, method: 'password', tabId: 1 });
  expect(await registration).toMatchObject({ ok: true, registeredOrigins: [origin] });
  await vi.waitFor(() => expect(mocks.browser.tabs.sendMessage).toHaveBeenCalled());
  const removal = await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin });
  expect(removal).toMatchObject({ ok: true, registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {} });
  expect(stored.registeredOrigins).toEqual([]);
  setup.resolve({ ok: true, filled: false });
  expect(await registration).toMatchObject({ ok: true, registeredOrigins: [origin] });
  expect(stored.registeredOrigins).toEqual([]);
});
