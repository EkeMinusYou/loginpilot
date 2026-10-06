import { parseHTML } from 'linkedom';
import type { Locale } from '../../src/shared/locale.ts';

function requireSupported(condition: boolean, detail: string): void {
  if (!condition) throw new Error(`Unsupported privacy Markdown: ${detail}`);
}

// This deliberately limited format is documented in CONTRIBUTING.md.
export function privacyHtml(page: string, markdown: string, locale: Locale): string {
  requireSupported(!/ {2,}\n/.test(markdown), 'hard line breaks');
  const { document } = parseHTML(page);
  const article = document.createElement('article');
  article.className = 'mx-auto flex max-w-[960px] flex-col gap-6 px-6 py-14 md:px-12';
  function inline(parent: Element, value: string): void {
    const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^()\s]+)\)/g;
    function plain(text: string): void {
      requireSupported(!/[*_~`\\\[\]]|<[A-Za-z!/]/.test(text), 'inline markup; only code and links are supported');
      parent.append(document.createTextNode(text));
    }
    let offset = 0;
    for (const match of value.matchAll(tokens)) {
      plain(value.slice(offset, match.index));
      const node = document.createElement(match[1] ? 'code' : 'a');
      node.textContent = match[1] ?? match[2]!;
      node.className = match[1] ? 'font-mono break-all text-[0.9em]' : 'text-[var(--color-accent)] underline underline-offset-4';
      if (match[3]) {
        requireSupported(match.index === 0 || value[match.index! - 1] !== '!', 'images');
        requireSupported(!/[*_~`\[\]]/.test(match[2]!), 'nested link markup');
        requireSupported(/^(?:https:\/\/|\.\.\/)[^\s]+$/.test(match[3]), 'link destination');
        node.setAttribute('href', match[3].startsWith('../')
          ? 'https://github.com/EkeMinusYou/loginpilot/blob/main/' + match[3].slice(3) : match[3]);
      }
      parent.append(node);
      offset = match.index + match[0].length;
    }
    plain(value.slice(offset));
  }
  for (const block of markdown.trim().split(/\n\s*\n/)) {
    let node: HTMLElement;
    if (/^#{1,2} /.test(block)) {
      requireSupported(!block.includes('\n'), 'headings must be separated by blank lines');
      const level = block.startsWith('## ') ? 2 : 1;
      node = document.createElement(`h${level}`);
      node.className = level === 1 ? 'text-3xl leading-relaxed font-bold' : 'mt-4 text-xl font-semibold';
      inline(node, block.replace(/^#+ /, ''));
    } else if (block.startsWith('|')) {
      node = document.createElement('div');
      node.className = 'overflow-x-auto';
      const table = document.createElement('table');
      table.className = 'w-full text-left text-sm leading-relaxed';
      const lines = block.split('\n');
      requireSupported(lines.length >= 2 && lines.every((line) => /^\|.*\|$/.test(line)), 'table rows need outer pipes');
      const width = lines[0]!.split('|').length;
      requireSupported(lines.every((line) => line.split('|').length === width), 'inconsistent table columns');
      requireSupported(lines[1]!.slice(1, -1).split('|').every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell)), 'table separator');
      // Alignment and escaped/code pipes need a fuller Markdown renderer.
      requireSupported(!lines[1]!.includes(':'), 'table alignment');
      const rows = lines.filter((_line, index) => index !== 1);
      for (const [index, row] of rows.entries()) {
        const tr = document.createElement('tr');
        for (const cell of row.slice(1, -1).split('|')) {
          const td = document.createElement(index === 0 ? 'th' : 'td');
          td.className = 'border-b border-[var(--color-line)] px-3 py-3 align-top';
          if (index === 0) td.setAttribute('scope', 'col');
          inline(td, cell.trim());
          tr.append(td);
        }
        table.append(tr);
      }
      node.append(table);
    } else if (/^\d+\. /.test(block)) {
      node = document.createElement('ol');
      node.className = 'list-decimal space-y-3 pl-6 text-[var(--color-secondary)] leading-[1.9]';
      for (const [index, line] of block.split('\n').entries()) {
        requireSupported(line.startsWith(`${index + 1}. `), 'lists must start at 1 and have one line per item');
        const item = document.createElement('li');
        inline(item, line.replace(/^\d+\. /, ''));
        node.append(item);
      }
    } else {
      requireSupported(!block.split('\n').some((line) => /^(?:#|>|[-+*] |\d+[.)] | {4}|\t|~~~|(?:[-*_]\s*){3,}$|\[.*\]:)/.test(line)), 'block markup; only h1/h2, paragraphs, ordered lists, and tables are supported');
      node = document.createElement('p');
      node.className = 'text-[var(--color-secondary)] leading-[1.9]';
      inline(node, block.replace(/\n/g, ' '));
    }
    article.append(node);
  }
  requireSupported(article.querySelectorAll('h1').length === 1 && article.querySelector('p') !== null, 'one title and at least one paragraph are required');
  document.querySelector('main')!.replaceChildren(article);
  const title = `${article.querySelector('h1')!.textContent} | Login Pilot`;
  const url = `https://loginpilot.ekeminusyou.com/${locale}/privacy/`;
  document.title = title;
  document.querySelector('[property="og:title"]')!.setAttribute('content', title);
  document.querySelector('[property="og:url"]')!.setAttribute('content', url);
  document.querySelector('[rel="canonical"]')!.setAttribute('href', url);
  const description = article.querySelector('p')!.textContent;
  for (const selector of ['[name="description"]', '[property="og:description"]']) document.querySelector(selector)!.setAttribute('content', description);
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    if (link.getAttribute('href') !== '#main') link.setAttribute('href', `/${locale}/${link.getAttribute('href')}`);
  }
  for (const link of document.querySelectorAll('[data-language]')) link.setAttribute('href', `/${link.getAttribute('data-language')}/privacy/`);
  for (const link of document.querySelectorAll('[hreflang][rel="alternate"]')) {
    const language = link.getAttribute('hreflang');
    link.setAttribute('href', `https://loginpilot.ekeminusyou.com/${language === 'x-default' ? 'ja' : language}/privacy/`);
  }
  return document.toString();
}
