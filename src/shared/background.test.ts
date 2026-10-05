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
  mocks.browser.storage.local.get.mockImplementation(async (key: string) => ({ [key]: stored[key] }));
  mocks.browser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(stored, values); });
  mocks.browser.storage.local.remove.mockImplementation(async (key: string) => { delete stored[key]; });
  mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: `${origin}/login` });
  mocks.browser.tabs.sendMessage.mockResolvedValue({ ok: true, filled: true });
  background.main();
});

describe('background message handling', () => {
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
      expect(await dispatch({ type, origin, currentOrigin: origin }, content)).toEqual({ ok: false, error: 'この操作は許可されていません。' });
      expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
      expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
    },
  );

  it('ignores malformed messages before accessing state', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: '1' })).toBeUndefined();
    expect(mocks.browser.storage.local.get).not.toHaveBeenCalled();
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('allows an authorized popup to register and remove an origin', async () => {
    const added = 'https://another.example';
    expect(await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin: added })).toEqual({ ok: true, action: 'ignore' });
    expect(stored.registeredOrigins).toEqual([added, origin]);
    await dispatch({ type: MESSAGE_TYPES.removeOrigin, origin: added });
    expect(stored.registeredOrigins).toEqual([origin]);
  });

  it('only authorizes registered origins for matching top-level content scripts', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'submit' });
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, { ...content, frameId: 1 })).toEqual({ ok: false, error: 'この操作は許可されていません。' });
    stored.registeredOrigins = [];
    expect(await dispatch({ type: MESSAGE_TYPES.getLoginPolicy, origin }, content)).toEqual({ ok: true, action: 'ignore' });
  });

  it('does not send credential setup to a tab that navigated away', async () => {
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: 'https://another.example/login' });
    expect(await dispatch({ type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: 1 })).toEqual({ ok: false, error: '対象のログインページを開いてください。' });
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('sends credential setup to a registered matching tab', async () => {
    expect(await dispatch({ type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: 1 })).toEqual({ ok: true, filled: true });
    expect(mocks.browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: MESSAGE_TYPES.enableCredentialLogin, origin }, { frameId: 0 });
  });

  it('does not forward registration notifications to a different origin', async () => {
    mocks.browser.tabs.get.mockResolvedValue({ id: 1, url: 'https://another.example/login' });
    await dispatch({ type: MESSAGE_TYPES.registerOrigin, origin, tabId: 1 });
    expect(mocks.browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
