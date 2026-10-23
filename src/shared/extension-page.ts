import { browser } from 'wxt/browser';
import './extension-page.css';
import { ExtensionPageModel } from './extension-page-model';
import { createTranslator, type MessageKey } from './i18n';
import { getBrowserLocale, getLanguagePreference, setLanguagePreference } from './extension-language';
import { normalizeLocalePreference, resolveLocale, type LocalePreference } from './locale';
import { FEDERATED_PROVIDERS } from './federated-providers';

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Extension page root element was not found.');
const app = appRoot;
const isSettings = app.dataset.page === 'options';
document.documentElement.classList.toggle('options-page', isSettings);

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

const model = new ExtensionPageModel(() => {
  if (model.feedback?.context === 'register' || model.feedback?.context === 'preferences') {
    focusAfterAction = 'feedback';
  } else if (model.feedback?.context === 'remove') {
    focusAfterAction = model.feedback.kind === 'success' ? 'registered-title' : 'feedback';
  }
  render();
}, isSettings ? 'options' : 'popup');
let focusAfterAction: 'feedback' | 'registered-title' | 'language' | null = null;

type IconName = 'globe' | 'check' | 'tick' | 'chevron' | 'alert' | 'arrow' | 'loader' | 'info' | 'search' | 'settings' | 'external';

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
    settings: "M6.80518 0.60156q-0.03076 0.01367-0.15381 0.02735-0.32471 0.05811-0.63916 0.23925-0.31445 0.18115-0.50928 0.43409-0.19824 0.23926-0.29053 0.46484-0.08887 0.22217-0.15722 0.5708-0.03076 0.18115-0.07178 0.28711-0.04102 0.10596-0.1333 0.19824-0.08887 0.08887-0.2085 0.15381-0.11963 0.06152-0.24609 0.08887-0.19482 0.02734-0.48877-0.08545-0.19824-0.08203-0.33838-0.10938-0.13672-0.03076-0.36231-0.03076-0.28027-0.01367-0.44775 0.03076-0.54688 0.10938-0.93994 0.48194-0.38965 0.37256-0.54346 0.88525-0.15381 0.50928-0.01367 1.03906 0.16748 0.61523 0.72803 1.06299 0.18115 0.15723 0.26318 0.3042 0.08545 0.14697 0.08545 0.35547 0 0.2085-0.08545 0.35547-0.08203 0.14697-0.26318 0.3042-0.40674 0.32129-0.58789 0.69726-0.21191 0.42041-0.21192 0.875 0 0.45459 0.21192 0.875 0.19482 0.37939 0.52978 0.646 0.33838 0.2666 0.7417 0.3623 0.60156 0.15381 1.26123-0.11279 0.25293-0.0957 0.4751-0.06152 0.22559 0.03418 0.41357 0.21191 0.18799 0.17432 0.23243 0.49561 0.05469 0.37598 0.20849 0.68701 0.22559 0.46143 0.67334 0.74853 0.44775 0.28711 0.96387 0.31446 0.61865 0.02734 1.1416-0.30078 0.52637-0.32813 0.76221-0.90235 0.08545-0.22558 0.12646-0.51269 0.04443-0.28711 0.16748-0.44092 0.12646-0.15381 0.29395-0.23926 0.31104-0.14014 0.68701 0 0.22559 0.09912 0.39307 0.13672 0.16748 0.03418 0.37597 0.03418 0.32471 0 0.61865-0.09912 0.43408-0.14014 0.75538-0.46143 0.46143-0.44775 0.55712-1.06299 0.09912-0.61865-0.18115-1.19287-0.18115-0.37598-0.57422-0.68359-0.19482-0.15381-0.28027-0.30762-0.08203-0.15723-0.08203-0.36572 0-0.2085 0.08203-0.35547 0.08545-0.14697 0.2666-0.3042 0.30762-0.23584 0.47852-0.51611 0.29395-0.43408 0.32129-0.94336 0.02734-0.5127-0.20508-0.97412-0.229-0.46143-0.65625-0.74854-0.42725-0.28711-0.91602-0.31787-0.25293-0.02734-0.47851 0.01026-0.22217 0.03418-0.48877 0.14697-0.2085 0.08203-0.35547 0.08203-0.14697 0-0.31787-0.08203-0.16748-0.08545-0.29395-0.23926-0.12305-0.15381-0.16748-0.44092-0.04102-0.28711-0.12646-0.51269-0.18115-0.43408-0.55371-0.74854-0.36914-0.31445-0.84424-0.41357-0.08545-0.02734-0.31787-0.04102-0.229-0.01367-0.28369 0z m0.50244 1.23389q0.15381 0.06836 0.2666 0.18115 0.11279 0.11279 0.15381 0.25293 0.02734 0.06836 0.05468 0.26318 0.11279 0.67334 0.56055 1.1211 0.36572 0.37939 0.88184 0.51953 0.12646 0.04102 0.20166 0.04785 0.07861 0.00684 0.29053 0.00684 0.24951 0 0.39648-0.02735 0.14697-0.02734 0.38623-0.12646 0.2085-0.08545 0.36914-0.08545 0.16406 0 0.34521 0.09912 0.08203 0.04102 0.18799 0.14014 0.10596 0.09912 0.14698 0.18115 0.08545 0.16748 0.08545 0.35889 0 0.18799-0.08545 0.35547-0.04101 0.09912-0.09912 0.16406-0.05469 0.06152-0.18116 0.15722-0.76904 0.61865-0.76904 1.55518 0 0.93652 0.76904 1.55518 0.15381 0.12646 0.22901 0.23242 0.07861 0.10254 0.10937 0.24267 0.06836 0.30762-0.0581 0.56055-0.04101 0.08203-0.14698 0.18799-0.10596 0.10596-0.18799 0.14697-0.19482 0.08545-0.35205 0.08545-0.15381 0-0.38623-0.09228-0.229-0.09229-0.40332-0.12647-0.17432-0.03418-0.41357-0.02051-0.42041 0.01367-0.75537 0.16748-0.46143 0.22559-0.74854 0.61182-0.28711 0.38281-0.37256 0.90234-0.02734 0.2085-0.05468 0.27686-0.04102 0.14014-0.15381 0.25293-0.11279 0.11279-0.25293 0.18115-0.08203 0.04443-0.1333 0.05127-0.04785 0.00684-0.18799 0.00684-0.14014 0-0.19141-0.00684-0.04785-0.00684-0.11621-0.05127-0.30762-0.14014-0.42041-0.41699-0.02734-0.07178-0.05468-0.23926-0.05811-0.36572-0.1709-0.60156-0.18115-0.40674-0.51612-0.68701-0.33496-0.28027-0.75537-0.39307-0.12646-0.04102-0.20508-0.04785-0.0752-0.00684-0.28711-0.00684-0.24951 0-0.39648 0.02735-0.14697 0.02734-0.38623 0.12646-0.2085 0.08545-0.37256 0.08545-0.16064 0-0.3418-0.08545-0.08203-0.04102-0.18798-0.14697-0.10596-0.10596-0.14698-0.18799-0.12646-0.25293-0.0581-0.56055 0.03076-0.14014 0.10596-0.24267 0.07861-0.10596 0.23242-0.23242 0.60156-0.47852 0.7417-1.20655 0.02734-0.12305 0.02734-0.34863 0-0.22559-0.02734-0.34863-0.14014-0.71436-0.72803-1.20655-0.14014-0.0957-0.19824-0.15722-0.05469-0.06494-0.09571-0.16406-0.11279-0.23584-0.07177-0.4751 0.04443-0.23926 0.21191-0.42041 0.16748-0.18115 0.42041-0.22559 0.12646-0.01367 0.23584 0.00342 0.11279 0.01367 0.28027 0.08203 0.22559 0.08545 0.40674 0.11963 0.18115 0.03418 0.41699 0.02051 0.23926-0.01367 0.40674-0.04785 0.1709-0.0376 0.3794-0.14698 0.30762-0.15381 0.54687-0.39306 0.42041-0.43408 0.53321-1.09375 0.02734-0.2085 0.05468-0.29395 0.04102-0.10938 0.14698-0.229 0.10596-0.11963 0.20849-0.16748 0.10596-0.05127 0.18115-0.07178 0.07861-0.02051 0.20508-0.01367 0.12646 0.00684 0.17432 0.01367 0.05127 0.00684 0.1333 0.05127l-0.01367 0z m-0.66992 2.86768q-0.89893 0.15381-1.44239 0.82714-0.18457 0.22217-0.29052 0.44776-0.10254 0.22559-0.18799 0.51953-0.02734 0.10938-0.03418 0.19482-0.00684 0.08203-0.00684 0.30762 0 0.28027 0.02734 0.43408 0.02734 0.15381 0.1128 0.3794 0.16748 0.4751 0.52978 0.84082 0.36572 0.3623 0.84082 0.52978 0.22559 0.08545 0.3794 0.1128 0.15381 0.02734 0.43408 0.02734 0.28027 0 0.43408-0.02734 0.15381-0.02734 0.3794-0.1128 0.4751-0.16748 0.8374-0.52978 0.36572-0.36572 0.5332-0.84082 0.08545-0.22559 0.11279-0.3794 0.02734-0.15381 0.02735-0.43408 0-0.28027-0.02735-0.43408-0.02734-0.15381-0.11279-0.3794-0.2085-0.55713-0.6665-0.95019-0.45459-0.39307-1.04248-0.51953-0.14014-0.02734-0.42725-0.03418-0.28711-0.00684-0.41015 0.02051z m0.65625 1.1621q0.28027 0.07178 0.52294 0.31788 0.24609 0.24268 0.31788 0.52294 0.02734 0.12646 0.02734 0.29395 0 0.16748-0.02734 0.28027-0.07178 0.29395-0.3042 0.53321-0.229 0.23584-0.53662 0.32129-0.11279 0.02734-0.29395 0.02734-0.18115 0-0.29395-0.02734-0.30762-0.08545-0.54003-0.32129-0.229-0.23926-0.30079-0.53321-0.02734-0.11279-0.02734-0.28027 0-0.16748 0.02734-0.29395 0.05811-0.22559 0.22559-0.43408 0.16748-0.2085 0.40674-0.32129 0.34863-0.18115 0.79639-0.08545z",
    external: "M8.59619 1.18945q-0.11279 0.02734-0.21875 0.11963-0.10254 0.09229-0.15381 0.18457-0.04785 0.08887-0.04785 0.25635 0 0.16748 0.04102 0.24609 0.04443 0.0752 0.12646 0.16065 0.08545 0.08203 0.15381 0.12646l0.08545 0.04102 2.25244 0-2.74463 2.7583q-1.85938 1.86279-2.30713 2.32422-0.44775 0.46143-0.47851 0.51611-0.10938 0.23926-0.01367 0.46485 0.09912 0.22217 0.32128 0.32128 0.22559 0.0957 0.46485-0.01367 0.05469-0.03076 0.51611-0.47851 0.46143-0.44775 2.32422-2.30713l2.7583-2.74463 0 2.25244 0.04102 0.08545q0.04443 0.06836 0.12646 0.15381 0.08545 0.08203 0.16065 0.12646 0.07861 0.04102 0.24609 0.04102 0.16748 0 0.24268-0.04102 0.07861-0.04443 0.16064-0.12646 0.08545-0.08545 0.12988-0.15381l0.04102-0.08545 0-3.84863-0.04102-0.08545q-0.04443-0.06836-0.12304-0.14356-0.0752-0.07861-0.14356-0.12304l-0.08545-0.04102-1.90381 0q-1.89014 0-1.93115 0.01367z m-5.9917 1.76368q-0.50586 0.08545-0.87842 0.4375-0.36914 0.34863-0.50927 0.86474-0.02734 0.08545-0.02735 0.58789l-0.01367 3.03858 0.01367 3.0249q0 0.50244 0.02735 0.58789 0.14014 0.48877 0.46826 0.82031 0.33154 0.32813 0.82031 0.46826 0.08545 0.02734 0.58789 0.02735l3.0249 0.01367 3.03858-0.01367q0.50244 0 0.58789-0.02735 0.98096-0.2666 1.28857-1.26123 0.02734-0.08545 0.02735-0.34863l0.01367-3.69824-0.02735-0.09571q-0.08545-0.21191-0.29394-0.3247-0.07178-0.02734-0.11279-0.03418-0.04102-0.00684-0.14014-0.00684-0.15381 0-0.23926 0.0376-0.08203 0.03418-0.16748 0.11963-0.08203 0.08203-0.12646 0.16406l-0.04102 0.09912-0.01367 3.78027-0.04102 0.09913q-0.14014 0.27685-0.43408 0.33496-0.09912 0.02734-3.31201 0.02734-3.21289 0-3.31201-0.02734-0.29395-0.05811-0.43408-0.33496l-0.04102-0.09913 0-6.67871 0.04102-0.09912q0.09912-0.2085 0.30761-0.30761l0.09912-0.04102 3.78028-0.01367 0.09912-0.04102q0.08203-0.04443 0.16406-0.12646 0.08545-0.08545 0.12647-0.17432 0.04443-0.09229 0.03759-0.23926-0.00684-0.14697-0.05127-0.23584-0.04102-0.09229-0.1333-0.17431-0.08887-0.08545-0.17431-0.11963-0.08203-0.0376-0.34864-0.0376l-1.66455 0q-1.90381 0-2.0166 0.02735z",
    chevron: 'm6 9 6 6 6-6',
    arrow: 'M5 12h14M12 5l7 7-7 7',
    loader: 'M12 3a9 9 0 1 1-9 9',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v5M12 7h.01',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name]);
  if (name === 'settings' || name === 'external') {
    node.setAttribute('viewBox', '0 0 14 14');
    node.setAttribute('stroke', 'none');
    node.setAttribute('fill', 'currentColor');
  }
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
  if (model.state.autoLoginPaused) status.className = 'rounded-full bg-soft px-2 py-1 text-[11px] font-medium leading-4 text-secondary';
  status.append(icon('check', 'size-3.5 shrink-0'), element('span', undefined, t(model.state.autoLoginPaused ? 'pausedStatus' : 'enabled')));
  labelRow.append(element('h2', 'text-[11px] leading-normal text-secondary', t('currentSite')), status);
  const usesPasskey = model.state.passkeyOrigins.includes(origin);
  const provider = model.state.federatedProviders[origin];
  const method = element('p', 'text-xs leading-normal text-secondary', provider ? FEDERATED_PROVIDERS[provider] : t(usesPasskey ? 'passkeyMethod' : 'passwordMethod'));
  method.setAttribute('aria-label', `${t('loginMethod')}: ${method.textContent}`);
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
  const exclude = button(t('excludeCandidate'), 'min-h-9 rounded-md px-2 text-xs text-secondary hover:bg-soft disabled:opacity-60', () => void model.excludeCandidate());
  exclude.dataset.focusKey = 'exclude-candidate';
  node.append(registerButton, exclude);
  if (!matchesCurrentSite) node.append(element('p', 'text-[11px] leading-relaxed text-secondary', t('registerOtherHint')));
  if (model.feedback?.context === 'register' || model.feedback?.context === 'preferences') node.append(feedbackElement());
  return node;
}

function registeredSites(): HTMLElement {
  const node = element('section', 'flex flex-col gap-4 rounded-[10px] bg-surface p-6 ring-1 ring-line ring-inset');
  node.setAttribute('aria-labelledby', 'registered-title');
  const heading = element('div', 'flex min-h-6 shrink-0 items-center justify-between gap-2');
  const title = element('h2', 'text-[17px] font-semibold leading-[1.6]', t('registeredSites'));
  title.id = 'registered-title';
  title.tabIndex = -1;
  const count = element('span', 'shrink-0 text-xs text-secondary');
  count.setAttribute('role', 'status');
  heading.append(title, count);
  count.textContent = t(model.state.registeredOrigins.length === 1 ? 'siteCountOne' : 'siteCount', { count: model.state.registeredOrigins.length });
  node.append(heading);
  const removalHint = element('p', 'text-xs leading-[1.6] text-secondary', t('removeSiteHint'));
  if (model.feedback?.context === 'remove') node.append(feedbackElement());
  if (!model.state.registeredOrigins.length) {
    const empty = element('div', 'flex min-h-[52px] items-center gap-2 py-4');
    empty.append(icon('globe', 'size-4 shrink-0 text-muted'), element('p', 'min-w-0 text-xs leading-5 text-secondary', t('emptySites')));
    node.append(empty, removalHint);
    return node;
  }
  const searchField = element('div', 'flex h-[42px] items-center gap-2.5 rounded-md border border-line px-3');
  const search = element('input', 'min-w-0 flex-1 bg-transparent py-2 text-[13px] leading-[1.6] text-ink placeholder:text-muted');
  search.type = 'search';
  search.value = siteSearch;
  search.placeholder = t('searchSites');
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.setAttribute('aria-label', t('searchSites'));
  search.setAttribute('aria-controls', 'registered-site-list');
  search.dataset.focusKey = 'site-search';
  searchField.append(icon('search', 'size-4 shrink-0 text-muted'), search);
  node.append(searchField);
  const list = element('ul', 'site-list min-h-[52px]');
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
  node.append(list, noResults, removalHint);
  return node;
}

function automationSettings(): HTMLElement {
  const section = element('section', 'flex flex-col gap-3.5');
  const title = element('h2', 'text-[17px] font-semibold leading-[1.6]', t('automationSettings'));
  title.id = 'automation-settings-title';
  section.setAttribute('aria-labelledby', title.id);
  const row = element('label', 'flex cursor-pointer items-center justify-between gap-6');
  const description = element('span', 'min-w-0 flex-1');
  const hint = element('span', 'mt-1 block text-xs leading-[1.6] text-secondary', t('pauseAutoLoginHint'));
  hint.id = 'pause-hint';
  description.append(element('span', 'block text-[13px] font-medium leading-[1.6]', t('pauseAutoLogin')), hint);
  const toggle = element('input', 'size-5 shrink-0 accent-accent disabled:opacity-60');
  toggle.type = 'checkbox';
  toggle.id = 'pause-auto-login';
  toggle.dataset.focusKey = 'pause-auto-login';
  toggle.checked = model.state.autoLoginPaused;
  toggle.disabled = model.action !== null;
  toggle.setAttribute('aria-describedby', hint.id);
  toggle.addEventListener('change', () => void model.setPaused(toggle.checked));
  row.append(description, toggle);
  section.append(title, row);
  return section;
}

function excludedSites(): HTMLElement {
  const section = element('section', 'flex flex-col gap-3.5');
  const title = element('h2', 'text-[17px] font-semibold leading-[1.6]', t('excludedSites'));
  title.id = 'excluded-sites-title';
  section.setAttribute('aria-labelledby', title.id);
  section.append(title, element('p', 'text-xs leading-[1.6] text-secondary', t('excludedSitesHint')));
  if (!model.state.excludedOrigins.length) {
    section.append(element('p', 'text-xs text-secondary', t('emptyExcludedSites')));
    return section;
  }
  const list = element('ul', 'rounded-lg bg-surface px-4 ring-1 ring-line ring-inset');
  for (const origin of model.state.excludedOrigins) {
    const item = element('li', 'flex min-h-[52px] items-center justify-between gap-3 border-b border-line last:border-0');
    const restore = button(t('restoreCandidate'), 'min-h-9 shrink-0 rounded-md px-2 text-xs text-accent hover:bg-soft disabled:opacity-60', () => void model.restore(origin));
    restore.dataset.focusKey = `restore:${origin}`;
    restore.setAttribute('aria-label', t('restoreCandidateLabel', { origin }));
    item.append(element('p', 'font-latin min-w-0 text-[13px] [overflow-wrap:anywhere]', origin), restore);
    list.append(item);
  }
  section.append(list);
  return section;
}

function pausedNotice(): HTMLElement {
  const section = element('div', 'flex flex-col gap-2 rounded-lg bg-soft p-3 text-xs text-secondary');
  section.append(element('p', undefined, t('pausedHint')));
  const resume = button(t('resumeAutoLogin'), 'min-h-9 rounded-md text-left font-medium text-accent hover:underline disabled:opacity-60', () => void model.setPaused(false));
  resume.dataset.focusKey = 'resume-auto-login';
  section.append(resume);
  return section;
}

function languageSettings(): HTMLElement {
  const section = element('section', 'flex flex-col gap-3.5');
  section.setAttribute('aria-labelledby', 'display-settings-title');
  const title = element('h2', 'text-[17px] font-semibold leading-[1.6]', t('displaySettings'));
  title.id = 'display-settings-title';
  const row = element('div', 'flex flex-wrap items-center justify-between gap-6');
  const description = element('div', 'min-w-0 flex-1');
  const label = element('label', 'block text-[13px] font-medium leading-[1.6]', t('language'));
  label.htmlFor = 'language';
  const hint = element('p', 'mt-1 text-xs leading-[1.6] text-secondary', t('autoLanguageHint'));
  hint.id = 'language-hint';
  description.append(label, hint);
  const control = element('div', 'relative flex h-10 w-[180px] shrink-0 items-center rounded-md bg-surface ring-1 ring-line ring-inset');
  const language = element('select', 'h-full w-full appearance-none rounded-md bg-transparent py-2 pr-9 pl-3 text-[13px] text-ink disabled:opacity-70');
  language.id = 'language';
  language.setAttribute('aria-describedby', hint.id);
  language.dataset.focusKey = 'language';
  for (const [value, label] of [['auto', t('autoLanguage')], ['ja', '日本語'], ['en', 'English']]) {
    const option = element('option', undefined, label);
    option.value = value!;
    option.selected = value === languagePreference;
    language.append(option);
  }
  language.disabled = languageChanging;
  language.addEventListener('change', () => void changeLanguage(normalizeLocalePreference(language.value)));
  control.append(language, icon('chevron', 'pointer-events-none absolute right-3 size-4 text-secondary'));
  row.append(description, control);
  section.append(title, row);
  return section;
}

function settingsFooter(): HTMLElement {
  const footer = element('footer', 'border-t border-line py-[18px]');
  const support = element('a', 'flex min-h-5 w-fit items-center gap-2 rounded-sm text-xs text-secondary underline-offset-4 hover:text-accent hover:underline', t('support'));
  support.href = 'https://buymeacoffee.com/euonymuslke';
  support.target = '_blank';
  support.rel = 'noopener noreferrer';
  support.setAttribute('aria-label', t('supportLabel'));
  support.append(icon('external', 'size-[13px] shrink-0 text-muted'));
  support.dataset.focusKey = 'support';
  footer.append(support);
  return footer;
}

function popupFooter(): HTMLElement {
  const footer = element('footer', 'shrink-0 border-t border-line');
  const openSettings = button('', 'flex min-h-[46px] w-full items-center gap-2 px-5 py-3.5 text-left text-xs text-secondary transition hover:bg-soft disabled:opacity-60', () => {
    void browser.runtime.openOptionsPage().catch(() => {
      model.feedback = { kind: 'error', context: 'load', key: 'settingsOpenFailed' };
      render();
    });
  });
  openSettings.dataset.focusKey = 'open-settings';
  openSettings.append(icon('settings'), element('span', 'min-w-0 flex-1', t('siteSettings')), icon('external', 'size-3.5 shrink-0 text-muted'));
  footer.append(openSettings);
  return footer;
}

function render(): void {
  document.documentElement.lang = locale;
  document.title = isSettings ? `${t('siteSettings')} — Login Pilot` : 'Login Pilot';
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focusKey : undefined;
  const wrapper = element('div', isSettings ? 'flex min-h-screen w-full flex-col bg-soft text-ink'
    : 'popup-shell flex max-h-[600px] w-full flex-col overflow-hidden rounded-xl bg-surface text-ink');
  const header = element('header', 'flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-5 py-4');
  const brandIcon = element('img', 'size-8 shrink-0');
  brandIcon.src = '/icon.svg';
  brandIcon.alt = '';
  brandIcon.width = 32;
  brandIcon.height = 32;
  header.append(brandIcon, element(isSettings ? 'p' : 'h1', 'font-latin min-w-0 text-[17px] font-semibold leading-normal', 'Login Pilot'));
  const content = element('div', isSettings ? 'mx-auto flex w-full max-w-[1000px] flex-col gap-7 px-5 py-9 sm:px-16'
    : 'popup-content flex min-h-0 flex-col gap-6 overflow-y-auto p-5');
  content.setAttribute('aria-busy', String(model.isLoading));
  if (isSettings) {
    const heading = element('div', 'flex flex-col gap-1.5');
    heading.append(element('h1', 'text-[26px] font-semibold leading-[1.6]', t('siteSettings')),
      element('p', 'text-[13px] leading-[1.6] text-secondary', t('settingsDescription')));
    content.append(heading);
  }
  if (model.isLoading) {
    const loading = element('div', 'flex items-center gap-3 rounded-xl bg-soft p-4 text-xs leading-relaxed text-secondary');
    loading.setAttribute('role', 'status');
    loading.append(icon('loader', 'size-4 shrink-0 motion-safe:animate-spin'), element('p', undefined, t('loading')));
    content.append(loading);
  } else if (model.hasLoaded) {
    if (isSettings) {
      if (model.feedback && model.feedback.context !== 'remove') content.append(feedbackElement());
      content.append(automationSettings(), registeredSites(), excludedSites());
    } else {
      if (model.state.autoLoginPaused) content.append(pausedNotice());
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
    }
  } else if (model.feedback) {
    content.append(feedbackElement());
  }
  if (isSettings) {
    content.append(languageSettings(), settingsFooter());
    wrapper.append(header, content);
  } else {
    wrapper.append(header, content, popupFooter());
  }
  app.replaceChildren(wrapper);
  if (focusAfterAction) {
    document.getElementById(focusAfterAction)?.focus({ preventScroll: true });
    focusAfterAction = null;
  } else if (previousFocus) {
    const target = [...app.querySelectorAll<HTMLElement>('[data-focus-key]')].find((node) => node.dataset.focusKey === previousFocus);
    if (target && !target.matches(':disabled')) target.focus({ preventScroll: true });
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (['autoLoginPaused', 'excludedOrigins'].some((key) => key in changes) ||
    (isSettings && ['registeredOrigins', 'passkeyOrigins', 'passkeyFrameOrigins', 'federatedProviders'].some((key) => key in changes))) {
    void model.load();
  }
});

render();
void getLanguagePreference()
  .catch(() => 'auto' as const)
  .then((preference) => {
    languagePreference = preference;
    locale = resolveLocale([browser.i18n.getUILanguage()], preference);
    return model.load();
  });
