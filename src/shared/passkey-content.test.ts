import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { PASSKEY_USAGE_EVENT } from './passkey-usage';

const mocks = vi.hoisted(() => ({
  browser: { runtime: { id: 'test-extension', sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
  disconnect: vi.fn(),
}));
vi.mock('wxt/browser', () => ({ browser: mocks.browser }));

let document: Document;
let event: typeof Event;
let ctx: { isInvalid: boolean; setInterval: ReturnType<typeof vi.fn>; onInvalidated: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const window = parseHTML('<html><body></body></html>');
  document = window.document;
  event = window.Event;
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
  vi.stubGlobal('KeyboardEvent', class extends event {});
  vi.stubGlobal('location', { href: 'https://example.com/login' });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect() { mocks.disconnect(); }
  });
  ctx = { isInvalid: false, setInterval: vi.fn(), onInvalidated: vi.fn() };
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'pending' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function start(): Promise<void> {
  const entrypoint = (await import('../entrypoints/passkey.content')).default;
  await entrypoint.main(ctx as never);
}

describe('passkey usage content bridge', () => {
  it('resumes automatic activation after trusted username input without a manual start action', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input autocomplete="username"><button>パスキーでサインイン</button>';
    const input = document.querySelector('input')!;
    const button = document.querySelector('button')!;
    Object.defineProperty(button, 'getClientRects', { value: () => [{}] });
    const click = vi.spyOn(button, 'click');
    const authorization = Promise.withResolvers<{ ok: true; action: 'submit'; method: 'passkey' }>();
    mocks.browser.runtime.sendMessage.mockImplementation(() => authorization.promise);
    await start();
    const typing = new event('beforeinput', { bubbles: true });
    Object.defineProperty(typing, 'isTrusted', { value: true });
    input.dispatchEvent(typing);
    authorization.resolve({ ok: true, action: 'submit', method: 'passkey' });
    await Promise.resolve();
    await Promise.resolve();
    expect(click).not.toHaveBeenCalled();
    vi.advanceTimersByTime(750);
    ctx.setInterval.mock.calls[0]![0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(click).toHaveBeenCalledOnce();
  });

  it('does not cancel automatic button activation while a usage hint is being reported', async () => {
    const button = document.createElement('button');
    button.textContent = 'パスキーでサインイン';
    Object.defineProperty(button, 'getClientRects', { value: () => [{}] });
    document.body.append(button);
    const click = vi.spyOn(button, 'click');
    const authorization = Promise.withResolvers<{ ok: true; action: 'submit'; method: 'passkey' }>();
    mocks.browser.runtime.sendMessage.mockImplementation((message) => message.type === 'get-passkey-policy'
      ? authorization.promise : Promise.resolve({ ok: true, action: 'pending' }));
    await start();
    document.dispatchEvent(new event(PASSKEY_USAGE_EVENT));
    authorization.resolve({ ok: true, action: 'submit', method: 'passkey' });
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    ctx.setInterval.mock.calls[0]![0]();
    await Promise.resolve();
    expect(click).toHaveBeenCalledOnce();
  });

  it('forwards only a hint for its own origin and reports once per document', async () => {
    await start();
    const signal = new event(PASSKEY_USAGE_EVENT);
    Object.assign(signal, { detail: { origin: 'https://forged.example', signature: 'must-not-forward' } });
    document.dispatchEvent(signal);
    document.dispatchEvent(new event(PASSKEY_USAGE_EVENT));
    expect(mocks.browser.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'passkey-used', origin: 'https://example.com' });
  });

  it('does not report from hidden or invalidated documents', async () => {
    await start();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new event(PASSKEY_USAGE_EVENT));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    ctx.isInvalid = true;
    document.dispatchEvent(new event(PASSKEY_USAGE_EVENT));
    expect(mocks.browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('removes the bridge and other observers when invalidated', async () => {
    await start();
    ctx.onInvalidated.mock.calls[0]![0]();
    document.dispatchEvent(new event(PASSKEY_USAGE_EVENT));
    expect(mocks.browser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.browser.runtime.onMessage.removeListener).toHaveBeenCalledOnce();
  });
});
