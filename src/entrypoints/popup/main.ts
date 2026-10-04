import { browser } from 'wxt/browser';
import './style.css';
import { MESSAGE_TYPES, type PopupResponse, type PopupState, type CredentialSetupResponse } from '../../shared/messages';
import { normalizeOrigin } from '../../shared/origins';

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Popup root element was not found.');
const app = appRoot;

let state: PopupState = { registeredOrigins: [], pendingSite: null, currentOrigin: null };
let isLoading = true;
let hasLoaded = false;
let action: { type: 'register' | 'remove' | 'setup'; origin: string } | null = null;
let feedback: {
  kind: 'success' | 'error';
  context: 'register' | 'remove' | 'load' | 'setup';
  message: string;
} | null = null;
let focusAfterAction: 'feedback' | 'registered-title' | null = null;

type IconName = 'globe' | 'check' | 'alert' | 'shield' | 'arrow' | 'loader' | 'info';

class PopupError extends Error {}

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
    shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4',
    arrow: 'M5 12h14M12 5l7 7-7 7',
    loader: 'M12 3a9 9 0 1 1-9 9',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v5M12 7h.01',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name]);
  node.append(path);
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.disabled = action !== null;
  node.addEventListener('click', onClick);
  return node;
}

async function loadState(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.getPopupState,
    currentOrigin: tab?.url ? normalizeOrigin(tab.url) : null,
  })) as PopupResponse;
  if (!response.ok) throw new PopupError(response.error);
  state = response;
  hasLoaded = true;
}

async function registerPendingSite(): Promise<void> {
  if (action || !state.pendingSite) return;
  const origin = state.pendingSite.origin;
  action = { type: 'register', origin };
  feedback = null;
  render();
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const currentOrigin = tab?.url ? normalizeOrigin(tab.url) : null;
    const matchesCurrentSite = currentOrigin === origin;
    const response = (await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.registerOrigin,
      origin,
      ...(matchesCurrentSite && tab?.id !== undefined ? { tabId: tab.id } : {}),
    })) as { ok: boolean; error?: string };
    if (!response.ok) throw new PopupError(response.error ?? 'サイトを登録できませんでした。');
    state = {
      ...state,
      currentOrigin,
      registeredOrigins: [...new Set([...state.registeredOrigins, origin])].sort(),
      pendingSite: null,
    };
    feedback = {
      kind: 'success',
      context: 'register',
      message: matchesCurrentSite
        ? 'サイトを登録しました。このページから自動ログインを試みます。'
        : 'サイトを登録しました。次回から自動入力後にログインします。',
    };
    try {
      await loadState();
    } catch {
      feedback = { kind: 'error', context: 'register', message: 'サイトを登録しましたが、最新の状態を取得できませんでした。' };
    }
    focusAfterAction = 'feedback';
  } catch (error) {
    feedback = { kind: 'error', context: 'register', message: error instanceof PopupError ? error.message : 'サイトを登録できませんでした。' };
    focusAfterAction = 'feedback';
  } finally {
    action = null;
    render();
  }
}

async function removeOrigin(origin: string): Promise<void> {
  if (action) return;
  action = { type: 'remove', origin };
  feedback = null;
  render();
  try {
    const response = (await browser.runtime.sendMessage({ type: MESSAGE_TYPES.removeOrigin, origin })) as { ok: boolean; error?: string };
    if (!response.ok) throw new PopupError(response.error ?? 'サイトの登録を解除できませんでした。');
    state = { ...state, registeredOrigins: state.registeredOrigins.filter((registered) => registered !== origin) };
    feedback = { kind: 'success', context: 'remove', message: 'サイトの登録を解除しました。' };
    try {
      await loadState();
    } catch {
      feedback = { kind: 'error', context: 'remove', message: '登録を解除しましたが、最新の状態を取得できませんでした。' };
    }
    focusAfterAction = 'registered-title';
  } catch (error) {
    feedback = { kind: 'error', context: 'remove', message: error instanceof PopupError ? error.message : 'サイトの登録を解除できませんでした。' };
    focusAfterAction = 'feedback';
  } finally {
    action = null;
    render();
  }
}

async function enableCredentialLogin(): Promise<void> {
  if (action || !state.currentOrigin) return;
  const origin = state.currentOrigin;
  action = { type: 'setup', origin };
  feedback = null;
  render();
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !tab.url || normalizeOrigin(tab.url) !== origin) {
      throw new PopupError('対象のログインページを開いてください。');
    }
    const response = await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: tab.id,
    }) as CredentialSetupResponse;
    if (!response.ok) throw new PopupError(response.error);
    feedback = response.filled
      ? { kind: 'success', context: 'setup', message: 'ログイン情報を取得しました。Chromeに確認が表示された場合は、自動ログインを有効にしてください。' }
      : { kind: 'error', context: 'setup', message: 'ログイン情報を取得できませんでした。Chromeの保存済みパスワードと「自動的にログイン」の設定を確認してください。' };
  } catch (error) {
    feedback = { kind: 'error', context: 'setup', message: error instanceof PopupError ? error.message : '設定できませんでした。ログインページでやり直してください。' };
  } finally {
    action = null;
    focusAfterAction = 'feedback';
    render();
  }
}

function feedbackElement(): HTMLElement {
  const success = feedback?.kind === 'success';
  const node = element('div', `flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed ${success ? 'bg-success-soft text-success' : 'bg-error-soft text-error'}`);
  node.id = 'feedback';
  node.tabIndex = -1;
  node.setAttribute('role', success ? 'status' : 'alert');
  node.append(icon(success ? 'check' : 'alert', 'mt-0.5 size-4 shrink-0'), element('p', 'min-w-0 [overflow-wrap:anywhere]', feedback?.message));
  return node;
}

function currentSite(compact = false): HTMLElement {
  const registered = state.currentOrigin !== null && state.registeredOrigins.includes(state.currentOrigin);
  const node = element('section', `shrink-0 space-y-3 rounded-xl border p-4 ${registered && !compact ? 'border-ink bg-ink text-white' : 'border-line bg-soft text-ink'}`);
  node.setAttribute('aria-label', '現在のサイト');
  const labelRow = element('div', 'flex items-center justify-between gap-2');
  labelRow.append(element('h2', `text-[11px] ${registered && !compact ? 'text-slate-300' : 'text-secondary'}`, '現在のサイト'));
  if (state.currentOrigin && (!registered || compact)) {
    labelRow.append(element('span', `shrink-0 rounded-full px-2 py-1 text-[11px] ${registered ? 'bg-success-soft text-success' : 'bg-line text-secondary'}`, registered ? '自動ログイン有効' : '未登録'));
  }
  node.append(labelRow);
  if (!state.currentOrigin) {
    const message = element('div', 'flex items-start gap-2');
    message.append(icon('info', 'mt-0.5 size-4 shrink-0 text-muted'), element('p', 'text-sm font-medium', 'このページでは利用できません'));
    node.append(message, element('p', 'text-xs leading-relaxed text-secondary', 'ログインするサイトを開いてください。'));
    return node;
  }
  node.append(element('p', `min-w-0 [overflow-wrap:anywhere] font-semibold ${compact ? 'text-sm' : 'text-[19px] leading-relaxed'}`, state.currentOrigin));
  if (compact) return node;
  if (registered) {
    const status = element('div', 'flex items-center gap-2 text-xs font-medium text-emerald-200');
    status.append(icon('check', 'size-4 shrink-0 text-emerald-300'), element('span', undefined, '自動ログイン有効'));
    node.append(status, element('p', 'text-xs leading-relaxed text-slate-300', '自動入力を検知すると、ログインフォームを送信します。'));
    const setup = button(action?.type === 'setup' ? '確認中…' : 'クリックなしのログインを設定',
      'min-h-10 w-full rounded-lg bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70',
      () => void enableCredentialLogin());
    setup.dataset.focusKey = 'setup';
    node.append(setup, element('p', 'text-[11px] leading-relaxed text-slate-300', '初回だけ、Chromeのアカウント確認と自動ログインを承認してください。'));
  } else {
    node.append(element('p', 'text-xs leading-relaxed text-secondary', 'ログイン情報が自動入力されると、ここからサイトを登録できます。'));
  }
  return node;
}

function pendingSite(): HTMLElement {
  const matchesCurrentSite = state.pendingSite?.origin === state.currentOrigin;
  const node = element('section', 'shrink-0 space-y-2.5 rounded-xl border border-sky-200 bg-sky-50 p-4');
  node.setAttribute('aria-label', '新しいサイトの登録');
  const labelRow = element('div', 'flex items-center justify-between gap-2');
  labelRow.append(element('h2', 'text-[11px] text-secondary', matchesCurrentSite ? '現在のサイト' : '検知したサイト'));
  labelRow.append(element('span', 'shrink-0 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-medium text-accent', '自動入力を検知'));
  const registerButton = button(action?.type === 'register' ? '登録中…' : '登録して自動ログイン', 'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70', () => void registerPendingSite());
  registerButton.dataset.focusKey = 'register';
  registerButton.append(icon(action?.type === 'register' ? 'loader' : 'arrow', `size-4 shrink-0 ${action?.type === 'register' ? 'motion-safe:animate-spin' : ''}`));
  node.append(
    labelRow,
    element('p', 'min-w-0 text-[19px] font-semibold leading-relaxed [overflow-wrap:anywhere]', state.pendingSite?.origin),
    element('p', 'whitespace-pre-line text-[17px] font-semibold leading-relaxed', 'このサイトで\n自動ログインしますか？'),
    element('p', 'text-xs leading-relaxed text-secondary', '登録すると、次回から自動入力後にログインします。'),
    registerButton,
    element('p', 'text-[11px] leading-relaxed text-secondary', matchesCurrentSite ? '登録後、このページから自動ログインを試みます。' : '登録対象は、上に表示されているサイトです。'),
  );
  if (feedback?.context === 'register') node.append(feedbackElement());
  return node;
}

function registeredSites(): HTMLElement {
  const node = element('section', 'flex min-h-[82px] flex-col gap-1');
  node.setAttribute('aria-labelledby', 'registered-title');
  const heading = element('div', 'flex shrink-0 items-center justify-between gap-2');
  const title = element('h2', 'text-[13px] font-semibold', '登録済みサイト');
  title.id = 'registered-title';
  title.tabIndex = -1;
  heading.append(title, element('span', 'rounded-full bg-soft px-2 py-1 text-[11px] text-secondary', `${state.registeredOrigins.length}件`));
  node.append(heading);
  if (feedback?.context === 'remove') node.append(feedbackElement());
  if (!state.registeredOrigins.length) {
    const empty = element('div', 'space-y-2 py-5');
    empty.append(icon('globe', 'size-6 text-muted'), element('p', 'text-[13px] font-medium', 'まだ登録されたサイトはありません'), element('p', 'text-xs leading-relaxed text-secondary', '使いたいサイトでログイン情報を自動入力して、最初のサイトを登録しましょう。'));
    node.append(empty);
    return node;
  }
  const list = element('ul', 'site-list min-h-0 overflow-y-auto overscroll-contain');
  list.tabIndex = 0;
  list.setAttribute('aria-label', '登録済みサイトの一覧');
  for (const origin of state.registeredOrigins) {
    const item = element('li', `flex min-h-[52px] items-center gap-2.5 border-b border-line ${origin === state.currentOrigin ? 'bg-sky-50' : ''}`);
    const remove = button(action?.type === 'remove' && action.origin === origin ? '解除中…' : '解除', 'min-h-8 shrink-0 rounded-md px-2 text-xs text-secondary transition hover:bg-error-soft hover:text-error disabled:cursor-wait disabled:opacity-60', () => void removeOrigin(origin));
    remove.setAttribute('aria-label', `${origin} の登録を解除`);
    remove.dataset.focusKey = `remove:${origin}`;
    item.append(icon('globe', 'size-4 shrink-0 text-muted'), element('span', 'min-w-0 flex-1 py-3 text-[13px] leading-relaxed [overflow-wrap:anywhere]', origin), remove);
    list.append(item);
  }
  node.append(list);
  return node;
}

function render(): void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focusKey : undefined;
  const wrapper = element('div', 'popup-shell flex max-h-[600px] w-[360px] flex-col bg-surface text-ink');
  const header = element('header', 'flex h-16 shrink-0 items-center gap-3 border-b border-line px-5 py-4');
  const brandIcon = element('img', 'size-8 shrink-0');
  brandIcon.src = '/icon.svg';
  brandIcon.alt = '';
  brandIcon.width = 32;
  brandIcon.height = 32;
  header.append(brandIcon, element('h1', 'min-w-0 text-[17px] font-semibold tracking-tight', 'Login Pilot'));
  const content = element('div', 'popup-content flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4');
  content.setAttribute('aria-busy', String(isLoading));
  if (isLoading) {
    const loading = element('div', 'flex items-center gap-3 rounded-xl bg-soft p-4 text-xs leading-relaxed text-secondary');
    loading.setAttribute('role', 'status');
    loading.append(icon('loader', 'size-4 shrink-0 motion-safe:animate-spin'), element('p', undefined, 'サイトの状態を確認しています…'));
    content.append(loading);
  } else if (hasLoaded) {
    const pending = state.pendingSite && !state.registeredOrigins.includes(state.pendingSite.origin);
    if (pending) {
      content.append(pendingSite());
      if (state.pendingSite?.origin !== state.currentOrigin) content.append(currentSite(true));
    } else {
      content.append(currentSite());
    }
    if (feedback && feedback.context !== 'remove' && !(pending && feedback.context === 'register')) content.append(feedbackElement());
    content.append(registeredSites());
  } else if (feedback) {
    content.append(feedbackElement());
  }
  const footer = element('footer', 'flex shrink-0 items-center gap-2 border-t border-line bg-soft px-5 py-3.5 text-[11px] text-secondary');
  footer.append(icon('shield', 'size-4 shrink-0 text-muted'), element('p', undefined, 'ID・パスワードは保存しません。'));
  wrapper.append(header, content, footer);
  app.replaceChildren(wrapper);
  if (focusAfterAction) {
    document.getElementById(focusAfterAction)?.focus({ preventScroll: true });
    focusAfterAction = null;
  } else if (previousFocus) {
    const target = [...app.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.dataset.focusKey === previousFocus);
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }
}

render();
void loadState()
  .catch((error: unknown) => {
    feedback = { kind: 'error', context: 'load', message: error instanceof PopupError ? error.message : '状態を読み込めませんでした。ポップアップを開き直してください。' };
  })
  .finally(() => {
    isLoading = false;
    render();
  });
