import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const icon = (await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8'))
  .replace('width="128" height="128"', 'x="72" y="62" width="72" height="72"');
for (const locale of ['ja', 'en']) {
  const english = locale === 'en';
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#F4F8FC" />
    ${icon}
    <text x="166" y="111" font-family="Helvetica Neue, sans-serif" font-size="40" font-weight="700" fill="#14233B">Login Pilot</text>
    <text x="72" y="218" font-family="Noto Sans JP, Hiragino Sans, monospace" font-size="17" letter-spacing="2" fill="#53657B">${english ? 'GO BEYOND CHROME AUTOFILL' : 'CHROMEの自動入力、その先へ'}</text>
    <g font-family="Noto Sans JP, Hiragino Sans, sans-serif" fill="#14233B">
      <text x="72" y="311" font-size="54" font-weight="700">${english ? 'Chrome autofills.' : 'Chromeの自動入力。'}</text>
      <text x="72" y="389" font-size="${english ? 54 : 48}" font-weight="700">${english ? 'Then you sign in. Automatically.' : 'そのあとのログインも、自動で。'}</text>
      <text x="72" y="472" font-size="23" fill="#53657B">${english ? 'Login Pilot clicks the sign-in button for you.' : 'ログインボタンを、自動で押すChrome拡張機能。'}</text>
      <rect x="72" y="519" width="${english ? 420 : 352}" height="48" rx="8" fill="#E3EBF5" />
      <text x="93" y="550" font-size="18" fill="#14233B">${english ? 'Preparing for Chrome Web Store release' : 'Chromeウェブストア公開準備中'}</text>
    </g>
    <text x="1128" y="551" text-anchor="end" font-family="Helvetica Neue, sans-serif" font-size="18" fill="#607086">loginpilot.ekeminusyou.com</text>
  </svg>`;

  const renderer = new Resvg(source, {
    font: { loadSystemFonts: true, defaultFontFamily: 'Hiragino Sans' },
  });
  await writeFile(new URL(`../sites/lp/public/social${english ? '-en' : ''}.png`, import.meta.url), renderer.render().asPng());
  console.log(`Generated 1200×630 landing page social image (${locale})`);
}
