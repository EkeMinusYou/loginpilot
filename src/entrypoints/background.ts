import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  clearPendingSite,
  getPendingSite,
  setPendingSite,
  getRegistrationState,
  setRegistrationState,
} from '../shared/storage';
import {
  MESSAGE_TYPES,
  type PopupResponse,
  type PopupState,
  type RuntimeMessage,
  type CredentialSetupResponse,
  type AutofillResponse,
  type LoginMethod,
  type PasskeyFrameResponse,
} from '../shared/messages';
import { createMutationQueue, shouldReplaceCandidate } from '../shared/state-mutations';
import { normalizeOrigin } from '../shared/origins';
import { isAuthorizedRuntimeMessage, isRuntimeMessage } from '../shared/message-validation';
import { createTranslator } from '../shared/i18n';
import { getExtensionLocale } from '../shared/extension-language';
import { isSecureLoginOrigin } from '../shared/passkey-login';

const NOTIFICATION_ID = 'auto-signin-site-detected';
const mutateState = createMutationQueue();
type Effect = () => Promise<void>;

interface PasskeyTarget {
  siteOrigin: string;
  authenticationOrigin: string;
  tabId: number;
  frameId: number;
  documentId?: string;
  seenAt: number;
}
const passkeyTargets = new Map<string, PasskeyTarget>();

function targetKey(tabId: number, siteOrigin: string, authenticationOrigin: string): string {
  return JSON.stringify([tabId, siteOrigin, authenticationOrigin]);
}

async function passkeyContext(origin: string, sender: Browser.runtime.MessageSender, usageHint = false): Promise<PasskeyTarget | null> {
  const tabId = sender.tab!.id!;
  const frameId = sender.frameId!;
  if (frameId === 0) {
    // The validated active top-level sender identifies its own origin without
    // relying on activeTab's temporary access to the sensitive tab URL.
    return isSecureLoginOrigin(origin) ? {
      siteOrigin: origin, authenticationOrigin: origin, tabId, frameId,
      ...(sender.documentId ? { documentId: sender.documentId } : {}), seenAt: Date.now(),
    } : null;
  }
  try {
    const tab = await browser.tabs.get(tabId);
    let siteOrigin = tab.url ? normalizeOrigin(tab.url) : null;
    let frameVerified = false;
    if (!tab.url) {
      // activeTab does not expose URLs on later visits. Ask the authenticated
      // top-level content script for its own origin and current frame visibility.
      const proof = await browser.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.checkPasskeyFrame, authenticationOrigin: origin,
      }, { frameId: 0 }) as PasskeyFrameResponse;
      if (!proof?.ok || !proof.origin || normalizeOrigin(proof.origin) !== proof.origin) return null;
      const previous = passkeyTargets.get(targetKey(tabId, proof.origin, origin));
      const recentUsage = usageHint && sender.documentId !== undefined && previous?.documentId === sender.documentId &&
        previous.frameId === frameId && Date.now() - previous.seenAt <= 15000;
      if (!proof.visible && !recentUsage) return null;
      siteOrigin = proof.origin;
      frameVerified = true;
    }
    if (!siteOrigin || !isSecureLoginOrigin(siteOrigin) || !isSecureLoginOrigin(origin)) return null;
    if (frameId !== 0) {
      const previous = passkeyTargets.get(targetKey(tabId, siteOrigin, origin));
      // A site may remove its iframe immediately after authentication. For a
      // registration hint only, reuse a recent proof for the exact same document.
      const recentlyVerified = usageHint && sender.documentId !== undefined &&
        previous?.documentId === sender.documentId && previous.frameId === frameId &&
        Date.now() - previous.seenAt <= 15000;
      if (!recentlyVerified && !frameVerified) {
        const proof = await browser.tabs.sendMessage(tabId, {
          type: MESSAGE_TYPES.checkPasskeyFrame, origin: siteOrigin, authenticationOrigin: origin,
        }, { frameId: 0 }) as PasskeyFrameResponse;
        if (!proof?.ok || proof.visible !== true) return null;
      }
    }
    const target: PasskeyTarget = { siteOrigin, authenticationOrigin: origin, tabId, frameId,
      ...(sender.documentId ? { documentId: sender.documentId } : {}), seenAt: Date.now() };
    if (frameId !== 0) {
      for (const [key, value] of passkeyTargets) {
        if (Date.now() - value.seenAt > 15000) passkeyTargets.delete(key);
      }
      passkeyTargets.set(targetKey(tabId, siteOrigin, origin), target);
    }
    return target;
  } catch {
    return null;
  }
}

async function startPasskeyLogin(origin: string, tabId: number): Promise<CredentialSetupResponse> {
  const authenticationOrigin = (await getRegistrationState()).passkeyFrameOrigins[origin];
  if (!authenticationOrigin) {
    return await browser.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.startPasskeyLogin, origin }, { frameId: 0 }) as CredentialSetupResponse;
  }
  const target = passkeyTargets.get(targetKey(tabId, origin, authenticationOrigin));
  if (!target || Date.now() - target.seenAt > 15000) {
    return { ok: false, error: 'ログインページを再読み込みして、設定をやり直してください。' };
  }
  return await browser.tabs.sendMessage(tabId, {
    type: MESSAGE_TYPES.startPasskeyLogin, origin: authenticationOrigin,
  }, target.documentId ? { documentId: target.documentId } : { frameId: target.frameId }) as CredentialSetupResponse;
}

async function notifySiteDetected(effects: Effect[], origin: string, method: LoginMethod = 'password', authenticationOrigin?: string, passkeyUsed = false): Promise<void> {
  const pending = await getPendingSite();
  const next = { origin, detectedAt: Date.now(), ...(method === 'passkey' ? { method } : {}),
    ...(passkeyUsed ? { passkeyUsed: true as const } : {}),
    ...(authenticationOrigin ? { authenticationOrigin } : {}) };
  if (!shouldReplaceCandidate(pending, next)) return;
  await setPendingSite(next);
  effects.push(async () => {
    try {
      await browser.action.setBadgeText({ text: '1' });
      await browser.action.setBadgeBackgroundColor({ color: '#0284c7' });
      const t = createTranslator(await getExtensionLocale());
      await browser.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: 'Login Pilot',
        message: t(passkeyUsed ? 'passkeyUsedNotification' : method === 'passkey' ? 'passkeyNotification' : 'notification', { origin }),
      });
    } catch {
      return;
    }
  });
}

async function getPopupState(currentOrigin: string | null): Promise<PopupResponse> {
  const { registeredOrigins, passkeyOrigins, passkeyFrameOrigins } = await getRegistrationState();
  const pending = await getPendingSite();
  const candidate = [...passkeyTargets.values()].filter((target) =>
    target.siteOrigin === currentOrigin && Date.now() - target.seenAt <= 15000 &&
    (!registeredOrigins.includes(target.siteOrigin) || passkeyOrigins.includes(target.siteOrigin)) &&
    passkeyFrameOrigins[target.siteOrigin] !== target.authenticationOrigin,
  ).sort((a, b) => b.seenAt - a.seenAt)[0];
  const state: PopupState = {
    registeredOrigins,
    passkeyOrigins,
    passkeyFrameOrigins,
    pendingSite: candidate && !(pending?.passkeyUsed && pending.origin === candidate.siteOrigin &&
      pending.authenticationOrigin === candidate.authenticationOrigin)
      ? { origin: candidate.siteOrigin, detectedAt: candidate.seenAt,
        method: 'passkey', authenticationOrigin: candidate.authenticationOrigin } : pending,
    currentOrigin,
  };

  return { ok: true, ...state };
}

async function handleMessage(
  message: RuntimeMessage,
  sender: Browser.runtime.MessageSender,
  effects: Effect[],
): Promise<PopupResponse | CredentialSetupResponse | AutofillResponse> {
  if (!isAuthorizedRuntimeMessage(message, sender, browser.runtime.id, browser.runtime.getURL('/popup.html'))) {
    return { ok: false, error: 'この操作は許可されていません。' };
  }
  if (message.type === MESSAGE_TYPES.passkeyDetected || message.type === MESSAGE_TYPES.passkeyUsed || message.type === MESSAGE_TYPES.getPasskeyPolicy) {
    const target = await passkeyContext(message.origin, sender, message.type === MESSAGE_TYPES.passkeyUsed);
    if (!target) return { ok: true, action: 'ignore',
      ...(message.type === MESSAGE_TYPES.getPasskeyPolicy ? { retry: true as const } : {}) };
    const preferences = await getRegistrationState();
    const registered = preferences.registeredOrigins.includes(target.siteOrigin);
    const usesPasskey = preferences.passkeyOrigins.includes(target.siteOrigin);
    const frameOrigin = preferences.passkeyFrameOrigins[target.siteOrigin];
    const frameAllowed = target.frameId === 0 ? frameOrigin === undefined : frameOrigin === target.authenticationOrigin;
    if (message.type === MESSAGE_TYPES.passkeyUsed) {
      if (registered && (!usesPasskey || frameAllowed)) return { ok: true, action: 'ignore' };
      // Usage only suggests registration or approval of a new authentication origin.
      await notifySiteDetected(effects, target.siteOrigin, 'passkey', target.frameId !== 0 ? target.authenticationOrigin : undefined, true);
      return { ok: true, action: 'pending' };
    }
    if (usesPasskey && frameAllowed) return { ok: true, action: 'submit', method: 'passkey' };
    if (message.type === MESSAGE_TYPES.getPasskeyPolicy) return { ok: true, action: 'ignore' };
    // A new authentication origin must be reviewed even when the parent site is registered.
    if (registered && (!usesPasskey || frameAllowed || target.frameId === 0)) return { ok: true, action: 'ignore' };
    await notifySiteDetected(effects, target.siteOrigin, 'passkey', target.frameId !== 0 ? target.authenticationOrigin : undefined);
    return { ok: true, action: 'pending' };
  }
  if (message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.getLoginPolicy) {
    const senderUrl = sender.url ?? sender.tab?.url;
    const senderOrigin = senderUrl ? normalizeOrigin(senderUrl) : null;
    if (!senderOrigin || senderOrigin !== message.origin) {
      return { ok: true, action: 'ignore' };
    }

    const preferences = await getRegistrationState();
    if (preferences.registeredOrigins.includes(message.origin)) {
      if (preferences.passkeyOrigins.includes(message.origin)) {
        return { ok: true, action: message.type === MESSAGE_TYPES.autofillDetected ? 'ignore' : 'submit', method: 'passkey' };
      }
      return { ok: true, action: 'submit' };
    }

    if (message.type === MESSAGE_TYPES.getLoginPolicy) return { ok: true, action: 'ignore' };

    await notifySiteDetected(effects, message.origin);
    return { ok: true, action: 'pending' };
  }

  if (message.type === MESSAGE_TYPES.getPopupState) {
    return getPopupState(message.currentOrigin);
  }

  const origin = normalizeOrigin(message.origin);
  if (!origin) {
    return { ok: false, error: 'HTTPまたはHTTPSのoriginだけ登録できます。' };
  }

  const registration = await getRegistrationState();
  const { registeredOrigins: origins, passkeyOrigins, passkeyFrameOrigins: frames } = registration;

  if (message.type === MESSAGE_TYPES.registerOrigin) {
    const savedMethod = passkeyOrigins.includes(origin) ? 'passkey' : 'password';
    if (origins.includes(origin) && message.method !== undefined && message.method !== savedMethod) {
      return { ok: false, error: 'ログイン方式を変更するには、登録を解除してから登録し直してください。' };
    }
    if (message.method === 'passkey' && !isSecureLoginOrigin(origin)) return { ok: false, error: 'パスキーはHTTPSのサイトで設定してください。' };
    if (message.authenticationOrigin !== undefined) {
      const pending = await getPendingSite();
      const cached = [...passkeyTargets.values()].some((target) => target.siteOrigin === origin &&
        target.authenticationOrigin === message.authenticationOrigin && Date.now() - target.seenAt <= 15000 &&
        (message.tabId === undefined || target.tabId === message.tabId));
      if (!isSecureLoginOrigin(message.authenticationOrigin) ||
        (!(pending?.origin === origin && pending.authenticationOrigin === message.authenticationOrigin) && !cached)) {
        return { ok: false, error: 'ログインページを再読み込みして、設定をやり直してください。' };
      }
    }
    if (message.method !== undefined) {
      registration.passkeyOrigins = message.method === 'passkey'
        ? [...passkeyOrigins, origin] : passkeyOrigins.filter((saved) => saved !== origin);
      if (message.authenticationOrigin) frames[origin] = message.authenticationOrigin;
      else delete frames[origin];
    }
    registration.registeredOrigins = [...origins, origin];
    await setRegistrationState(registration);
    const pendingSite = await getPendingSite();
    if (pendingSite?.origin === origin) {
      await clearPendingSite();
      effects.push(async () => {
        await Promise.allSettled([browser.notifications.clear(NOTIFICATION_ID), browser.action.setBadgeText({ text: '' })]);
      });
    }

    if (message.tabId !== undefined) {
      const tabId = message.tabId;
      // Release the mutation queue before a page can wait for Chrome's chooser.
      effects.push(async () => {
        const tab = await browser.tabs.get(tabId);
        if (tab.url && normalizeOrigin(tab.url) !== origin) return;
        if (message.method === 'passkey') await startPasskeyLogin(origin, tabId);
        else await browser.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.siteRegistered, origin }, { frameId: 0 });
      });
    }

    return { ok: true, action: 'ignore' };
  }

  if (message.type === MESSAGE_TYPES.removeOrigin) {
    registration.registeredOrigins = origins.filter((saved) => saved !== origin);
    registration.passkeyOrigins = passkeyOrigins.filter((saved) => saved !== origin);
    delete frames[origin];
    await setRegistrationState(registration);
    return { ok: true, action: 'ignore' };
  }

  return { ok: false, error: '未対応のメッセージです。' };
}

export default defineBackground(() => {
  passkeyTargets.clear();
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isRuntimeMessage(message)) {
      return false;
    }

    const changesState = message.type === MESSAGE_TYPES.registerOrigin || message.type === MESSAGE_TYPES.removeOrigin ||
      message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.passkeyDetected || message.type === MESSAGE_TYPES.passkeyUsed;
    const effects: Effect[] = [];
    void (changesState ? mutateState(() => handleMessage(message, sender, effects)) : handleMessage(message, sender, effects))
      .then(async (response) => {
        // UI/page failures never roll back or misreport persisted preferences.
        await Promise.allSettled(effects.map((effect) => effect()));
        sendResponse(response);
      })
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
