import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';

const mocks = vi.hoisted(() => ({
  browser: { runtime: { id: 'test-extension', sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
  find: vi.fn(), has: vi.fn(), fill: vi.fn(),
}));
vi.mock('wxt/browser', () => ({ browser: mocks.browser }));
vi.mock('./form-detector', () => ({ findLoginForm: mocks.find, hasCredentials: mocks.has,
  hasPendingPasswordAutofill: () => false }));
vi.mock('./credential-autofill', () => ({ fillStoredCredentials: mocks.fill }));

let button: HTMLButtonElement;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const window = parseHTML('<html><body><form><input type="email"><input type="password"><button type="submit">Log in</button></form></body></html>');
  const document = window.document;
  button = document.querySelector('button')!;
  Object.defineProperty(button, 'getClientRects', { value: () => [{}] });
  mocks.find.mockReturnValue({ form: document.querySelector('form'),
    usernameInput: document.querySelector('input[type="email"]'), passwordInput: document.querySelector('input[type="password"]') });
  mocks.has.mockReturnValue(false);
  mocks.fill.mockResolvedValue(false);
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'ignore' });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  window.top = window;
  vi.stubGlobal('Event', window.Event);
  vi.stubGlobal('location', { href: 'https://example.com/login' });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(document, 'visibilityState', { value: 'visible' });
});
afterEach(() => vi.unstubAllGlobals());

async function start() {
  const entrypoint = (await import('../entrypoints/autofill.content')).default;
  await entrypoint.main({ isInvalid: false, setTimeout: vi.fn(), setInterval: vi.fn(), onInvalidated: vi.fn() } as never);
  await Promise.resolve();
  await Promise.resolve();
  return mocks.browser.runtime.onMessage.addListener.mock.calls[0]![0];
}

const sender = { id: 'test-extension' };

describe('password registration starts automatic login', () => {
  it('includes Chrome confirmation in registration when autofill has not committed, without a separate start action', async () => {
    const onMessage = await start();
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
    await onMessage({ type: 'site-registered', origin: 'https://example.com' }, sender);
    expect(mocks.fill).toHaveBeenCalledExactlyOnceWith(mocks.find.mock.results[0]!.value, 'optional', expect.any(Function));
  });

  it('submits existing autofill after registration without asking for credentials again', async () => {
    const onMessage = await start();
    mocks.has.mockReturnValue(true);
    mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
    const click = vi.spyOn(button, 'click');
    await onMessage({ type: 'site-registered', origin: 'https://example.com' }, sender);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.fill).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });
});
