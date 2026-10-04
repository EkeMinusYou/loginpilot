const USERNAME_TOKENS = ['user', 'email', 'login', 'account', 'identifier', 'username'];
const PASSWORD_TOKENS = ['pass', 'password', 'credential'];

export interface LoginFormCandidate {
  form: HTMLFormElement;
  usernameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
}

function isVisibleInput(input: HTMLInputElement): boolean {
  return !input.disabled && !input.readOnly && input.getClientRects().length > 0;
}

function inputTokens(input: HTMLInputElement): string {
  return [input.name, input.id, input.getAttribute('aria-label') ?? '', input.placeholder]
    .join(' ')
    .toLowerCase();
}

function scoreUsernameInput(input: HTMLInputElement): number {
  if (!isVisibleInput(input)) {
    return -1;
  }

  const type = input.type.toLowerCase();
  if (!['text', 'email', 'tel'].includes(type)) {
    return -1;
  }

  const autocomplete = input.autocomplete.toLowerCase();
  const tokens = inputTokens(input);

  let score = type === 'email' ? 30 : 10;
  if (autocomplete === 'username') {
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

  const autocomplete = input.autocomplete.toLowerCase();
  const tokens = inputTokens(input);
  let score = 10;

  if (autocomplete === 'current-password' || autocomplete === 'password') {
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

export function findLoginForm(root: ParentNode = document): LoginFormCandidate | null {
  const forms = Array.from(root.querySelectorAll('form'));

  for (const form of forms) {
    const inputs = Array.from(form.querySelectorAll('input'));
    const usernameInput = getBestInput(inputs, scoreUsernameInput);
    const passwordInput = getBestInput(inputs, scorePasswordInput);

    if (usernameInput && passwordInput) {
      return { form, usernameInput, passwordInput };
    }
  }

  return null;
}

export function hasCredentials(candidate: LoginFormCandidate): boolean {
  return candidate.usernameInput.value.trim().length > 0 && candidate.passwordInput.value.length > 0;
}

function matchesAutofillSelector(input: HTMLInputElement, selector: string): boolean {
  try {
    return input.matches(selector);
  } catch {
    return false;
  }
}

export function hasAutofillMarker(candidate: LoginFormCandidate): boolean {
  return [candidate.usernameInput, candidate.passwordInput].some(
    (input) => matchesAutofillSelector(input, ':autofill') || matchesAutofillSelector(input, ':-webkit-autofill'),
  );
}

export function hasPendingPasswordAutofill(candidate: LoginFormCandidate): boolean {
  return !hasCredentials(candidate) && (
    matchesAutofillSelector(candidate.passwordInput, ':autofill') ||
    matchesAutofillSelector(candidate.passwordInput, ':-webkit-autofill')
  );
}
