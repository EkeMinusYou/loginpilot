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
      expect(document.title).toContain('Chrome autofills.');
      expect(document.querySelector('[property="og:image"]')!.getAttribute('content')).toMatch(/social-en\.png$/);
    }
  });

  it('keeps English translations independent of edits to Japanese copy', () => {
    const { document } = parseHTML(localizeHtml(template.replace('本文へ移動', '本文に移動します'), 'en'));
    expect(document.querySelector('[data-i18n="skipToContent"]')!.textContent).toBe('Skip to content');
  });

  it('fails the build for unknown translation keys or unmarked new copy', () => {
    expect(() => localizeHtml(template.replace('data-i18n="skipToContent"', 'data-i18n="missingKey"'), 'en')).toThrow('Missing English LP translation: missingKey');
    expect(() => localizeHtml(template.replace('data-i18n="skipToContent"', ''), 'en')).toThrow('missing a data-i18n key');
    expect(() => localizeHtml(template.replace('data-i18n-aria-label="navLabel"', ''), 'en')).toThrow('missing a data-i18n-aria-label key');
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

  it.each([
    '- unordered item', '**strong text**', '*emphasis*', '_emphasis_', '~~deleted~~',
    '### Heading', '```js\ncode\n```', '> quotation', '---', '<strong>HTML</strong>',
    '![image](https://example.com/image.png)', '[link](javascript:alert)',
    '1. first\n   continuation', '2. non-default start', 'Text  \nHard break',
    '| A | B |\n| --- | --- |\n| one |', '| A |\n| :--- |\n| one |',
    '| A |\n| --- |\n| `a\\|b` |',
  ])('rejects unsupported privacy syntax instead of silently misrendering it: %s', (block) => {
    expect(() => privacyHtml(localizeHtml(template, 'en'), `# Policy\n\nDescription.\n\n${block}`, 'en')).toThrow('Unsupported privacy Markdown');
  });
});
