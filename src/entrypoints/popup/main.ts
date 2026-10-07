import { browser } from 'wxt/browser';
import './style.css';
import { PopupModel } from './state';
import { createTranslator, type MessageKey } from '../../shared/i18n';
import { getBrowserLocale, getLanguagePreference, setLanguagePreference } from '../../shared/extension-language';
import { normalizeLocalePreference, resolveLocale, type LocalePreference } from '../../shared/locale';
import { FEDERATED_PROVIDERS } from '../../shared/federated-providers';

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Popup root element was not found.');
const app = appRoot;

let locale = getBrowserLocale();
let languagePreference: LocalePreference = 'auto';
let languageChanging = false;
let siteSearch = '';

function t(key: MessageKey, values?: Record<string, string | number>): string {
  return createTranslator(locale)(key, values);
}

async function changeLanguage(preference: LocalePreference): Promise<void> {
  if (languageChanging) return;
  languageChanging = true;
  render();
  try {
    await setLanguagePreference(preference);
    languagePreference = preference;
    locale = resolveLocale([browser.i18n.getUILanguage()], preference);
  } catch {
    model.feedback = { kind: 'error', context: 'load', key: 'languageSaveFailed' };
  } finally {
    languageChanging = false;
    focusAfterAction = 'language';
    render();
  }
}

const model = new PopupModel(() => {
  if (model.feedback?.context === 'register') {
    focusAfterAction = 'feedback';
  } else if (model.feedback?.context === 'remove') {
    focusAfterAction = model.feedback.kind === 'success' ? 'registered-title' : 'feedback';
  }
  render();
});
let focusAfterAction: 'feedback' | 'registered-title' | 'language' | null = null;

type IconName = 'globe' | 'check' | 'tick' | 'languages' | 'chevron' | 'alert' | 'arrow' | 'loader' | 'info' | 'search';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(name: IconName, className = 'size-4 shrink-0'): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.75');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  node.setAttribute('class', className);
  const paths: Record<IconName, string> = {
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z',
    check: 'M21 11.1V12a9 9 0 1 1-5.3-8.2M21 4l-9 9-3-3',
    alert: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 8v4M12 16h.01',
    tick: 'M20 6 9 17l-5-5',
    languages: 'M4 5h12M10 3v2M6 5c0 6 3 9 7 11M14 5c0 6-3 9-8 11M14 21l5-11 5 11M16 17h6',
    chevron: 'm6 9 6 6 6-6',
    arrow: 'M5 12h14M12 5l7 7-7 7',
    loader: 'M12 3a9 9 0 1 1-9 9',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v5M12 7h.01',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name]);
  node.append(path);
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.disabled = model.action !== null;
  node.addEventListener('click', onClick);
  return node;
}

function feedbackElement(): HTMLElement {
  const success = model.feedback?.kind === 'success';
  const node = element('div', `flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed ${success ? 'bg-success-soft text-success' : 'bg-error-soft text-error'}`);
  node.id = 'feedback';
  node.tabIndex = -1;
  node.setAttribute('role', success ? 'status' : 'alert');
  node.append(icon(success ? 'check' : 'alert', 'mt-0.5 size-4 shrink-0'), element('p', 'min-w-0 [overflow-wrap:anywhere]', model.feedback ? t(model.feedback.key) : undefined));
  return node;
}

const primaryButtonClasses = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold leading-normal text-white transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70';

function currentSite(origin: string): HTMLElement {
  const node = element('section', 'flex shrink-0 flex-col gap-3.5 rounded-xl bg-surface p-4 ring-1 ring-line ring-inset');
  node.setAttribute('aria-label', t('currentSite'));
  const labelRow = element('div', 'flex min-h-6 items-center justify-between gap-2');
  const status = element('span', 'flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2 py-1 text-[11px] font-medium leading-4 text-success');
  status.append(icon('check', 'size-3.5 shrink-0'), element('span', undefined, t('enabled')));
  labelRow.append(element('h2', 'text-[11px] leading-normal text-secondary', t('currentSite')), status);
  const usesPasskey = model.state.passkeyOrigins.includes(origin);
  const provider = model.state.federatedProviders[origin];
  const method = element('p', 'text-xs text-secondary', `${t('loginMethod')}: ${provider ? FEDERATED_PROVIDERS[provider] : t(usesPasskey ? 'passkeyMethod' : 'passwordMethod')}`);
  const description = element('p', 'sr-only', t(provider ? 'federatedDescription' : usesPasskey ? 'passkeyDescription' : 'submitDescription',
    { provider: provider ? FEDERATED_PROVIDERS[provider] : '' }));
  description.id = 'login-description';
  method.setAttribute('aria-describedby', description.id);
  node.append(labelRow, element('p', 'font-latin min-w-0 text-[18px] font-semibold leading-[1.4] [overflow-wrap:anywhere]', origin), method, description);
  return node;
}

function pendingSite(): HTMLElement {
  const matchesCurrentSite = model.state.pendingSite?.origin === model.state.currentOrigin;
  const usedPasskey = model.state.pendingSite?.passkeyUsed === true;
  const node = element('section', 'flex shrink-0 flex-col gap-3.5 rounded-xl bg-detected-soft p-4 ring-1 ring-detected-line ring-inset');
  node.setAttribute('aria-label', t('pendingSite'));
  const labelRow = element('div', 'flex min-h-6 items-center justify-between gap-2');
  labelRow.append(element('h2', 'text-[11px] leading-normal text-secondary', t('detectedSite')));
  const provider = model.state.pendingSite?.provider;
  labelRow.append(element('span', 'rounded-full bg-method-soft px-2 py-1 text-[11px] font-medium leading-4 text-accent',
    t(provider ? 'federatedUsageDetected' : usedPasskey ? 'passkeyUsageDetected' : model.state.pendingSite?.passwordUsed ? 'passwordUsageDetected' : 'detected')));
  const registerButton = button(model.action?.type === 'register' ? t('registering') : t('register'), primaryButtonClasses, () => void model.register());
  registerButton.dataset.focusKey = 'register';
  registerButton.append(icon(model.action?.type === 'register' ? 'loader' : 'arrow', `size-4 shrink-0 ${model.action?.type === 'register' ? 'motion-safe:animate-spin' : ''}`));
  node.append(labelRow, element('p', 'font-latin min-w-0 text-[18px] font-semibold leading-[1.4] [overflow-wrap:anywhere]', model.state.pendingSite?.origin));
  if (model.state.pendingSite?.authenticationOrigin) {
    node.append(element('p', 'text-xs leading-relaxed text-secondary [overflow-wrap:anywhere]', t('authenticationSite', { origin: model.state.pendingSite.authenticationOrigin })),
      element('p', 'text-[11px] leading-relaxed text-secondary', t('authenticationSiteConsent')));
  }
  if (provider) node.append(element('p', 'text-xs leading-relaxed text-secondary', t('federatedDescription', { provider: FEDERATED_PROVIDERS[provider] })));
  node.append(registerButton);
  if (!matchesCurrentSite) node.append(element('p', 'text-[11px] leading-relaxed text-secondary', t('registerOtherHint')));
  if (model.feedback?.context === 'register') node.append(feedbackElement());
  return node;
}

function registeredSites(): HTMLElement {
  const node = element('section', 'flex shrink-0 flex-col gap-1');
  node.setAttribute('aria-labelledby', 'registered-title');
  const heading = element('div', 'flex min-h-6 shrink-0 items-center justify-between gap-2');
  const title = element('h2', 'text-[13px] font-semibold', t('registeredSites'));
  title.id = 'registered-title';
  title.tabIndex = -1;
  const count = element('span', 'shrink-0 py-1 text-[11px] leading-4 text-secondary');
  count.setAttribute('role', 'status');
  heading.append(title, count);
  count.textContent = t(model.state.registeredOrigins.length === 1 ? 'siteCountOne' : 'siteCount', { count: model.state.registeredOrigins.length });
  node.append(heading);
  if (model.feedback?.context === 'remove') node.append(feedbackElement());
  if (!model.state.registeredOrigins.length) {
    const empty = element('div', 'flex min-h-[52px] items-center gap-2 py-4');
    empty.append(icon('globe', 'size-4 shrink-0 text-muted'), element('p', 'min-w-0 text-xs leading-5 text-secondary', t('emptySites')));
    node.append(empty);
    return node;
  }
  const searchField = element('div', 'mt-2 mb-1 flex min-h-9 items-center gap-2 rounded-lg border border-line bg-soft px-2.5');
  const search = element('input', 'min-w-0 flex-1 bg-transparent py-2 text-xs text-ink placeholder:text-muted');
  search.type = 'search';
  search.value = siteSearch;
  search.placeholder = t('searchSites');
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.setAttribute('aria-label', t('searchSites'));
  search.setAttribute('aria-controls', 'registered-site-list');
  search.dataset.focusKey = 'site-search';
  searchField.append(icon('search', 'size-3.5 shrink-0 text-muted'), search);
  node.append(searchField);
  const list = element('ul', 'site-list min-h-[52px] max-h-[208px] overflow-y-auto overscroll-contain');
  list.id = 'registered-site-list';
  list.tabIndex = 0;
  list.setAttribute('aria-label', t('siteList'));
  const noResults = element('p', 'py-4 text-xs leading-5 text-secondary', t('noMatchingSites'));
  const updateResults = (): void => {
    const query = siteSearch.trim().toLowerCase();
    const origins = model.state.registeredOrigins.filter((origin) => origin.toLowerCase().includes(query));
    count.textContent = query ? t('filteredSiteCount', { count: origins.length, total: model.state.registeredOrigins.length })
      : t(origins.length === 1 ? 'siteCountOne' : 'siteCount', { count: origins.length });
    list.replaceChildren();
    list.hidden = origins.length === 0;
    noResults.hidden = origins.length !== 0;
    for (const origin of origins) {
      const item = element('li', 'flex min-h-[52px] items-center gap-2.5 border-b border-line');
      const remove = button(model.action?.type === 'remove' && model.action.origin === origin ? t('removing') : t('remove'), 'min-h-8 shrink-0 rounded-md px-2 text-xs text-secondary transition hover:bg-error-soft hover:text-error disabled:cursor-wait disabled:opacity-60', () => void model.remove(origin));
      remove.setAttribute('aria-label', t('removeLabel', { origin }));
      remove.dataset.focusKey = `remove:${origin}`;
      const site = element('div', 'min-w-0 flex-1 py-3');
      site.append(element('p', 'font-latin text-[13px] leading-normal [overflow-wrap:anywhere]', origin),
        element('p', 'mt-1 text-[11px] text-secondary', model.state.federatedProviders[origin]
          ? FEDERATED_PROVIDERS[model.state.federatedProviders[origin]!] : t(model.state.passkeyOrigins.includes(origin) ? 'passkeyMethod' : 'passwordMethod')));
      item.append(icon('globe', 'size-4 shrink-0 text-muted'), site, remove);
      list.append(item);
    }
  };
  search.addEventListener('input', () => {
    siteSearch = search.value;
    // Keep the input in place so typing, caret position, and IME composition survive filtering.
    updateResults();
  });
  updateResults();
  node.append(list, noResults);
  return node;
}

function render(): void {
  document.documentElement.lang = locale;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focusKey : undefined;
  const wrapper = element('div', 'popup-shell flex max-h-[600px] w-full flex-col overflow-hidden rounded-xl bg-surface text-ink');
  const header = element('header', 'flex h-16 shrink-0 items-center gap-3 border-b border-line px-5 py-4');
  const brandIcon = element('img', 'size-8 shrink-0');
  brandIcon.src = '/icon.svg';
  brandIcon.alt = '';
  brandIcon.width = 32;
  brandIcon.height = 32;
  header.append(brandIcon, element('h1', 'font-latin min-w-0 text-[17px] font-semibold leading-normal', 'Login Pilot'));
  const content = element('div', 'popup-content flex min-h-0 flex-col gap-6 overflow-y-auto p-5');
  content.setAttribute('aria-busy', String(model.isLoading));
  if (model.isLoading) {
    const loading = element('div', 'flex items-center gap-3 rounded-xl bg-soft p-4 text-xs leading-relaxed text-secondary');
    loading.setAttribute('role', 'status');
    loading.append(icon('loader', 'size-4 shrink-0 motion-safe:animate-spin'), element('p', undefined, t('loading')));
    content.append(loading);
  } else if (model.hasLoaded) {
    const pending = model.state.pendingSite && (!model.state.registeredOrigins.includes(model.state.pendingSite.origin) ||
      (model.state.passkeyOrigins.includes(model.state.pendingSite.origin) && model.state.pendingSite.method === 'passkey' &&
        model.state.pendingSite.authenticationOrigin &&
        model.state.passkeyFrameOrigins[model.state.pendingSite.origin] !== model.state.pendingSite.authenticationOrigin));
    if (pending) {
      content.append(pendingSite());
    } else if (model.state.currentOrigin && model.state.registeredOrigins.includes(model.state.currentOrigin)) {
      content.append(currentSite(model.state.currentOrigin));
    } else {
      const hint = element('div', 'flex items-start gap-2 text-xs leading-relaxed text-secondary');
      hint.append(icon('info', 'mt-0.5 size-4 shrink-0 text-muted'), element('p', undefined, t('loginActivityHint')));
      content.append(hint);
    }
    if (model.feedback && model.feedback.context !== 'remove' && !(pending && model.feedback.context === 'register')) content.append(feedbackElement());
    content.append(registeredSites());
  } else if (model.feedback) {
    content.append(feedbackElement());
  }
  const footer = element('footer', 'shrink-0 border-t border-line bg-soft px-5 py-2 text-secondary');
  const support = element('a', 'flex min-h-8 w-fit items-center gap-1.5 rounded-sm text-[11px] font-medium text-secondary underline-offset-4 hover:text-accent hover:underline', t('support'));
  support.href = 'https://buymeacoffee.com/euonymuslke';
  support.target = '_blank';
  support.rel = 'noopener noreferrer';
  support.setAttribute('aria-label', t('supportLabel'));
  support.append(icon('arrow', 'size-3 shrink-0 text-muted'));
  support.dataset.focusKey = 'support';
  const footerControls = element('div', 'flex items-center justify-between gap-2');
  const languageControl = element('div', 'relative flex h-8 shrink-0 items-center rounded-md bg-surface ring-1 ring-line ring-inset');
  const language = element('select', 'h-full max-w-[128px] appearance-none rounded-md bg-transparent py-1 pr-7 pl-7 text-xs text-secondary disabled:opacity-70');
  language.id = 'language';
  language.setAttribute('aria-label', t('language'));
  language.dataset.focusKey = 'language';
  for (const [value, label] of [['auto', t('autoLanguage')], ['ja', '日本語'], ['en', 'English']]) {
    const option = element('option', undefined, label);
    option.value = value!;
    option.selected = value === languagePreference;
    language.append(option);
  }
  language.disabled = languageChanging;
  language.addEventListener('change', () => void changeLanguage(normalizeLocalePreference(language.value)));
  languageControl.append(icon('languages', 'pointer-events-none absolute left-2 size-3.5 text-secondary'), language, icon('chevron', 'pointer-events-none absolute right-2 size-3 text-secondary'));
  footerControls.append(support, languageControl);
  footer.append(footerControls);
  wrapper.append(header, content, footer);
  app.replaceChildren(wrapper);
  if (focusAfterAction) {
    document.getElementById(focusAfterAction)?.focus({ preventScroll: true });
    focusAfterAction = null;
  } else if (previousFocus) {
    const target = [...app.querySelectorAll<HTMLElement>('[data-focus-key]')].find((node) => node.dataset.focusKey === previousFocus);
    if (target && !target.matches(':disabled')) target.focus({ preventScroll: true });
  }
}

render();
void getLanguagePreference()
  .catch(() => 'auto' as const)
  .then((preference) => {
    languagePreference = preference;
    locale = resolveLocale([browser.i18n.getUILanguage()], preference);
    return model.load();
  });
