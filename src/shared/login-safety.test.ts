import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loginPage } from './test-dom';

const mocks = vi.hoisted(() => ({ browser: {
  runtime: { id: 'review-extension', getURL: (path: string) => `chrome-extension://review-extension${path}`,
    sendMessage: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
  storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() }, local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  i18n: { getUILanguage: () => 'en' },
  tabs: { get: vi.fn(), sendMessage: vi.fn() },
  action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  notifications: { create: vi.fn(), clear: vi.fn(), onClicked: { addListener: vi.fn() } },
} }));
vi.mock('wxt/browser', () => ({ browser: mocks.browser }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

function page(markup: string) {
  const window = loginPage(markup);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('Event', window.Event);
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
  vi.stubGlobal('location', { href: 'https://example.com/login' });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  return window.document;
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function startAutofill(ctx = { isInvalid: false, setTimeout: vi.fn(), setInterval: vi.fn(), onInvalidated: vi.fn() }) {
  const script = (await import('../entrypoints/autofill.content')).default;
  await script.main(ctx as never);
}
const populated = '<form><input type="email" value="dummy@example.com"><input type="password" value="dummy-password"><button type="submit">Log in</button></form>';

it('must not submit when the only submit button is disabled', async () => {
  const document = page(populated);
  const button = document.querySelector('button')!;
  button.setAttribute('disabled', '');
  const requestSubmit = vi.fn();
  document.querySelector('form')!.requestSubmit = requestSubmit;
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
  await startAutofill(); await flush();
  expect(requestSubmit).not.toHaveBeenCalled();
});

it('must revalidate a form changed to new-password while policy is pending', async () => {
  const document = page(populated);
  const button = document.querySelector('button')!;
  const click = vi.spyOn(button, 'click');
  let release!: (value: unknown) => void;
  mocks.browser.runtime.sendMessage.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await startAutofill();
  document.querySelector<HTMLInputElement>('input[type="password"]')!.setAttribute('autocomplete', 'new-password');
  release({ ok: true, action: 'submit' }); await flush();
  expect(click).not.toHaveBeenCalled();
});

it('must not submit after the content script is invalidated while awaiting policy', async () => {
  const document = page(populated);
  const click = vi.spyOn(document.querySelector('button')!, 'click');
  const ctx = { isInvalid: false, setTimeout: vi.fn(), setInterval: vi.fn(), onInvalidated: vi.fn() };
  let release!: (value: unknown) => void;
  mocks.browser.runtime.sendMessage.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await startAutofill(ctx);
  ctx.isInvalid = true;
  ctx.onInvalidated.mock.calls[0]![0]();
  release({ ok: true, action: 'submit' }); await flush();
  expect(click).not.toHaveBeenCalled();
});

async function startBackground() {
  const stored: Record<string, unknown> = { registeredOrigins: ['https://example.com'] };
  mocks.browser.storage.local.get.mockImplementation(async (key: string | string[]) => Object.fromEntries((Array.isArray(key) ? key : [key]).map((item) => [item, stored[item]])));
  mocks.browser.storage.local.set.mockImplementation(async (value: object) => { Object.assign(stored, value); });
  mocks.browser.storage.local.remove.mockImplementation(async (key: string) => { delete stored[key]; });
  (await import('../entrypoints/background')).default.main();
  const listener = mocks.browser.runtime.onMessage.addListener.mock.calls[0]![0];
  const dispatch = (message: object) => new Promise(resolve => listener(message,
    { id: 'review-extension', url: 'chrome-extension://review-extension/popup.html' }, resolve));
  return { stored, dispatch };
}

it('must keep both registrations when two popups register concurrently', async () => {
  const { stored, dispatch } = await startBackground();
  await Promise.all([
    dispatch({ type: 'register-origin', origin: 'https://first.example', method: 'password' }),
    dispatch({ type: 'register-origin', origin: 'https://second.example', method: 'password' }),
  ]);
  expect(stored.registeredOrigins).toEqual(['https://example.com', 'https://first.example', 'https://second.example']);
});

it('must not restore a removed site when another popup registers concurrently', async () => {
  const { stored, dispatch } = await startBackground();
  await Promise.all([
    dispatch({ type: 'remove-origin', origin: 'https://example.com' }),
    dispatch({ type: 'register-origin', origin: 'https://second.example', method: 'password' }),
  ]);
  expect(stored.registeredOrigins).not.toContain('https://example.com');
});

it('caches denial for an unchanged unregistered passkey button', async () => {
  const document = page('<button>Sign in with passkey</button>');
  const { PasskeyLoginController } = await import('./passkey-login');
  const getPolicy = vi.fn().mockResolvedValue({ ok: true, action: 'ignore' });
  const controller = new PasskeyLoginController({ root: document, canStart: () => true, getPolicy });
  for (let i = 0; i < 5; i++) await controller.evaluate();
  expect(getPolicy).toHaveBeenCalledOnce();
});

it('must retain completed passkey-use evidence when autofill is detected afterward', async () => {
  const { stored, dispatch } = await startBackground();
  stored.registeredOrigins = [];
  const listener = mocks.browser.runtime.onMessage.addListener.mock.calls[0]![0];
  const content = { id: 'review-extension', url: 'https://example.com/login', tab: { id: 1 }, frameId: 0 };
  const send = (message: object) => new Promise(resolve => listener(message, content, resolve));
  await send({ type: 'passkey-used', origin: 'https://example.com' });
  await send({ type: 'autofill-detected', origin: 'https://example.com' });
  expect(stored.pendingSite).toMatchObject({ method: 'passkey', passkeyUsed: true });
});

it('must not fill a form changed to new-password while Chrome credentials are pending', async () => {
  const document = page('<form><input type="email"><input type="password"><button type="submit">Log in</button></form>');
  const usernameInput = document.querySelector<HTMLInputElement>('input[type="email"]')!;
  const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]')!;
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { credentials: { get: async () => {
    passwordInput.setAttribute('autocomplete', 'new-password');
    return { type: 'password', id: 'dummy@example.com', password: 'dummy-password' };
  } } });
  const { fillStoredCredentials } = await import('./credential-autofill');
  expect(await fillStoredCredentials({ form: document.querySelector('form')!, usernameInput, passwordInput }, 'silent', () => true)).toBe(false);
  expect(passwordInput.value).toBe('');
});

it('retries a disabled submit control without any change to autofilled values', async () => {
  const document = page(populated);
  const button = document.querySelector('button')!;
  button.setAttribute('disabled', '');
  const click = vi.spyOn(button, 'click');
  const ctx = { isInvalid: false, setTimeout: vi.fn(), setInterval: vi.fn(), onInvalidated: vi.fn() };
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
  await startAutofill(ctx); await flush();
  expect(click).not.toHaveBeenCalled();
  button.removeAttribute('disabled');
  ctx.setInterval.mock.calls[0]![0](); await flush();
  ctx.setInterval.mock.calls[0]![0](); await flush();
  expect(click).toHaveBeenCalledOnce();
});

it('rechecks safety after each synchronous page input handler', async () => {
  const document = page(populated);
  const click = vi.spyOn(document.querySelector('button')!, 'click');
  document.querySelector('input')!.addEventListener('input', () => {
    document.querySelector('input[type="password"]')!.setAttribute('autocomplete', 'new-password');
  });
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
  await startAutofill(); await flush();
  expect(click).not.toHaveBeenCalled();
});

it.each(['disabled', 'readonly', 'new-password', 'type', 'replaced', 'additional-password'])(
  'revalidates %s while credentials are pending', async (change) => {
    const document = page('<form><input type="email"><input type="password"><button type="submit">Log in</button></form>');
    const usernameInput = document.querySelector<HTMLInputElement>('input[type="email"]')!;
    const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    vi.stubGlobal('isSecureContext', true);
    const credential = Promise.withResolvers<Credential>();
    vi.stubGlobal('navigator', { credentials: { get: () => credential.promise } });
    const { fillStoredCredentials } = await import('./credential-autofill');
    const result = fillStoredCredentials({ form: document.querySelector('form')!, usernameInput, passwordInput }, 'silent', () => true);
    if (change === 'new-password') passwordInput.setAttribute('autocomplete', 'new-password');
    else if (change === 'type') passwordInput.type = 'text';
    else if (change === 'replaced') passwordInput.replaceWith(document.createElement('input'));
    else if (change === 'additional-password') document.querySelector('form')!.insertAdjacentHTML('beforeend', '<input type="password">');
    else passwordInput.setAttribute(change, '');
    credential.resolve({ type: 'password', id: 'dummy@example.com', password: 'dummy-password' } as Credential);
    expect(await result).toBe(false);
    expect(passwordInput.value).toBe('');
  },
);

it('preserves method and frame state for concurrent registration/removal', async () => {
  const { stored, dispatch } = await startBackground();
  stored.passkeyOrigins = ['https://example.com'];
  stored.passkeyFrameOrigins = { 'https://example.com': 'https://auth.example' };
  await Promise.all([
    dispatch({ type: 'register-origin', origin: 'https://new.example', method: 'passkey' }),
    dispatch({ type: 'remove-origin', origin: 'https://example.com' }),
  ]);
  expect(stored).toMatchObject({ registeredOrigins: ['https://new.example'], passkeyOrigins: ['https://new.example'], passkeyFrameOrigins: {} });
  for (const [update] of mocks.browser.storage.local.set.mock.calls) {
    expect(Object.keys(update).sort()).toEqual(['federatedProviders', 'passkeyFrameOrigins', 'passkeyOrigins', 'registeredOrigins']);
  }
});

it('continues queued mutations after a storage write failure', async () => {
  const { stored, dispatch } = await startBackground();
  mocks.browser.storage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'));
  const results = await Promise.all([
    dispatch({ type: 'register-origin', origin: 'https://first.example', method: 'password' }),
    dispatch({ type: 'register-origin', origin: 'https://second.example', method: 'password' }),
  ]);
  expect(results[0]).toMatchObject({ ok: false });
  expect(results[1]).toMatchObject({ ok: true });
  expect(stored.registeredOrigins).toEqual(['https://example.com', 'https://second.example']);
});

it('refreshes a cached passkey denial after registration changes', async () => {
  const document = page('<button>Sign in with passkey</button>');
  const { PasskeyLoginController } = await import('./passkey-login');
  const getPolicy = vi.fn().mockResolvedValue({ ok: true, action: 'ignore' });
  const login = new PasskeyLoginController({ root: document, canStart: () => true,
    getPolicy });
  const click = vi.spyOn(document.querySelector('button')!, 'click');
  await login.evaluate();
  getPolicy.mockResolvedValue({ ok: true, action: 'submit', method: 'passkey' });
  await login.evaluate();
  expect(click).not.toHaveBeenCalled();
  login.invalidatePolicy();
  await login.evaluate();
  expect(getPolicy).toHaveBeenCalledTimes(2);
  expect(click).toHaveBeenCalledOnce();
});

it('does not scan a page with no passkey candidate on every availability tick', async () => {
  const document = page('<button>Log in</button>');
  const { PasskeyLoginController } = await import('./passkey-login');
  const query = vi.spyOn(document, 'querySelectorAll');
  const getPolicy = vi.fn();
  const login = new PasskeyLoginController({ root: document, canStart: () => true, getPolicy });
  for (let i = 0; i < 8; i++) await login.evaluate();
  expect(query).toHaveBeenCalledOnce();
  expect(getPolicy).not.toHaveBeenCalled();
  document.querySelector('button')!.textContent = 'Sign in with passkey';
  login.invalidateCandidates();
  getPolicy.mockResolvedValue({ ok: true, action: 'submit', method: 'passkey' });
  expect(await login.evaluate()).toBe(true);
});

it('cancels an authorized password submission when registration changes before the response', async () => {
  const document = page(populated);
  const click = vi.spyOn(document.querySelector('button')!, 'click');
  const policy = Promise.withResolvers<unknown>();
  mocks.browser.runtime.sendMessage.mockReturnValue(policy.promise);
  await startAutofill();
  mocks.browser.storage.onChanged.addListener.mock.calls[0]![0]({ registeredOrigins: { newValue: [] } }, 'local');
  policy.resolve({ ok: true, action: 'submit' });
  await flush();
  expect(click).not.toHaveBeenCalled();
});

it('does not fall back to direct submission when a page handler removes its submit control', async () => {
  const document = page(populated);
  const requestSubmit = vi.fn();
  document.querySelector('form')!.requestSubmit = requestSubmit;
  document.querySelector('input')!.addEventListener('input', () => document.querySelector('button')?.remove());
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
  await startAutofill(); await flush();
  expect(requestSubmit).not.toHaveBeenCalled();
});

it('waits for an explicit disabled submit control associated outside the form', async () => {
  const document = page('<form id="login"><input type="email" value="dummy@example.com"><input type="password" value="dummy-password"></form><button type="submit" form="login" disabled>Log in</button>');
  const form = document.querySelector('form')!;
  const button = document.querySelector('button')!;
  Object.defineProperty(button, 'form', { get: () => form });
  const requestSubmit = vi.fn();
  form.requestSubmit = requestSubmit;
  mocks.browser.runtime.sendMessage.mockResolvedValue({ ok: true, action: 'submit' });
  await startAutofill(); await flush();
  expect(requestSubmit).not.toHaveBeenCalled();
});
