import { describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { FederatedLoginController, findFederatedLoginButtons } from './federated-login';
import type { AutofillResponse } from './messages';

function page(markup: string): Document {
  const { document } = parseHTML(`<html><body>${markup}</body></html>`);
  for (const control of document.querySelectorAll<HTMLElement>('button, input, a, [role="button"]')) {
    Object.defineProperty(control, 'getClientRects', { configurable: true, value: () => [{}] });
  }
  return document;
}

function controller(document: Document, policy: AutofillResponse = { ok: true, action: 'submit', method: 'federated', provider: 'google' }) {
  const options = { root: document, canStart: vi.fn(() => true),
    getPolicy: vi.fn(async () => policy) };
  return { options, login: new FederatedLoginController(options) };
}

describe('external login button detection', () => {
  it.each([
    ['Continue with Google', 'google'], ['Sign in with Google', 'google'], ['Googleでログイン', 'google'],
    ['Appleでサインイン', 'apple'], ['Continue with Facebook', 'facebook'], ['Continue with X', 'twitter'],
    ['Twitterで続ける', 'twitter'], ['Sign in with Microsoft', 'microsoft'], ['Log in with GitHub', 'github'],
  ])('recognizes an explicit provider choice: %s', (label, provider) => {
    expect(findFederatedLoginButtons(page(`<button>${label}</button>`))[0]?.provider).toBe(provider);
  });
  it('uses accessible labels, links, input values, and nested button text', () => {
    const document = page('<a href="/auth/google" aria-label="Sign in with Google">G</a><span id="label">Appleでログイン</span><button aria-labelledby="label">A</button><input type="button" value="Continue with Microsoft"><button id="google-login-page" type="submit"><span><span>Continue with Google</span></span></button>');
    expect(findFederatedLoginButtons(document).map(({ provider }) => provider)).toEqual(['google', 'apple', 'microsoft', 'google']);
  });
  it.each(['Google', 'Sign in', 'Connect Google', 'Sign in and connect Google', 'Sign up with Google',
    'Continue with Google to create an account', 'Googleでログインを設定', 'Googleとの連携を解除', 'Approve Google',
    'Continue with Google or Apple'])('rejects ambiguous, registration, and account management actions: %s', (label) => {
    expect(findFederatedLoginButtons(page(`<button>${label}</button>`))).toEqual([]);
  });
  it('does not automate a new-password registration form', () => {
    expect(findFederatedLoginButtons(page('<input autocomplete="new-password"><button>Continue with Google</button>'))).toEqual([]);
  });
  it.each(['disabled', 'aria-disabled="true"', 'hidden', 'inert', 'aria-hidden="true"'])('rejects unavailable controls: %s', (attribute) => {
    expect(findFederatedLoginButtons(page(`<div ${attribute}><button ${attribute}>Continue with Google</button></div>`))).toEqual([]);
  });
  it('collapses a nested role into its containing button', () => {
    expect(findFederatedLoginButtons(page('<button><span role="button">Continue with Google</span></button>'))).toHaveLength(1);
  });
});

describe('external login authorization and lifecycle', () => {
  it('clicks only the saved provider once when other login methods are present', async () => {
    const document = page('<button id="google-login-page">Continue with Google</button><button>Continue with Apple</button><form><input type="password"><button>Sign in</button></form>');
    const clicks = [...document.querySelectorAll('button')].map((button) => vi.spyOn(button, 'click'));
    const { login } = controller(document);
    expect(await login.evaluate()).toBe(true);
    expect(await login.evaluate()).toBe(false);
    expect(clicks[0]).toHaveBeenCalledOnce();
    expect(clicks[1]).not.toHaveBeenCalled();
    expect(clicks[2]).not.toHaveBeenCalled();
  });
  it('does not infer a provider on an unregistered page with several choices', async () => {
    const { login, options } = controller(page('<button>Continue with Google</button><button>Continue with Apple</button>'), { ok: true, action: 'ignore' });
    expect(await login.evaluate()).toBe(false);
    expect(options.getPolicy).toHaveBeenCalledOnce();
  });
  it('leaves a single unregistered choice untouched', async () => {
    const document = page('<button>Continue with Google</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login, options } = controller(document, { ok: true, action: 'ignore' });
    await login.evaluate();
    await login.evaluate();
    expect(options.getPolicy).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
  it('waits for the configured provider and refuses duplicate matching choices', async () => {
    const document = page('<button disabled>Continue with Google</button><button>Continue with Apple</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login } = controller(document);
    expect(await login.evaluate()).toBe(false);
    document.querySelector('button')!.removeAttribute('disabled');
    document.body.insertAdjacentHTML('beforeend', '<button>Continue with Google</button>');
    Object.defineProperty(document.body.lastElementChild!, 'getClientRects', { value: () => [{}] });
    expect(await login.evaluate()).toBe(false);
    document.body.lastElementChild!.remove();
    expect(await login.evaluate()).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
  it('does not restart a cancelled flow after the button is replaced', async () => {
    const document = page('<button>Continue with Google</button>');
    const { login } = controller(document);
    await login.evaluate();
    document.body.innerHTML = '<button>Continue with Google</button>';
    Object.defineProperty(document.querySelector('button')!, 'getClientRects', { value: () => [{}] });
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    login.invalidatePolicy();
    expect(await login.evaluate(true)).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it.each(['interaction', 'removal', 'hidden', 'replacement'] as const)('cancels pending work after %s', async (change) => {
    const document = page('<button>Continue with Google</button>');
    const button = document.querySelector('button')!;
    const click = vi.spyOn(button, 'click');
    const { login, options } = controller(document);
    let reply!: (response: AutofillResponse) => void;
    options.getPolicy.mockImplementationOnce(() => new Promise((resolve) => { reply = resolve; }));
    const pending = login.evaluate();
    if (change === 'interaction') login.markUserInteraction();
    if (change === 'removal') login.invalidatePolicy();
    if (change === 'hidden') options.canStart.mockReturnValue(false);
    if (change === 'replacement') button.remove();
    reply({ ok: true, action: 'submit', method: 'federated', provider: 'google' });
    expect(await pending).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('never uses a password or passkey policy to click an external provider', async () => {
    const document = page('<button>Continue with Google</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    for (const method of ['password', 'passkey'] as const) await controller(document, { ok: true, action: 'submit', method }).login.evaluate();
    expect(click).not.toHaveBeenCalled();
  });
});
