import { browser } from 'wxt/browser';
import './style.css';
import { MESSAGE_TYPES, type PopupResponse, type PopupState } from '../../shared/messages';
import { normalizeOrigin } from '../../shared/origins';

const appRoot = document.querySelector<HTMLElement>('#app');

if (!appRoot) {
  throw new Error('Popup root element was not found.');
}

const app = appRoot;

let state: PopupState = {
  registeredOrigins: [],
  pendingSite: null,
  currentOrigin: null,
};
let statusMessage = '';

function element<K extends keyof HTMLElementTagNameMap>(tagName: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', className);
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

async function getCurrentOrigin(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? normalizeOrigin(tab.url) : null;
}

async function loadState(): Promise<void> {
  const currentOrigin = await getCurrentOrigin();
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.getPopupState,
    currentOrigin,
  })) as PopupResponse;

  if (!response.ok) {
    statusMessage = response.error;
    return;
  }

  state = response;
}

async function registerPendingSite(): Promise<void> {
  if (!state.pendingSite) {
    return;
  }

  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.registerOrigin,
    origin: state.pendingSite.origin,
    tabId: (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id,
  })) as { ok: boolean; error?: string };

  if (!response.ok) {
    statusMessage = response.error ?? 'サイトを登録できませんでした。';
    render();
    return;
  }

  statusMessage = 'サイトを登録しました。このページから自動ログインを試みます。';
  await loadState();
  render();
}

async function removeOrigin(origin: string): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.removeOrigin,
    origin,
  })) as { ok: boolean; error?: string };

  if (!response.ok) {
    statusMessage = response.error ?? 'サイトを削除できませんでした。';
    render();
    return;
  }

  statusMessage = 'サイトの登録を解除しました。';
  await loadState();
  render();
}

function render(): void {
  app.replaceChildren();

  const wrapper = element('div', 'w-[360px] space-y-4 p-4');
  const header = element('header', 'flex items-start justify-between gap-3');
  const titleGroup = element('div', 'space-y-1');
  const title = element('h1', 'text-lg font-semibold tracking-tight text-slate-950');
  title.textContent = 'loginpilot';
  const subtitle = element('p', 'text-xs leading-5 text-slate-500');
  subtitle.textContent = '登録済みサイトで自動入力後にログインします。';
  titleGroup.append(title, subtitle);
  const count = element('span', 'rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700');
  count.textContent = `${state.registeredOrigins.length}件`;
  header.append(titleGroup, count);
  wrapper.append(header);

  if (state.pendingSite) {
    const pending = element('section', 'space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3');
    const pendingTitle = element('h2', 'text-sm font-semibold text-sky-950');
    pendingTitle.textContent = '新しいサイトを検知しました';
    const pendingText = element('p', 'break-all text-xs leading-5 text-sky-800');
    pendingText.textContent = `${state.pendingSite.origin} のログイン情報が自動入力されました。`;
    const pendingButton = button(
      'このサイトを登録する',
      'w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400',
      () => void registerPendingSite(),
    );
    pending.append(pendingTitle, pendingText, pendingButton);
    wrapper.append(pending);
  }

  const current = element('section', 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm');
  const currentTitle = element('h2', 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500');
  currentTitle.textContent = '現在のサイト';
  const currentOrigin = element('p', 'break-all text-sm text-slate-800');
  currentOrigin.textContent = state.currentOrigin ?? '取得できません';
  current.append(currentTitle, currentOrigin);
  wrapper.append(current);

  const registered = element('section', 'space-y-2');
  const registeredTitle = element('h2', 'text-sm font-semibold text-slate-900');
  registeredTitle.textContent = '登録済みサイト';
  registered.append(registeredTitle);

  if (state.registeredOrigins.length === 0) {
    const empty = element('p', 'rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs leading-5 text-slate-500');
    empty.textContent = 'まだサイトが登録されていません。';
    registered.append(empty);
  } else {
    const list = element('ul', 'space-y-2');
    for (const origin of state.registeredOrigins) {
      const item = element('li', 'flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm');
      const originText = element('span', 'min-w-0 break-all text-xs text-slate-700');
      originText.textContent = origin;
      const removeButton = button(
        '削除',
        'shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300',
        () => void removeOrigin(origin),
      );
      item.append(originText, removeButton);
      list.append(item);
    }
    registered.append(list);
  }
  wrapper.append(registered);

  if (statusMessage) {
    const status = element('p', 'rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800');
    status.setAttribute('role', 'status');
    status.textContent = statusMessage;
    wrapper.append(status);
  }

  app.append(wrapper);
}

void loadState()
  .catch(() => {
    statusMessage = '状態を読み込めませんでした。';
  })
  .finally(() => render());
