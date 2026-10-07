import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { en, ja } from './i18n';

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
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: [], passkeyOrigins: [], pendingSite: null });
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

describe('popup language controls', () => {
  it('filters registered origins without replacing the search input or writing settings', async () => {
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, currentOrigin: 'https://example.com',
      registeredOrigins: ['https://alpha.example.com', 'https://beta.example.com', 'https://other.test'],
      passkeyOrigins: [], passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    const search = document.querySelector<HTMLInputElement>('[data-focus-key="site-search"]')!;
    const list = document.querySelector<HTMLUListElement>('#registered-site-list')!;
    search.value = '  EXAMPLE.COM  ';
    search.dispatchEvent(new event('input'));
    expect(list.children.length).toBe(2);
    expect(list.textContent).toContain('https://alpha.example.com');
    expect(list.textContent).not.toContain('https://other.test');
    expect(document.querySelector('[data-focus-key="site-search"]')).toBe(search);
    expect(document.querySelector('[role="status"]')!.textContent).toBe('2 / 3 sites');
    search.value = 'missing';
    search.dispatchEvent(new event('input'));
    expect(list.hidden).toBe(true);
    expect([...document.querySelectorAll('p')].find((node) => node.textContent === en.noMatchingSites)?.hidden).toBe(false);
    search.value = '';
    search.dispatchEvent(new event('input'));
    expect(list.hidden).toBe(false);
    expect(list.children.length).toBe(3);
    expect(document.querySelector('[role="status"]')!.textContent).toBe('3 sites');
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('preserves the filter across language changes and removal of the matching site', async () => {
    let registeredOrigins = ['https://alpha.example.com', 'https://beta.example.com'];
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => {
      if (message.type === 'remove-origin') registeredOrigins = registeredOrigins.filter((origin) => origin !== message.origin);
      return { ok: true, currentOrigin: 'https://example.com', registeredOrigins, passkeyOrigins: [], passkeyFrameOrigins: {}, pendingSite: null };
    });
    await openPopup();
    const search = document.querySelector<HTMLInputElement>('[data-focus-key="site-search"]')!;
    search.value = 'alpha';
    search.dispatchEvent(new event('input'));
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('[data-focus-key="site-search"]')!.placeholder).toBe(ja.searchSites));
    expect(document.querySelector<HTMLInputElement>('[data-focus-key="site-search"]')!.value).toBe('alpha');
    expect(document.querySelector('#registered-site-list')!.children.length).toBe(1);
    document.querySelector<HTMLButtonElement>('[data-focus-key="remove:https://alpha.example.com"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('#registered-site-list')!.children.length).toBe(0));
    expect(document.querySelector<HTMLInputElement>('[data-focus-key="site-search"]')!.value).toBe('alpha');
    expect([...document.querySelectorAll('p')].find((node) => node.textContent === ja.noMatchingSites)?.hidden).toBe(false);
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'remove-origin', origin: 'https://alpha.example.com', currentOrigin: 'https://example.com' });
    expect(document.querySelector('[data-focus-key="remove:https://beta.example.com"]')).toBeNull();
  });

  it('shows guidance without registration actions when no login activity has been detected', async () => {
    await openPopup();
    expect(document.body.textContent).toContain(en.loginActivityHint);
    expect(document.body.textContent).not.toContain(en.currentSite);
    expect(document.body.textContent).not.toContain('https://example.com');
    expect(document.querySelector('[data-focus-key="register"]')).toBeNull();
    expect(document.querySelector('[data-focus-key="register-current-site"]')).toBeNull();
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(document.querySelector('[data-focus-key="site-search"]')).toBeNull();
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.body.textContent).toContain(ja.loginActivityHint));
    expect(document.body.textContent).not.toContain(ja.currentSite);
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('registers a manually submitted password candidate after a redirect without resubmitting it', async () => {
    mocks.browser.tabs.query.mockResolvedValue([{ id: 1, url: 'https://destination.example/home' }]);
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://destination.example', registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {}, pendingSite: { origin: 'https://example.com', detectedAt: 1, passwordUsed: true } }
      : { ok: true, currentOrigin: 'https://destination.example', registeredOrigins: ['https://example.com'], passkeyOrigins: [], passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    expect(document.body.textContent).toContain(en.passwordUsageDetected);
    expect(document.body.textContent).not.toContain(en.currentSite);
    expect(document.body.textContent).not.toContain('https://destination.example');
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', currentOrigin: 'https://destination.example', origin: 'https://example.com', method: 'password' }));
    await vi.waitFor(() => expect(document.body.textContent).toContain(en.registeredNext));
    expect(document.querySelector('[data-focus-key="register-current-site"]')).toBeNull();
  });

  it('uses a detected external provider and registers it for the next visit without another click', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {}, federatedProviders: {},
        pendingSite: { origin: 'https://example.com', method: 'federated', provider: 'google', federatedUsed: true, detectedAt: 1 } }
      : { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: [], passkeyFrameOrigins: {}, federatedProviders: { 'https://example.com': 'google' }, pendingSite: null });
    await openPopup();
    expect(document.body.textContent).toContain(en.federatedUsageDetected);
    expect(document.body.textContent).toContain('Google');
    expect(document.body.textContent).toContain(en.detectedSite);
    expect(document.body.textContent).not.toContain(en.currentSite);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', origin: 'https://example.com', currentOrigin: 'https://example.com', method: 'federated', provider: 'google' }));
    await vi.waitFor(() => expect(document.body.textContent).toContain(en.registeredNext));
  });
  it('uses the browser language and persists a manual override without changing registered sites', async () => {
    await openPopup();
    expect(document.documentElement.lang).toBe('en');
    expect(document.body.textContent).toContain(en.loginActivityHint);
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.documentElement.lang).toBe('ja'));
    expect(document.body.textContent).toContain(ja.loginActivityHint);
    expect(mocks.browser.storage.local.set).toHaveBeenCalledWith({ language: 'ja' });
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    selectLanguage('auto');
    await vi.waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(preference).toBe('auto');
  });

  it('restores a saved language and translates backend errors to that language', async () => {
    preference = 'en';
    mocks.browser.i18n.getUILanguage.mockReturnValue('ja');
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: false, error: 'operationNotAllowed' });
    await openPopup();
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(en.operationNotAllowed);
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')!.textContent).toContain(ja.operationNotAllowed));
  });

  it('uses the complete state returned by registration without fetching or reconstructing it', async () => {
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce({ ok: true, currentOrigin: 'https://example.com', registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {}, pendingSite: { origin: 'https://example.com', detectedAt: 1 } });
    await openPopup();
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce({
      ok: true, currentOrigin: 'https://example.com',
      registeredOrigins: ['https://another.example', 'https://example.com'],
      passkeyOrigins: ['https://another.example'],
      passkeyFrameOrigins: { 'https://another.example': 'https://auth.example' }, pendingSite: null,
    });
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain(en.registeredCurrent));
    expect(document.querySelector('[data-focus-key="remove:https://another.example"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Login method: Password');
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
    selectLanguage('ja');
    await vi.waitFor(() => expect(document.body.textContent).toContain(ja.registeredCurrent));
    expect(document.body.textContent).not.toContain(en.registeredCurrent);
  });

  it('keeps registered state after a failed removal and translates the error code', async () => {
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce({ ok: true, currentOrigin: 'https://example.com',
      registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'],
      passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce({ ok: false, error: 'processingFailed' });
    document.querySelector<HTMLButtonElement>('[data-focus-key="remove:https://example.com"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')!.textContent).toContain(en.processingFailed));
    expect(document.body.textContent).toContain('Login method: Passkey');
    expect(document.body.textContent).toContain(en.currentSite);
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
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
      ? { ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: [], passkeyOrigins: [], pendingSite: { origin: 'https://example.com', detectedAt: 1, method: 'passkey', passkeyUsed: true } }
      : { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'], passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    expect(document.body.textContent).toContain(en.passkeyUsageDetected);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', currentOrigin: 'https://example.com', origin: 'https://example.com', method: 'passkey' }));
  });

  it('shows the registered method without method controls or a manual start action', async () => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'], pendingSite: null }
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
      ? { ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: [], passkeyOrigins: [], pendingSite: {
        origin: 'https://example.com', detectedAt: 1, method: 'passkey', passkeyUsed: true,
      } } : { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'], passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    expect(document.body.textContent).toContain(en.passkeyUsageDetected);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain(en.registeredNext));
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', currentOrigin: 'https://example.com', origin: 'https://example.com', method: 'passkey' });
    expect(mocks.browser.runtime.sendMessage.mock.calls.some(([message]) => message.type === 'start-passkey-login')).toBe(false);
  });

  it.each([undefined, 'https://idmsa.apple.com'])('hides stale passkey candidates on a registered password site (authentication: %s)', async (authenticationOrigin) => {
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: ['https://example.com'], passkeyOrigins: [], pendingSite: {
        origin: 'https://example.com', detectedAt: 1, method: 'passkey', passkeyUsed: true, authenticationOrigin,
      } } : { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'], passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    expect(document.body.textContent).toContain('Login method: Password');
    expect(document.querySelector('[data-focus-key="register"]')).toBeNull();
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('offers only the detected origin when another site has a pending notification', async () => {
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: [],
      pendingSite: { origin: 'https://another.example', detectedAt: 1 } });
    await openPopup();
    expect(document.querySelector('[data-focus-key="register-current-site"]')).toBeNull();
  });

  it('shows and approves the authentication origin even when the parent is already registered', async () => {
    const authenticationOrigin = 'https://idmsa.apple.com';
    mocks.browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'get-popup-state'
      ? { ok: true, currentOrigin: 'https://example.com', passkeyFrameOrigins: {}, registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'],
        pendingSite: { origin: 'https://example.com', detectedAt: 1, method: 'passkey', passkeyUsed: true, authenticationOrigin } }
      : { ok: true, currentOrigin: 'https://example.com', registeredOrigins: ['https://example.com'], passkeyOrigins: ['https://example.com'], passkeyFrameOrigins: {}, pendingSite: null });
    await openPopup();
    expect(document.body.textContent).toContain(`Authentication site: ${authenticationOrigin}`);
    expect(document.body.textContent).toContain(en.authenticationSiteConsent);
    document.querySelector<HTMLButtonElement>('[data-focus-key="register"]')!.click();
    await vi.waitFor(() => expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'register-origin', currentOrigin: 'https://example.com', origin: 'https://example.com', method: 'passkey', authenticationOrigin }));
  });
});
