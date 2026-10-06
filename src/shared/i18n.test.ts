import { describe, expect, it } from 'vitest';
import { createTranslator, en, ja, type MessageKey } from './i18n';
import { normalizeLocalePreference, resolveLocale } from './locale';

describe('language selection', () => {
  it('handles regional tags, preferences, and unsupported languages', () => {
    expect(resolveLocale(['ja-JP'])).toBe('ja');
    expect(resolveLocale(['en_US'])).toBe('en');
    expect(resolveLocale(['fr', 'ja'])).toBe('ja');
    expect(resolveLocale(['fr'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
    expect(resolveLocale(['ja'], 'en')).toBe('en');
    expect(resolveLocale(['en'], 'ja')).toBe('ja');
    expect(normalizeLocalePreference('bad-setting')).toBe('auto');
    expect(normalizeLocalePreference(null)).toBe('auto');
  });
});

describe('extension translations', () => {
  it('provides both languages with matching interpolation parameters', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
    for (const key of Object.keys(ja) as MessageKey[]) {
      expect(en[key].length).toBeGreaterThan(0);
      expect([...en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort())
        .toEqual([...ja[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
    }
  });

  it('interpolates dynamic values without treating them as replacement syntax', () => {
    const origin = 'https://example.com/$&';
    expect(createTranslator('en')('removeLabel', { origin })).toBe(`Remove ${origin}`);
    expect(createTranslator('ja')('siteCount', { count: 12 })).toBe('12件');
  });

});
