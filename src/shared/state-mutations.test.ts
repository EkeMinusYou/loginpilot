import { describe, expect, it } from 'vitest';
import { shouldReplaceCandidate } from './state-mutations';
import type { PendingSite } from './messages';

const origin = 'https://example.com';
const used: PendingSite = { origin, method: 'passkey', passkeyUsed: true, detectedAt: 1 };

describe('registration candidate precedence', () => {
  it('retains completed usage over later autofill or button hints', () => {
    expect(shouldReplaceCandidate(used, { origin, detectedAt: 2 })).toBe(false);
    expect(shouldReplaceCandidate(used, { origin, method: 'passkey', detectedAt: 2 })).toBe(false);
    expect(shouldReplaceCandidate({ ...used, authenticationOrigin: 'https://auth.example' }, { origin, detectedAt: 2 })).toBe(false);
  });
  it('replaces weaker hints with usage and treats different sites/pairs independently', () => {
    expect(shouldReplaceCandidate({ origin, detectedAt: 1 }, used)).toBe(true);
    expect(shouldReplaceCandidate(used, { origin: 'https://other.example', detectedAt: 2 })).toBe(true);
    expect(shouldReplaceCandidate(used, { origin, method: 'passkey', authenticationOrigin: 'https://auth.example', detectedAt: 2 })).toBe(true);
    expect(shouldReplaceCandidate({ ...used, authenticationOrigin: 'https://auth.example' }, { origin, method: 'passkey', authenticationOrigin: 'https://other-auth.example', detectedAt: 2 })).toBe(true);
  });
});
