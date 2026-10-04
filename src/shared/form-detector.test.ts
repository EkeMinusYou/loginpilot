import { describe, expect, it } from 'vitest';
import { hasPendingPasswordAutofill, type LoginFormCandidate } from './form-detector';

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
