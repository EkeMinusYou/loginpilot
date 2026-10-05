import { browser } from 'wxt/browser';
import { normalizeLocalePreference, resolveLocale, type LocalePreference } from './locale';

const LANGUAGE_KEY = 'language';

export function getBrowserLocale() {
  return resolveLocale([browser.i18n.getUILanguage()]);
}

export async function getLanguagePreference(): Promise<LocalePreference> {
  const stored = await browser.storage.local.get(LANGUAGE_KEY);
  return normalizeLocalePreference(stored[LANGUAGE_KEY]);
}

export async function setLanguagePreference(preference: LocalePreference): Promise<void> {
  await browser.storage.local.set({ [LANGUAGE_KEY]: preference });
}

export async function getExtensionLocale() {
  const preference = await getLanguagePreference().catch(() => 'auto' as const);
  return resolveLocale([browser.i18n.getUILanguage()], preference);
}
