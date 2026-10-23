import { test as base, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { resolve } from 'node:path';
type ExtensionBrowser = typeof import('wxt/browser').browser;
declare const chrome: ExtensionBrowser;

const origin = 'http://localhost:4175';
const test = base.extend<{ extension: { context: BrowserContext; worker: Worker; id: string } }>({
  extension: async ({}, use) => {
    const extensionPath = resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true,
      args: ['--enable-unsafe-extension-debugging'],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    try {
      const session = await context.browser()!.newBrowserCDPSession();
      await session.send('Extensions.loadUnpacked', { path: extensionPath });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      await worker.evaluate(() => chrome.storage.local.clear());
      await use({ context, worker, id: worker.url().split('/')[2]! });
    } finally {
      await context.close();
    }
  },
});

async function register(worker: Worker, method: 'password' | 'passkey') {
  // Prepare only the preferences; the production content scripts and worker run normally.
  await worker.evaluate(({ origin, method }) => chrome.storage.local.set({
    registeredOrigins: [origin], passkeyOrigins: method === 'passkey' ? [origin] : [], passkeyFrameOrigins: {},
  }), { origin, method });
}

async function settle(page: import('@playwright/test').Page) {
  // Cover the 1 s fallback and pending message responses before negative assertions.
  await page.waitForTimeout(1200);
}

test('can scroll to the last registered site with a tall registration candidate', async ({ extension }) => {
  const sites = Array.from({ length: 30 }, (_, index) => `https://site-${String(index).padStart(2, '0')}.example.com`);
  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.addInitScript(({ sites }) => {
    // Render the production popup/CSS in a fixed popup-sized tab. Background
    // mutations remain forbidden in ordinary extension tabs; mock only the state read.
    const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: { type: string }) => message.type === 'get-popup-state'
      ? Promise.resolve({ ok: true, currentOrigin: null, registeredOrigins: sites, passkeyOrigins: [],
        passkeyFrameOrigins: {}, federatedProviders: {}, pendingSite: {
          origin: 'https://login.example.com', method: 'passkey', passkeyUsed: true, detectedAt: Date.now(),
          authenticationOrigin: 'https://authentication.example.com',
        } }) : sendMessage(message)) as typeof chrome.runtime.sendMessage;
  }, { sites });
  await popup.goto(`chrome-extension://${extension.id}/popup.html`);
  const list = popup.locator('#registered-site-list');
  await expect(list.locator('li')).toHaveCount(sites.length);
  const pointer = await list.evaluate((list) => {
    const bounds = list.getBoundingClientRect();
    const content = document.querySelector('.popup-content')!.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: Math.min(bounds.top + 20, content.bottom - 12) };
  });
  // Move directly: locator.hover/click would auto-scroll and hide the original bug.
  await popup.mouse.move(pointer.x, pointer.y);
  await popup.mouse.wheel(0, 5000);
  const last = popup.locator(`[data-focus-key="remove:${sites.at(-1)}"]`);
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(last).toBeEnabled();
});

test('does not suggest registration on ordinary pages or unused provider and passkey buttons', async ({ extension }) => {
  const page = await extension.context.newPage();
  for (const query of ['plain', 'manual', 'federated-single', 'passkey']) {
    await page.goto(`${origin}/?${query}`);
    if (query === 'passkey') await page.locator('#passkey').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
    await settle(page);
    expect(await extension.worker.evaluate(() => chrome.storage.local.get(['pendingSite', 'registeredOrigins']))).toEqual({});
    await expect(page.locator('#clicks')).toHaveText('0');
  }
});

test('suggests the submitting origin after manual password entry and a cross-origin redirect', async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(`${origin}/?manual&redirect`);
  await page.locator('input[type="email"]').fill('manual@example.com');
  await page.locator('input[type="password"]').fill('fixture-password');
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  expect(await extension.worker.evaluate(() => chrome.storage.local.get('pendingSite'))).toEqual({});
  await page.locator('button').click();
  await expect(page).toHaveURL('http://localhost:4176/?plain');
  await expect.poll(async () => await extension.worker.evaluate(() => chrome.storage.local.get('pendingSite')))
    .toMatchObject({ pendingSite: { origin, passwordUsed: true } });
  expect(await extension.worker.evaluate(() => chrome.storage.local.get('registeredOrigins'))).toEqual({});
});

test('suggests passkey registration only after manually completed authentication', async ({ extension }) => {
  const page = await extension.context.newPage();
  const session = await extension.context.newCDPSession(page);
  await session.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  await page.goto(`${origin}/?passkey`);
  await page.evaluate(async () => {
    await navigator.credentials.create({ publicKey: {
      challenge: new Uint8Array([5, 6, 7, 8]), rp: { name: 'Fixture', id: 'localhost' },
      user: { id: new Uint8Array([1]), name: 'fixture@example.com', displayName: 'Fixture' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    } });
  });
  await page.locator('#passkey').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  expect(await extension.worker.evaluate(() => chrome.storage.local.get('pendingSite'))).toEqual({});
  await page.locator('#passkey').click();
  await expect(page.locator('#auth')).toHaveText('success');
  await expect.poll(async () => await extension.worker.evaluate(() => chrome.storage.local.get('pendingSite')))
    .toMatchObject({ pendingSite: { origin, method: 'passkey', passkeyUsed: true } });
  expect(await extension.worker.evaluate(() => chrome.storage.local.get('registeredOrigins'))).toEqual({});
  await session.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});

test('automatically clicks the configured external provider and follows the site redirect', async ({ extension }) => {
  await extension.worker.evaluate(({ origin }) => chrome.storage.local.set({
    registeredOrigins: [origin], passkeyOrigins: [], passkeyFrameOrigins: {}, federatedProviders: { [origin]: 'google' },
  }), { origin });
  const page = await extension.context.newPage();
  await page.goto(`${origin}/?federated`);
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
  await expect(page.locator('#clicks')).toHaveText('0');
  await page.locator('#google-login-page').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await expect(page).toHaveURL(`${origin}/?federated-complete=google`);
  await expect(page.locator('#auth')).toHaveText('google');
  await settle(page);
  await expect(page).toHaveURL(`${origin}/?federated-complete=google`);
});

test('does not retry a cancelled external login or switch to another provider', async ({ extension }) => {
  await extension.worker.evaluate(({ origin }) => chrome.storage.local.set({
    registeredOrigins: [origin], passkeyOrigins: [], passkeyFrameOrigins: {}, federatedProviders: { [origin]: 'google' },
  }), { origin });
  const page = await extension.context.newPage();
  await page.goto(`${origin}/?federated&cancel`);
  await page.locator('#google-login-page').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await expect(page.locator('#clicks')).toHaveText('1');
  await expect(page.locator('#auth')).toHaveText('cancelled');
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
  await expect(page.locator('#clicks')).toHaveText('1');
});

test('detects the manually used provider without automatically registering or repeating it', async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(`${origin}/?federated&cancel`);
  await page.locator('#google-login-page').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  await expect(page.locator('#clicks')).toHaveText('0');
  await page.locator('#google-login-page').click();
  await expect.poll(async () => await extension.worker.evaluate(() => chrome.storage.local.get('pendingSite')))
    .toMatchObject({ pendingSite: { origin, method: 'federated', provider: 'google', federatedUsed: true } });
  expect(await extension.worker.evaluate(() => chrome.storage.local.get('registeredOrigins'))).toEqual({});
  await settle(page);
  await expect(page.locator('#clicks')).toHaveText('1');
});

test('removal and manual input stop external login before the button becomes available', async ({ extension }) => {
  for (const stop of ['removal', 'input']) {
    await extension.worker.evaluate(({ origin }) => chrome.storage.local.set({
      registeredOrigins: [origin], passkeyOrigins: [], passkeyFrameOrigins: {}, federatedProviders: { [origin]: 'google' },
    }), { origin });
    const page = await extension.context.newPage();
    await page.goto(`${origin}/?federated&cancel`);
    if (stop === 'removal') await extension.worker.evaluate(() => chrome.storage.local.set({ registeredOrigins: [], federatedProviders: {} }));
    else await page.locator('input[type="email"]').fill('manual@example.com');
    await page.locator('#google-login-page').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
    await settle(page);
    await expect(page.locator('#clicks')).toHaveText('0');
    await expect(page.locator('#submits')).toHaveText('0');
    await page.close();
  }
});

for (const autocomplete of ['', '&autocomplete=on']) {
  test(`submits an IAM-shaped form using the username rather than the account ID (${autocomplete || 'no autocomplete'})`, async ({ extension }) => {
    await register(extension.worker, 'password');
    const page = await extension.context.newPage();
    await page.goto(`${origin}/?iam${autocomplete}`);
    await expect(page.locator('#auth')).toHaveText('success');
    await expect(page.locator('#username')).toHaveAttribute('autocomplete', autocomplete ? 'on' : 'username');
    await expect(page.locator('#account')).not.toHaveAttribute('autocomplete', 'username');
    await settle(page);
    await expect(page.locator('#clicks')).toHaveText('1');
    await expect(page.locator('#submits')).toHaveText('1');
    await expect(page.locator('#account')).toHaveValue('123456789012');
  });
}

test('waits for an enabled submit button and submits exactly once', async ({ extension }) => {
  await register(extension.worker, 'password');
  const page = await extension.context.newPage();
  await page.goto(origin);
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await expect(page.locator('#submits')).toHaveText('1');
  await settle(page);
  await expect(page.locator('#clicks')).toHaveText('1');
  await expect(page.locator('#submits')).toHaveText('1');
  await page.reload();
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await expect(page.locator('#submits')).toHaveText('1');
  await expect(page.locator('#clicks')).toHaveText('1');
});

test('waits for a hidden submit control to become visible', async ({ extension }) => {
  await register(extension.worker, 'password');
  const page = await extension.context.newPage();
  await page.goto(origin);
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; (button as HTMLElement).hidden = true; });
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
  await page.locator('button').evaluate((button) => { (button as HTMLElement).hidden = false; });
  await expect(page.locator('#submits')).toHaveText('1');
});

test('stops if page input handlers turn the form into a password registration form', async ({ extension }) => {
  await register(extension.worker, 'password');
  const page = await extension.context.newPage();
  await page.goto(`${origin}/?mutate`);
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  await expect(page.locator('input[type=password]')).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.locator('#clicks')).toHaveText('0');
  await expect(page.locator('#submits')).toHaveText('0');
});

test('registration removal and navigation prevent stale automatic login', async ({ extension }) => {
  await register(extension.worker, 'password');
  const page = await extension.context.newPage();
  await page.goto(origin);
  await extension.worker.evaluate(() => chrome.storage.local.set({ registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {} }));
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
  await page.goto(`${origin}/navigated`);
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
});

test('extension reload stops old content scripts without uncaught errors or submission', async ({ extension }) => {
  await register(extension.worker, 'password');
  const page = await extension.context.newPage();
  const session = await extension.context.newCDPSession(page);
  const errors: string[] = [];
  session.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
  });
  await session.send('Runtime.enable');
  await page.goto(origin);
  const workerClosed = extension.worker.waitForEvent('close');
  await extension.worker.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 0); });
  await workerClosed;
  await page.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  await expect(page.locator('#submits')).toHaveText('0');
  expect(errors).toEqual([]);
});

for (const cancel of [false, true]) {
  test(`automatically starts virtual WebAuthn and ${cancel ? 'does not retry cancellation' : 'completes authentication'}`, async ({ extension }) => {
    await register(extension.worker, 'passkey');
    const page = await extension.context.newPage();
    const session = await extension.context.newCDPSession(page);
    await session.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: !cancel,
    } });
    await page.goto(`${origin}/?passkey`);
    // Generate a fresh test-only resident credential on this localhost RP.
    await session.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
    await page.evaluate(async () => {
      await navigator.credentials.create({ publicKey: {
        challenge: new Uint8Array([5, 6, 7, 8]), rp: { name: 'Fixture', id: 'localhost' },
        user: { id: new Uint8Array([1]), name: 'fixture@example.com', displayName: 'Fixture' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      } });
    });
    await session.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: !cancel });
    await page.locator('#passkey').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
    await expect(page.locator('#clicks')).toHaveText('1');
    if (cancel) {
      await expect(page.locator('#auth')).toHaveText('pending');
      await page.evaluate(() => (window as unknown as { cancelAuthentication: () => void }).cancelAuthentication());
      await expect(page.locator('#auth')).toHaveText('AbortError');
    } else {
      await expect(page.locator('#auth')).toHaveText('success');
    }
    await settle(page);
    await expect(page.locator('#clicks')).toHaveText('1');
    await session.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  });
}

test('rechecks an approved authentication iframe when it becomes visible without tab URL access', async ({ extension }) => {
  await extension.worker.evaluate(({ origin }) => chrome.storage.local.set({
    registeredOrigins: [origin], passkeyOrigins: [origin], passkeyFrameOrigins: { [origin]: 'http://localhost:4176' },
  }), { origin });
  const page = await extension.context.newPage();
  await page.goto(`${origin}/?frame`);
  const frame = page.frameLocator('iframe');
  await frame.locator('button').evaluate((button) => { (button as HTMLButtonElement).disabled = false; });
  await settle(page);
  await expect(frame.locator('#clicks')).toHaveText('0');
  await page.locator('iframe').evaluate((iframe) => { (iframe as HTMLElement).hidden = false; });
  await expect(frame.locator('#clicks')).toHaveText('1');
});

test('rejects registration commands from an ordinary extension tab', async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(`chrome-extension://${extension.id}/popup.html`);
  const results = await page.evaluate(async () => await Promise.all([
    chrome.runtime.sendMessage({ type: 'register-origin', origin: 'https://first.example', method: 'password' }),
    chrome.runtime.sendMessage({ type: 'register-origin', origin: 'https://second.example', method: 'passkey' }),
  ]));
  expect(results.every((result) => result.ok === false)).toBe(true);
  expect(await extension.worker.evaluate(() => chrome.storage.local.get(['registeredOrigins', 'passkeyOrigins'])))
    .toEqual({});
});
