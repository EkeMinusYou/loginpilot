import { isControlAvailable } from './control-availability';

const USERNAME_TOKENS = ['user', 'email', 'login', 'account', 'identifier', 'username'];
const PASSWORD_TOKENS = ['pass', 'password', 'credential'];

export interface LoginFormCandidate {
  form: HTMLFormElement;
  usernameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
}

function isVisibleInput(input: HTMLInputElement): boolean {
  return !input.readOnly && isControlAvailable(input);
}

function inputTokens(input: HTMLInputElement): string {
  return [input.name, input.id, input.getAttribute('aria-label') ?? '', input.placeholder]
    .join(' ')
    .toLowerCase();
}

function autocompleteTokens(input: HTMLInputElement): string[] {
  return input.autocomplete.toLowerCase().split(/\s+/);
}

function scoreUsernameInput(input: HTMLInputElement): number {
  if (!isVisibleInput(input)) {
    return -1;
  }

  const type = input.type.toLowerCase();
  if (!['text', 'email', 'tel'].includes(type)) {
    return -1;
  }

  const autocomplete = autocompleteTokens(input);
  const tokens = inputTokens(input);

  let score = type === 'email' ? 30 : 10;
  if (autocomplete.includes('username')) {
    score += 100;
  }
  if (USERNAME_TOKENS.some((token) => tokens.includes(token))) {
    score += 50;
  }

  return score;
}

function scorePasswordInput(input: HTMLInputElement): number {
  if (!isVisibleInput(input) || input.type.toLowerCase() !== 'password') {
    return -1;
  }

  const autocomplete = autocompleteTokens(input);
  const tokens = inputTokens(input);
  let score = 10;

  if (autocomplete.includes('current-password') || autocomplete.includes('password')) {
    score += 100;
  }
  if (PASSWORD_TOKENS.some((token) => tokens.includes(token))) {
    score += 50;
  }

  return score;
}

function getBestInput<T extends HTMLInputElement>(
  inputs: T[],
  score: (input: T) => number,
): T | null {
  let best: T | null = null;
  let bestScore = -1;

  for (const input of inputs) {
    const inputScore = score(input);
    if (inputScore > bestScore) {
      best = input;
      bestScore = inputScore;
    }
  }

  return best;
}

function candidateForForm(form: HTMLFormElement): LoginFormCandidate | null {
  const inputs = Array.from(form.querySelectorAll('input'));
  const passwords = inputs.filter((input) => input.type.toLowerCase() === 'password');
  // Registration and password-change forms must never receive saved login credentials.
  if (passwords.length !== 1 || autocompleteTokens(passwords[0]!).includes('new-password')) return null;
  const usernameInput = getBestInput(inputs, scoreUsernameInput);
  const passwordInput = getBestInput(inputs, scorePasswordInput);
  return usernameInput && passwordInput ? { form, usernameInput, passwordInput } : null;
}

export function findLoginForm(root: ParentNode = document): LoginFormCandidate | null {
  for (const form of root.querySelectorAll('form')) {
    const candidate = candidateForForm(form);
    if (candidate) return candidate;
  }

  return null;
}

export function hasCredentials(candidate: LoginFormCandidate): boolean {
  return candidate.usernameInput.value.trim().length > 0 && candidate.passwordInput.value.length > 0;
}

/** Revalidate retained references after asynchronous work and page event handlers. */
export function isCurrentLoginForm(candidate: LoginFormCandidate): boolean {
  const { form, usernameInput, passwordInput } = candidate;
  if (!form.isConnected || !usernameInput.isConnected || !passwordInput.isConnected ||
    usernameInput.form !== form || passwordInput.form !== form) return false;
  const current = candidateForForm(form);
  return current?.usernameInput === usernameInput && current.passwordInput === passwordInput;
}

function matchesAutofillSelector(input: HTMLInputElement, selector: string): boolean {
  try {
    return input.matches(selector);
  } catch {
    return false;
  }
}

export function hasPendingPasswordAutofill(candidate: LoginFormCandidate): boolean {
  return !hasCredentials(candidate) && (
    matchesAutofillSelector(candidate.passwordInput, ':autofill') ||
    matchesAutofillSelector(candidate.passwordInput, ':-webkit-autofill')
  );
}
