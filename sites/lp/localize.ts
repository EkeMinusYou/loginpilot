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
    ? 'Login Pilot — ログインの最後のクリックを、なくそう。'
    : 'Login Pilot — One less click. At every login.';
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
    meta('[name="description"]', 'A Chrome extension that uses Google Password Manager to automatically submit login forms on sites you register. Never stores your ID or password. Preparing for Chrome Web Store release.');
    meta('[property="og:description"]', 'Go beyond autofill. Go straight to login. A Chrome extension that works with Google Password Manager.');
    document.getElementById('hero-title')!.innerHTML = '<span class="inline-block">One less click.</span><br /><span class="inline-block">At every login.</span>';
    const translate = (value: string): string => {
      const text = value.trim();
      if (!japanese.test(text)) return value;
      const translated = translations[text];
      if (translated === undefined) throw new Error(`Missing English LP translation: ${text}`);
      return value.replace(text, translated);
    };
    const walk = (node: Node): void => {
      if (node.nodeType === 3) node.textContent = translate(node.textContent ?? '');
      for (const child of node.childNodes) {
        if (child.nodeType === 1 && (child as Element).hasAttribute('data-language')) continue;
        walk(child);
      }
    };
    walk(document.body);
    for (const node of document.querySelectorAll('[aria-label]')) node.setAttribute('aria-label', translate(node.getAttribute('aria-label')!));
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
