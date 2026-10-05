import { isLocale, resolveLocale } from '../../src/shared/locale';

const key = 'loginpilot.lp.language';
let preference: unknown;
try { preference = localStorage.getItem(key); } catch { /* Language links also work without storage. */ }

if (location.pathname === '/' || location.pathname === '/index.html') {
  const language = resolveLocale(navigator.languages, isLocale(preference) ? preference : 'auto');
  location.replace(`/${language}/${location.search}${location.hash}`);
}

for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-language]')) {
  if (location.hash) link.setAttribute('href', link.getAttribute('href')!.replace(/#.*$/, '') + location.hash);
  link.addEventListener('click', () => {
    const language = link.dataset.language;
    if (!isLocale(language)) return;
    try { localStorage.setItem(key, language); } catch { /* Explicit locale URLs remain usable. */ }
  });
}
