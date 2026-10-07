export const FEDERATED_PROVIDERS = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  microsoft: 'Microsoft',
  github: 'GitHub',
} as const;

export type FederatedProvider = keyof typeof FEDERATED_PROVIDERS;

export function isFederatedProvider(value: unknown): value is FederatedProvider {
  return typeof value === 'string' && Object.hasOwn(FEDERATED_PROVIDERS, value);
}
