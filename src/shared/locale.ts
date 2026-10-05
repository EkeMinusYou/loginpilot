export const LOCALES = ['ja', 'en'] as const;
export type Locale = typeof LOCALES[number];
export type LocalePreference = Locale | 'auto';

export function isLocale(value: unknown): value is Locale {
  return value === 'ja' || value === 'en';
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return isLocale(value) ? value : 'auto';
}

export function resolveLocale(languages: readonly string[], preference: LocalePreference = 'auto'): Locale {
  if (preference !== 'auto') return preference;
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}
