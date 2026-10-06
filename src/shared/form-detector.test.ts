import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { findLoginForm, hasPendingPasswordAutofill, isCurrentLoginForm, type LoginFormCandidate } from './form-detector';
import { loginPage } from './test-dom';

function root(html: string): ParentNode {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  for (const input of document.querySelectorAll('input')) {
    Object.defineProperties(input, {
      autocomplete: { value: input.getAttribute('autocomplete') ?? '' },
      getClientRects: { value: () => [{}] },
    });
  }
  return document as unknown as ParentNode;
}

describe('findLoginForm', () => {
  it('finds a normal login form with section-prefixed autocomplete tokens', () => {
    const candidate = findLoginForm(root('<form><input type="email" autocomplete="section-login username"><input type="password" autocomplete="section-login current-password"></form>'));
    expect(candidate).not.toBeNull();
    expect(candidate?.passwordInput.autocomplete).toBe('section-login current-password');
  });

  it.each(['new-password', 'section-signup new-password', 'NEW-PASSWORD'])(
    'rejects registration forms marked %s', (autocomplete) => {
      expect(findLoginForm(root(`<form><input type="email"><input type="password" autocomplete="${autocomplete}"></form>`))).toBeNull();
    },
  );

  it('rejects password-change forms containing both old and new passwords', () => {
    expect(findLoginForm(root('<form><input type="email"><input type="password" autocomplete="current-password"><input type="password" autocomplete="new-password"></form>'))).toBeNull();
  });

  it('rejects unmarked registration forms with a confirmation password', () => {
    expect(findLoginForm(root('<form><input type="email"><input type="password"><input type="password"></form>'))).toBeNull();
  });

  it('skips registration forms and finds a subsequent login form', () => {
    const candidate = findLoginForm(root('<form id="signup"><input type="email"><input type="password" autocomplete="new-password"></form><form id="login"><input type="email"><input type="password" autocomplete="current-password"></form>'));
    expect(candidate?.form.id).toBe('login');
  });

  it('continues to support login forms without autocomplete hints', () => {
    expect(findLoginForm(root('<form><input type="text" name="username"><input type="password" name="password"></form>'))).not.toBeNull();
  });

  it.each(['new-password', 'disabled', 'readonly', 'hidden'])('rejects a retained candidate after its password field changes to %s', (attribute) => {
    const { document } = loginPage('<form><input type="email"><input type="password" autocomplete="current-password"></form>');
    const candidate = findLoginForm(document)!;
    expect(isCurrentLoginForm(candidate)).toBe(true);
    candidate.passwordInput.setAttribute(attribute === 'new-password' ? 'autocomplete' : attribute, attribute === 'new-password' ? 'new-password' : '');
    expect(findLoginForm(document)).toBeNull();
    expect(isCurrentLoginForm(candidate)).toBe(false);
  });

  it('does not treat replacement fields as the retained login candidate', () => {
    const { document } = loginPage('<form><input type="email"><input type="password"></form>');
    const candidate = findLoginForm(document)!;
    const replacement = candidate.usernameInput.cloneNode(true) as HTMLInputElement;
    Object.defineProperties(replacement, { form: { get: () => replacement.closest('form') },
      autocomplete: { get: () => replacement.getAttribute('autocomplete') ?? '' }, getClientRects: { value: () => [{}] } });
    candidate.usernameInput.replaceWith(replacement);
    expect(findLoginForm(document)?.usernameInput).toBe(replacement);
    expect(isCurrentLoginForm(candidate)).toBe(false);
  });
});

function candidate(username: string, password: string, passwordAutofilled: boolean): LoginFormCandidate {
  return {
    form: {} as HTMLFormElement,
    usernameInput: { value: username, matches: () => false } as unknown as HTMLInputElement,
    passwordInput: { value: password, matches: () => passwordAutofilled } as unknown as HTMLInputElement,
  };
}

describe('hasPendingPasswordAutofill', () => {
  it('detects the native password preview while both DOM values are still empty', () => {
    expect(hasPendingPasswordAutofill(candidate('', '', true))).toBe(true);
  });
  it('detects a password preview with a prefilled username', () => {
    expect(hasPendingPasswordAutofill(candidate('review@example.com', '', true))).toBe(true);
  });
  it('does not activate already committed credentials', () => {
    expect(hasPendingPasswordAutofill(candidate('review@example.com', 'test-password', true))).toBe(false);
  });
  it('does not treat an empty or manually typed password as a native preview', () => {
    expect(hasPendingPasswordAutofill(candidate('', '', false))).toBe(false);
    expect(hasPendingPasswordAutofill(candidate('', 'test-password', false))).toBe(false);
  });
  it('falls back to the Chrome selector when the standard selector is unsupported', () => {
    const form = candidate('', '', false);
    form.passwordInput.matches = ((selector: string): boolean => {
      if (selector === ':autofill') throw new Error('Unsupported selector');
      return selector === ':-webkit-autofill';
    }) as HTMLInputElement['matches'];
    expect(hasPendingPasswordAutofill(form)).toBe(true);
  });
});
