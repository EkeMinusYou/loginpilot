import { parseHTML } from 'linkedom';
import type { Locale } from '../../src/shared/locale.ts';

// Render the headings, paragraphs, lists, and tables used in our privacy documents.
export function privacyHtml(page: string, markdown: string, locale: Locale): string {
  const { document } = parseHTML(page);
  const article = document.createElement('article');
  article.className = 'mx-auto flex max-w-[960px] flex-col gap-6 px-6 py-14 md:px-12';
  function inline(parent: Element, value: string): void {
    const tokens = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let offset = 0;
    for (const match of value.matchAll(tokens)) {
      parent.append(document.createTextNode(value.slice(offset, match.index)));
      const node = document.createElement(match[1] ? 'code' : 'a');
      node.textContent = match[1] ?? match[2]!;
      node.className = match[1] ? 'font-mono break-all text-[0.9em]' : 'text-[var(--color-accent)] underline underline-offset-4';
      if (match[3]) node.setAttribute('href', match[3].startsWith('../')
        ? 'https://github.com/EkeMinusYou/loginpilot/blob/main/' + match[3].slice(3) : match[3]);
      parent.append(node);
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(offset)));
  }
  for (const block of markdown.trim().split(/\n\s*\n/)) {
    let node: HTMLElement;
    if (/^#{1,2} /.test(block)) {
      const level = block.startsWith('## ') ? 2 : 1;
      node = document.createElement(`h${level}`);
      node.className = level === 1 ? 'text-3xl leading-relaxed font-bold' : 'mt-4 text-xl font-semibold';
      inline(node, block.replace(/^#+ /, ''));
    } else if (block.startsWith('|')) {
      node = document.createElement('div');
      node.className = 'overflow-x-auto';
      const table = document.createElement('table');
      table.className = 'w-full text-left text-sm leading-relaxed';
      const rows = block.split('\n').filter((row) => !/^\|[\s:|\-]+\|$/.test(row));
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
      for (const line of block.split('\n')) {
        const item = document.createElement('li');
        inline(item, line.replace(/^\d+\. /, ''));
        node.append(item);
      }
    } else {
      node = document.createElement('p');
      node.className = 'text-[var(--color-secondary)] leading-[1.9]';
      inline(node, block.replace(/\n/g, ' '));
    }
    article.append(node);
  }
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
