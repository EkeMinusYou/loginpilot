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
  const select = document.querySelector('select')!;
  for (const option of select.options) option.selected = false;
  select.querySelector<HTMLOptionElement>(`option[value="${value}"]`)!.selected = true;
  expect(select.value).toBe(value);
  select.dispatchEvent(new event('change'));
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
});
