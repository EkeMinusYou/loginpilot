import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { findPasskeyLoginButton, hasVisibleAuthenticationFrame, PasskeyLoginController } from './passkey-login';
import type { AutofillResponse } from './messages';

afterEach(() => vi.useRealTimers());

function page(html: string): Document {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  for (const control of document.querySelectorAll<HTMLElement>('button, input, iframe, [role="button"]')) {
    Object.defineProperty(control, 'getClientRects', { configurable: true, value: () => [{}] });
  }
  return document;
}

function controller(document: Document, policy: AutofillResponse = { ok: true, action: 'submit', method: 'passkey' }) {
  const options = {
    root: document,
    canStart: vi.fn(() => true),
    getPolicy: vi.fn(async () => policy),
    reportCandidate: vi.fn(async (): Promise<AutofillResponse> => ({ ok: true, action: 'pending' })),
  };
  return { options, login: new PasskeyLoginController(options) };
}

describe('passkey button detection', () => {
  it.each(['Sign in with a passkey', 'Log in with passkey', 'Continue with passkeys', 'パスキーでログイン', 'パスキーでサインイン'])('recognizes explicit login: %s', (label) => {
    expect(findPasskeyLoginButton(page(`<button>${label}</button>`))).not.toBeNull();
  });
  it('uses accessible labels for icon buttons', () => {
    expect(findPasskeyLoginButton(page('<button aria-label="Sign in with passkey">Key icon</button>'))).not.toBeNull();
    expect(findPasskeyLoginButton(page('<span id="label">パスキーでログイン</span><button aria-labelledby="label">Key icon</button>'))).not.toBeNull();
  });
  it.each(['Create a passkey', 'Register passkey', 'Add passkey', 'Sign in and create a passkey', 'Manage passkeys', 'パスキーでログインを設定', 'パスキーを登録', 'パスキーを削除', 'Sign in', 'Passkey'])('ignores creation, management, and ambiguous controls: %s', (label) => {
    expect(findPasskeyLoginButton(page(`<button>${label}</button>`))).toBeNull();
  });
  it.each(['disabled', 'aria-disabled="true"', 'hidden', 'inert', 'aria-hidden="true"'])('ignores unavailable controls: %s', (attribute) => {
    expect(findPasskeyLoginButton(page(`<div ${attribute}><button ${attribute}>Sign in with passkey</button></div>`))).toBeNull();
  });
  it('ignores zero-size and disconnected controls', () => {
    const document = page('<button>Sign in with passkey</button>');
    const button = document.querySelector('button')!;
    Object.defineProperty(button, 'getClientRects', { value: () => [] });
    expect(findPasskeyLoginButton(document)).toBeNull();
    button.remove();
    expect(findPasskeyLoginButton(document)).toBeNull();
  });
  it('does not choose between multiple passkey accounts', () => {
    expect(findPasskeyLoginButton(page('<button>Sign in with passkey: A</button><button>Sign in with passkey: B</button>'))).toBeNull();
  });
  it('does not start authentication on a registration form', () => {
    expect(findPasskeyLoginButton(page('<form><input autocomplete="NEW-PASSWORD"><button>Sign in with passkey</button></form>'))).toBeNull();
  });
});

describe('passkey login authorization and lifecycle', () => {
  it('waits for account input to settle, then starts automatically without a popup action', async () => {
    vi.useFakeTimers();
    const document = page('<input type="email"><button disabled>パスキーでサインイン</button>');
    const button = document.querySelector('button')!;
    const click = vi.spyOn(button, 'click');
    const { login } = controller(document);
    login.pauseForAccountInput();
    button.removeAttribute('disabled');
    expect(await login.evaluate()).toBe(false);
    vi.advanceTimersByTime(250);
    login.pauseForAccountInput();
    vi.advanceTimersByTime(250);
    expect(await login.evaluate()).toBe(false);
    vi.advanceTimersByTime(50);
    expect(await login.evaluate()).toBe(true);
    expect(await login.evaluate()).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight automatic click while account input is still changing', async () => {
    vi.useFakeTimers();
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login, options } = controller(document);
    const policy = Promise.withResolvers<AutofillResponse>();
    options.getPolicy.mockReturnValueOnce(policy.promise);
    const evaluation = login.evaluate();
    login.pauseForAccountInput();
    policy.resolve({ ok: true, action: 'submit', method: 'passkey' });
    expect(await evaluation).toBe(false);
    vi.advanceTimersByTime(300);
    expect(await login.evaluate()).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it('does not undo a manual stop or retry a completed attempt when account input resumes', async () => {
    vi.useFakeTimers();
    const { login } = controller(page('<button>Sign in with passkey</button>'));
    login.markUserInteraction();
    login.pauseForAccountInput();
    vi.advanceTimersByTime(300);
    expect(await login.evaluate()).toBe(false);
    expect(await login.evaluate(true)).toBe(true);
    login.pauseForAccountInput();
    vi.advanceTimersByTime(300);
    expect(await login.evaluate()).toBe(false);
  });

  it('clicks only once, even after cancellation or button replacement', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    const { login } = controller(document);
    expect(await login.evaluate()).toBe(true);
    expect(await login.evaluate()).toBe(false);
    const replacement = document.createElement('button');
    replacement.textContent = 'Sign in with passkey';
    Object.defineProperty(replacement, 'getClientRects', { value: () => [{}] });
    replacement.addEventListener('click', click);
    document.querySelector('button')!.replaceWith(replacement);
    expect(await login.evaluate()).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(await login.evaluate(true)).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
  });
  it('reports an unregistered site once without clicking it', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login, options } = controller(document, { ok: true, action: 'ignore' });
    await login.evaluate();
    await login.evaluate();
    expect(click).not.toHaveBeenCalled();
    expect(options.reportCandidate).toHaveBeenCalledTimes(1);
  });
  it('leaves a password-configured site on its existing login path', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login, options } = controller(document, { ok: true, action: 'submit' });
    await login.evaluate();
    expect(click).not.toHaveBeenCalled();
    expect(options.reportCandidate).not.toHaveBeenCalled();
  });
  it('does not act in a hidden or insecure context', async () => {
    const { login, options } = controller(page('<button>Sign in with passkey</button>'));
    options.canStart.mockReturnValue(false);
    expect(await login.evaluate(true)).toBe(false);
    expect(options.getPolicy).not.toHaveBeenCalled();
  });
  it('stops when the user interacts while authorization is in flight', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login, options } = controller(document);
    let finish!: (policy: AutofillResponse) => void;
    options.getPolicy.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = login.evaluate();
    expect(await login.evaluate()).toBe(false);
    login.markUserInteraction();
    finish({ ok: true, action: 'submit', method: 'passkey' });
    expect(await pending).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('rechecks visibility and the exact button after authorization', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const button = document.querySelector('button')!;
    const click = vi.spyOn(button, 'click');
    const { login, options } = controller(document);
    options.getPolicy.mockImplementationOnce(async () => {
      button.setAttribute('disabled', '');
      return { ok: true, action: 'submit', method: 'passkey' };
    });
    expect(await login.evaluate()).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('does not start after user input unless explicitly requested from the popup', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login } = controller(document);
    login.markUserInteraction();
    expect(await login.evaluate()).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(await login.evaluate(true)).toBe(true);
  });
  it('reports a button that appears after typing an Apple Account email without starting it', async () => {
    const document = page('<input type="email"><button disabled>パスキーでサインイン</button>');
    const button = document.querySelector('button')!;
    const click = vi.spyOn(button, 'click');
    const { login, options } = controller(document, { ok: true, action: 'ignore' });
    login.markUserInteraction();
    expect(await login.evaluate()).toBe(false);
    button.removeAttribute('disabled');
    await login.evaluate();
    expect(options.reportCandidate).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
    options.getPolicy.mockResolvedValue({ ok: true, action: 'submit', method: 'passkey' });
    expect(await login.evaluate(true)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
  it('leaves the page untouched when messaging fails', async () => {
    const document = page('<button>Sign in with passkey</button>');
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    const { login, options } = controller(document);
    options.getPolicy.mockRejectedValueOnce(new Error('Disconnected'));
    expect(await login.evaluate()).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});

describe('authentication frame visibility', () => {
  it('proves a single visible frame with the expected origin', () => {
    expect(hasVisibleAuthenticationFrame('https://idmsa.apple.com', page('<iframe src="https://idmsa.apple.com/appleauth/auth/signin"></iframe>'))).toBe(true);
  });
  it('rejects hidden frames, wrong origins, and multiple frames including a hidden duplicate', () => {
    expect(hasVisibleAuthenticationFrame('https://idmsa.apple.com', page('<iframe hidden src="https://idmsa.apple.com/auth"></iframe>'))).toBe(false);
    expect(hasVisibleAuthenticationFrame('https://idmsa.apple.com', page('<iframe src="https://other.example/auth"></iframe>'))).toBe(false);
    expect(hasVisibleAuthenticationFrame('https://idmsa.apple.com', page('<iframe src="https://idmsa.apple.com/auth"></iframe><iframe hidden src="https://idmsa.apple.com/auth"></iframe>'))).toBe(false);
  });
});
