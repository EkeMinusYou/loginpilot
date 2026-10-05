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
import {
  MESSAGE_TYPES,
  type PopupResponse,
  type PopupState,
  type RuntimeMessage,
  type CredentialSetupResponse,
} from '../shared/messages';
import { normalizeOrigin } from '../shared/origins';
import { isAuthorizedRuntimeMessage, isRuntimeMessage } from '../shared/message-validation';

const NOTIFICATION_ID = 'auto-signin-site-detected';

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
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: 'Login Pilot',
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
): Promise<PopupResponse | CredentialSetupResponse | { ok: true; action: 'submit' | 'ignore' | 'pending' } | { ok: false; error: string }> {
  if (!isAuthorizedRuntimeMessage(message, sender, browser.runtime.id, browser.runtime.getURL('/popup.html'))) {
    return { ok: false, error: 'この操作は許可されていません。' };
  }
  if (message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.getLoginPolicy) {
    const senderUrl = sender.url ?? sender.tab?.url;
    const senderOrigin = senderUrl ? normalizeOrigin(senderUrl) : null;
    if (!senderOrigin || senderOrigin !== message.origin) {
      return { ok: true, action: 'ignore' };
    }

    if (await isRegistered(message.origin)) {
      return { ok: true, action: 'submit' };
    }

    if (message.type === MESSAGE_TYPES.getLoginPolicy) return { ok: true, action: 'ignore' };

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

  if (message.type === MESSAGE_TYPES.enableCredentialLogin) {
    if (sender.url !== browser.runtime.getURL('/popup.html') || !origins.includes(origin)) {
      return { ok: false, error: '登録済みサイトのポップアップから設定してください。' };
    }
    try {
      const tab = await browser.tabs.get(message.tabId);
      if (!tab.url || normalizeOrigin(tab.url) !== origin) {
        return { ok: false, error: '対象のログインページを開いてください。' };
      }
      return await browser.tabs.sendMessage(message.tabId, {
        type: MESSAGE_TYPES.enableCredentialLogin,
        origin,
      }, { frameId: 0 }) as CredentialSetupResponse;
    } catch {
      return { ok: false, error: 'ログインページを再読み込みして、設定をやり直してください。' };
    }
  }

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
        const tab = await browser.tabs.get(message.tabId);
        if (!tab.url || normalizeOrigin(tab.url) !== origin) {
          return { ok: true, action: 'ignore' };
        }
        await browser.tabs.sendMessage(message.tabId, {
          type: MESSAGE_TYPES.siteRegistered,
          origin,
        }, { frameId: 0 });
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
    if (!isRuntimeMessage(message)) {
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
