import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { en } from './i18n';

const mocks = vi.hoisted(() => ({
  browser: {
    i18n: { getUILanguage: vi.fn() },
    storage: { local: { get: vi.fn(), set: vi.fn() } },
    tabs: { query: vi.fn() },
    runtime: { sendMessage: vi.fn() },
  },
}));
vi.mock('wxt/browser', () => ({ browser: mocks.browser }));

let document: Document;
let event: typeof Event;
let preference: string;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const window = parseHTML('<!doctype html><html><body><main id="app"></main></body></html>');
  document = window.document;
  event = window.Event;
  vi.stubGlobal('document', document);
  vi.stubGlobal('HTMLElement', window.HTMLElement);
  preference = 'auto';
  mocks.browser.i18n.getUILanguage.mockReturnValue('en-US');
  mocks.browser.storage.local.get.mockImplementation(async () => ({ language: preference }));
  mocks.browser.storage.local.set.mockImplementation(async (values: { language: string }) => { preference = values.language; });
  mocks.browser.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/login' }]);
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], pendingSite: null });
});
afterEach(() => vi.unstubAllGlobals());

async function openPopup(): Promise<void> {
  await import('../entrypoints/popup/main');
  await vi.waitFor(() => expect(document.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('false'));
}

function selectLanguage(value: string): void {
  const select = document.querySelector<HTMLSelectElement>('#language')!;
  for (const option of select.options) option.selected = false;
  select.querySelector<HTMLOptionElement>(`option[value="${value}"]`)!.selected = true;
  expect(select.value).toBe(value);
  select.dispatchEvent(new event('change'));
}

function selectRegistrationMethod(value: 'password' | 'passkey'): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="registration-method"][value="${value}"]`)!;
  expect(input.disabled).toBe(false);
  input.checked = true;
  input.dispatchEvent(new event('change'));
}

describe('popup language controls', () => {
  it('uses the browser language and persists a manual override without changing registered sites', async () => {
    await openPopup();
    expect(document.documentElement.lang).toBe('en');
    expect(document.body.textContent).toContain('Current site');
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.documentElement.lang).toBe('ja'));
    expect(document.body.textContent).toContain('現在のサイト');
    expect(mocks.browser.storage.local.set).toHaveBeenCalledWith({ language: 'ja' });
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    selectLanguage('auto');
    await vi.waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(preference).toBe('auto');
  });

  it('restores a saved language and translates backend errors to that language', async () => {
    preference = 'en';
    mocks.browser.i18n.getUILanguage.mockReturnValue('ja');
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: false, error: 'この操作は許可されていません。' });
    await openPopup();
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(en.operationNotAllowed);
  });

  it('keeps the current language and shows an error when saving fails', async () => {
    await openPopup();
    mocks.browser.storage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')!.textContent).toContain(en.languageSaveFailed));
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('select')!.disabled).toBe(false);
    expect(preference).toBe('auto');
  });

  it('registers a passkey candidate with its method', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], passkeyOrigins: [], pendingSite: { origin: 'https://example.com', detectedAt: 1, method: 'passkey' } }
      : { ok: true, action: 'ignore' });
    await openPopup();
    expect(document.body.textContent).toContain(en.passkeyDetected);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', method: 'passkey', tabId: 1 }));
  });

  it('shows the registered method without method controls or a manual start action', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'], pendingSite: null }
      : { ok: true });
    await openPopup();
    expect(document.querySelector('[data-focus-key="setup"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Start auto login');
    expect(document.body.textContent).toContain('Login method: Passkey');
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.documentElement.lang).toBe('ja'));
    expect(document.body.textContent).not.toContain('自動ログインを開始');
    expect(document.body.textContent).toContain('ログイン方式: パスキー');
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('registers a used passkey for the next visit without starting authentication again', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], pendingSite: {
        origin: 'https://example.com', detectedAt: 1, method: 'passkey', passkeyUsed: true,
      } } : { ok: true, action: 'ignore' });
    await openPopup();
    expect(document.body.textContent).toContain(en.passkeyUsageDetected);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain(en.registeredNext));
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', method: 'passkey' });
    expect(mocks.browser.runtime.sendMessage.mock.calls.some(([message]) => message.type === 'start-passkey-login')).toBe(false);
  });

  it.each([undefined, 'https://idmsa.apple.com'])('hides stale passkey candidates on a registered password site (authentication: %s)', async (authenticationOrigin) => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: [], pendingSite: {
        origin: 'https://example.com', detectedAt: 1, method: 'passkey', passkeyUsed: true, authenticationOrigin,
      } } : { ok: true, action: 'ignore' });
    await openPopup();
    expect(document.body.textContent).toContain('Login method: Password');
    expect(document.querySelector('[data-focus-key="register"]')).toBeNull();
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('allows a different method after removing and registering the site again', async () => {
    let registeredOrigins = ['https://example.com'];
    let passkeyOrigins: string[] = [];
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => {
      if (message.type === 'get-popup-state') return { ok: true, currentOrigin: 'https://example.com', registeredOrigins, passkeyOrigins, pendingSite: null };
      if (message.type === 'remove-origin') registeredOrigins = [];
      if (message.type === 'register-origin') {
        registeredOrigins = [message.origin];
        passkeyOrigins = message.method === 'passkey' ? [message.origin] : [];
      }
      return { ok: true };
    });
    await openPopup();
    document.querySelector<HTMLButtonElement>('[data-focus-key="remove:https://example.com"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-focus-key="register-current-site"]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('[data-focus-key="register-current-site"]')!.click();
    selectRegistrationMethod('passkey');
    document.querySelector<HTMLButtonElement>('[data-focus-key="confirm-registration"]')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Login method: Passkey'));
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'remove-origin', origin: 'https://example.com' });
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', method: 'passkey', tabId: 1 });
  });

  it('disables passkey selection on insecure sites while allowing password registration', async () => {
    mocks.browser.tabs.query.mockResolvedValue([{ id: 1, url: 'http://example.com/login' }]);
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, currentOrigin: 'http://example.com', registeredOrigins: [], pendingSite: null });
    await openPopup();
    document.querySelector<HTMLButtonElement>('[data-focus-key="register-current-site"]')!.click();
    expect(document.querySelector<HTMLInputElement>('input[name="registration-method"][value="passkey"]')!.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="registration-method"][value="password"]')!.disabled).toBe(false);
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('registers the current site without autofill or a detected button', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], pendingSite: null }
      : { ok: true, action: 'ignore' });
    await openPopup();
    expect(document.body.textContent).toContain(en.registerCurrentSite);
    expect(document.body.textContent).not.toContain('Register this site for passkeys');
    expect(document.querySelector('#registration-method')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-focus-key="register-current-site"]')!.click();
    expect(document.querySelector<HTMLInputElement>('#registration-method')!.value).toBe('password');
    expect(document.querySelector<HTMLInputElement>('#registration-method')!.checked).toBe(true);
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    document.querySelector<HTMLButtonElement>('[data-focus-key="confirm-registration"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', method: 'password', tabId: 1 }));
  });

  it('keeps manual registration available when a different site has a pending notification', async () => {
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, currentOrigin: 'https://example.com', registeredOrigins: [],
      pendingSite: { origin: 'https://another.example', detectedAt: 1 } });
    await openPopup();
    expect(document.querySelector('[data-focus-key="register-current-site"]')).not.toBeNull();
  });

  it('allows passkey registration only after selecting that method and confirming', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], pendingSite: null }
      : { ok: true, action: 'ignore' });
    await openPopup();
    document.querySelector<HTMLButtonElement>('[data-focus-key="register-current-site"]')!.click();
    selectRegistrationMethod('passkey');
    expect(document.body.textContent).toContain(en.passkeyRegisterDescription);
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    document.querySelector<HTMLButtonElement>('[data-focus-key="confirm-registration"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', method: 'passkey', tabId: 1 }));
  });

  it('cancels registration without changing the site settings', async () => {
    await openPopup();
    document.querySelector<HTMLButtonElement>('[data-focus-key="register-current-site"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-focus-key="cancel-registration"]')!.click();
    expect(document.querySelector('#registration-method')).toBeNull();
    expect(document.querySelector('[data-focus-key="register-current-site"]')).not.toBeNull();
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('shows and approves the authentication origin even when the parent is already registered', async () => {
    const authenticationOrigin = 'https://idmsa.apple.com';
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'],
        pendingSite: { origin: 'https://example.com', detectedAt: 1, method: 'passkey', authenticationOrigin } }
      : { ok: true, action: 'ignore' });
    await openPopup();
    expect(document.body.textContent).toContain(`Authentication site: ${authenticationOrigin}`);
    expect(document.body.textContent).toContain(en.authenticationSiteConsent);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', method: 'passkey', authenticationOrigin, tabId: 1 }));
  });
});
