import { describe, expect, it } from 'vitest';
import { isHttpOrigin, normalizeOrigin } from './origins';

describe('normalizeOrigin', () => {
  it('normalizes an HTTP URL to its origin', () => {
    expect(normalizeOrigin('https://example.com/login?next=/home')).toBe('https://example.com');
  });

  it('preserves a non-default port', () => {
    expect(normalizeOrigin('http://localhost:3000/login')).toBe('http://localhost:3000');
  });

  it('rejects unsupported protocols and invalid values', () => {
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeOrigin('not a URL')).toBeNull();
  });
});

describe('isHttpOrigin', () => {
  it('accepts HTTP and HTTPS URLs', () => {
    expect(isHttpOrigin('https://example.com')).toBe(true);
    expect(isHttpOrigin('http://localhost:3000')).toBe(true);
  });

  it('rejects browser-internal URLs', () => {
    expect(isHttpOrigin('chrome://settings')).toBe(false);
  });
});
