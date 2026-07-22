import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  clearPendingSite,
  getPendingSite,
  getRegisteredOrigins,
  setPendingSite,
  setRegisteredOrigins,
} from '../shared/storage';
import { MESSAGE_TYPES, type PopupResponse, type PopupState, type RuntimeMessage } from '../shared/messages';
import { normalizeOrigin } from '../shared/origins';

const NOTIFICATION_ID = 'auto-signin-site-detected';

function isMessage(value: unknown): value is RuntimeMessage {
  return typeof value === 'object' && value !== null && 'type' in value;
}

async function isRegistered(origin: string): Promise<boolean> {
  const origins = await getRegisteredOrigins();
  return origins.includes(origin);
}

async function notifySiteDetected(origin: string): Promise<void> {
  await setPendingSite({ origin, detectedAt: Date.now() });
  await browser.action.setBadgeText({ text: '1' });
  await browser.action.setBadgeBackgroundColor({ color: '#0284c7' });

  try {
    await browser.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon.svg'),
      title: 'loginpilot',
      message: `${origin} でログイン情報の自動入力を検知しました。拡張機能を開いて登録できます。`,
    });
  } catch {
    return;
  }
}

async function getPopupState(currentOrigin: string | null): Promise<PopupResponse> {
  const state: PopupState = {
    registeredOrigins: await getRegisteredOrigins(),
    pendingSite: await getPendingSite(),
    currentOrigin,
  };

  return { ok: true, ...state };
}

async function handleMessage(
  message: RuntimeMessage,
  sender: Browser.runtime.MessageSender,
): Promise<PopupResponse | { ok: true; action: 'submit' | 'ignore' | 'pending' } | { ok: false; error: string }> {
  if (message.type === MESSAGE_TYPES.autofillDetected) {
    const senderUrl = sender.url ?? sender.tab?.url;
    const senderOrigin = senderUrl ? normalizeOrigin(senderUrl) : null;
    if (!senderOrigin || senderOrigin !== message.origin) {
      return { ok: true, action: 'ignore' };
    }

    if (await isRegistered(message.origin)) {
      return { ok: true, action: 'submit' };
    }

    await notifySiteDetected(message.origin);
    return { ok: true, action: 'pending' };
  }

  if (message.type === MESSAGE_TYPES.getPopupState) {
    return getPopupState(message.currentOrigin);
  }

  const origin = normalizeOrigin(message.origin);
  if (!origin) {
    return { ok: false, error: 'HTTPまたはHTTPSのoriginだけ登録できます。' };
  }

  const origins = await getRegisteredOrigins();

  if (message.type === MESSAGE_TYPES.registerOrigin) {
    await setRegisteredOrigins([...origins, origin]);
    const pendingSite = await getPendingSite();
    if (pendingSite?.origin === origin) {
      await clearPendingSite();
      await browser.notifications.clear(NOTIFICATION_ID);
      await browser.action.setBadgeText({ text: '' });
    }

    if (message.tabId !== undefined) {
      try {
        await browser.tabs.sendMessage(message.tabId, {
          type: MESSAGE_TYPES.siteRegistered,
          origin,
        });
      } catch {
        return { ok: true, action: 'ignore' };
      }
    }

    return { ok: true, action: 'ignore' };
  }

  if (message.type === MESSAGE_TYPES.removeOrigin) {
    await setRegisteredOrigins(origins.filter((registeredOrigin) => registeredOrigin !== origin));
    return { ok: true, action: 'ignore' };
  }

  return { ok: false, error: '未対応のメッセージです。' };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isMessage(message)) {
      return false;
    }

    void handleMessage(message, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: '処理に失敗しました。' }));

    return true;
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== NOTIFICATION_ID) {
      return;
    }

    void browser.notifications.clear(NOTIFICATION_ID);
  });
});
