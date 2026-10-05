import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { localizeHtml } from './localize';
import { privacyHtml } from './privacy';

const template = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

describe('localized landing pages', () => {
  it.each(['ja', 'en'] as const)('renders a complete %s page with explicit language URLs', (locale) => {
    const { document } = parseHTML(localizeHtml(template, locale, 1));
    expect(document.documentElement.lang).toBe(locale);
    expect(document.querySelector('[rel="canonical"]')!.getAttribute('href')).toBe(`https://loginpilot.ekeminusyou.com/${locale}/`);
    expect(document.querySelectorAll('[rel="alternate"][hreflang]')).toHaveLength(3);
    expect(document.querySelector('[data-language][aria-current="page"]')!.getAttribute('data-language')).toBe(locale);
    expect(document.querySelector('a[href="https://buymeacoffee.com/euonymuslke"]')).not.toBeNull();
    expect(document.querySelector(`a[href="/${locale}/privacy/"]`)).not.toBeNull();
    if (locale === 'en') {
      document.querySelector('[data-language="ja"]')!.remove();
      expect(document.body.textContent).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      expect(document.title).toContain('One less click.');
      expect(document.querySelector('[property="og:image"]')!.getAttribute('content')).toMatch(/social-en\.png$/);
    }
  });

  it('fails the build when newly added Japanese copy lacks an English translation', () => {
    expect(() => localizeHtml(template.replace('本文へ移動', '未翻訳の新しい文章'), 'en')).toThrow('Missing English LP translation');
  });

  it.each(['ja', 'en'] as const)('publishes the %s privacy document in the matching language', (locale) => {
    const markdown = readFileSync(new URL(`../../docs/privacy${locale === 'en' ? '.en' : ''}.md`, import.meta.url), 'utf8');
    const { document } = parseHTML(privacyHtml(localizeHtml(template, locale, 2), markdown, locale));
    expect(document.querySelector('main table')!.textContent).toContain('registeredOrigins');
    expect(document.querySelector('main table')!.textContent).toContain('language');
    expect(document.querySelector('main ol li')).not.toBeNull();
    expect(document.querySelector('[rel="canonical"]')!.getAttribute('href')).toBe(`https://loginpilot.ekeminusyou.com/${locale}/privacy/`);
    expect(document.querySelector('main a')!.getAttribute('href')).toBe('https://github.com/EkeMinusYou/loginpilot/blob/main/SECURITY.md');
    expect(document.querySelector('[data-language="en"]')!.getAttribute('href')).toBe('/en/privacy/');
  });
});
