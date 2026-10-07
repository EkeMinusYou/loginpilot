import { parseHTML } from 'linkedom';
import type { Locale } from '../../src/shared/locale.ts';
import { translations } from './locales/en.ts';

const origin = 'https://loginpilot.ekeminusyou.com';
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;

export function localizeHtml(template: string, locale: Locale, depth = 0): string {
  const { document } = parseHTML(template);
  document.documentElement.lang = locale;
  const path = `/${locale}/`;
  const title = locale === 'ja'
    ? 'Login Pilot — Chromeの自動入力。そのあとのログインも、自動で。'
    : 'Login Pilot — Chrome autofills. Then you sign in. Automatically.';
  document.title = title;
  const meta = (selector: string, content: string) => document.querySelector(selector)!.setAttribute('content', content);
  meta('[property="og:title"]', title);
  meta('[property="og:url"]', origin + path);
  meta('[property="og:locale"]', locale === 'ja' ? 'ja_JP' : 'en_US');
  meta('[property="og:image"]', origin + (locale === 'ja' ? '/social.png' : '/social-en.png'));
  meta('[property="og:image:alt"]', title);
  document.querySelector('[rel="canonical"]')!.setAttribute('href', origin + path);
  for (const [language, url] of [['ja', '/ja/'], ['en', '/en/'], ['x-default', '/']]) {
    const alternate = document.createElement('link');
    alternate.setAttribute('rel', 'alternate');
    alternate.setAttribute('hreflang', language!);
    alternate.setAttribute('href', origin + url);
    document.head.append(alternate);
  }
  const ogAlternate = document.createElement('meta');
  ogAlternate.setAttribute('property', 'og:locale:alternate');
  ogAlternate.setAttribute('content', locale === 'ja' ? 'en_US' : 'ja_JP');
  document.head.append(ogAlternate);

  for (const link of document.querySelectorAll('a[href="/"]')) link.setAttribute('href', path);
  for (const link of document.querySelectorAll('[data-language]')) {
    if (link.getAttribute('data-language') === locale) link.setAttribute('aria-current', 'page');
  }

  if (locale === 'en') {
    meta('[name="description"]', 'A Chrome extension that automatically clicks sign in on registered sites after your saved details are filled in. Also starts passkey authentication. Never stores your ID or password. Preparing for Chrome Web Store release.');
    meta('[property="og:description"]', 'Go beyond Chrome autofill. Login Pilot automatically clicks the sign-in button on sites you register.');
    for (const [marker, attribute] of [['data-i18n', null], ['data-i18n-aria-label', 'aria-label']] as const) {
      for (const node of document.querySelectorAll(`[${marker}]`)) {
        const key = node.getAttribute(marker)!;
        if (!Object.hasOwn(translations, key)) throw new Error(`Missing English LP translation: ${key}`);
        const translated = translations[key as keyof typeof translations];
        if (attribute) node.setAttribute(attribute, translated);
        else node.textContent = (node.textContent ?? '').replace((node.textContent ?? '').trim(), () => translated);
      }
    }
    // Catch new copy that was added without a stable translation key.
    const checkCoverage = (node: Node): void => {
      if (node.nodeType === 3 && japanese.test(node.textContent ?? '')) throw new Error('LP text is missing a data-i18n key');
      for (const child of node.childNodes) {
        if (child.nodeType === 1 && (child as Element).hasAttribute('data-language')) continue;
        checkCoverage(child);
      }
    };
    checkCoverage(document.body);
    for (const node of document.querySelectorAll('[aria-label]')) {
      if (japanese.test(node.getAttribute('aria-label')!)) throw new Error('LP aria-label is missing a data-i18n-aria-label key');
    }
  }
  document.querySelector('a[href$="/docs/privacy.md"]')?.setAttribute('href', `${path}privacy/`);
  if (depth > 0) {
    const prefix = '../'.repeat(depth);
    for (const node of document.querySelectorAll('[src], [href]')) {
      for (const attribute of ['src', 'href']) {
        const value = node.getAttribute(attribute);
        if (value?.startsWith('../../public/')) node.setAttribute(attribute, prefix + value);
        if (value?.startsWith('./')) node.setAttribute(attribute, prefix + value.slice(2));
      }
    }
  }
  return document.toString();
}
