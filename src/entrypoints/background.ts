import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  clearPendingSite,
  getPendingSite,
  setPendingSite,
  getRegistrationState,
  setRegistrationState,
  type RegistrationState,
} from '../shared/storage';
import {
  MESSAGE_TYPES,
  type PopupResponse,
  type PopupState,
  type RuntimeMessage,
  type CredentialSetupResponse,
  type AutofillResponse,
  type PasskeyFrameResponse,
  type PendingSite,
} from '../shared/messages';
import { createMutationQueue, shouldReplaceCandidate } from '../shared/state-mutations';
import { normalizeOrigin } from '../shared/origins';
import { isAuthorizedRuntimeMessage, isRuntimeMessage } from '../shared/message-validation';
import { createTranslator } from '../shared/i18n';
import { getExtensionLocale } from '../shared/extension-language';
import { isSecureLoginOrigin } from '../shared/passkey-login';
import { FEDERATED_PROVIDERS } from '../shared/federated-providers';

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
    return { ok: false, error: 'reloadLoginPage' };
  }
  return await browser.tabs.sendMessage(tabId, {
    type: MESSAGE_TYPES.startPasskeyLogin, origin: authenticationOrigin,
  }, target.documentId ? { documentId: target.documentId } : { frameId: target.frameId }) as CredentialSetupResponse;
}

async function notifySiteDetected(effects: Effect[], candidate: Omit<PendingSite, 'detectedAt'>): Promise<void> {
  const { origin, passwordUsed, passkeyUsed, provider } = candidate;
  const pending = await getPendingSite();
  const next = { ...candidate, detectedAt: Date.now() };
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
        message: t(provider ? 'federatedNotification' : passwordUsed ? 'passwordUsedNotification' : passkeyUsed ? 'passkeyUsedNotification' : 'notification',
          { origin, provider: provider ? FEDERATED_PROVIDERS[provider] : '' }),
      });
    } catch {
      return;
    }
  });
}

async function getPopupState(currentOrigin: string | null): Promise<PopupResponse> {
  const registration = await getRegistrationState();
  const pending = await getPendingSite();
  return popupState(currentOrigin, registration, pending);
}

function popupState(currentOrigin: string | null, registration: RegistrationState, pending: PendingSite | null): PopupResponse {
  const { registeredOrigins, passkeyOrigins, passkeyFrameOrigins, federatedProviders } = registration;
  const state: PopupState = {
    registeredOrigins,
    passkeyOrigins,
    passkeyFrameOrigins,
    federatedProviders,
    pendingSite: pending,
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
    return { ok: false, error: 'operationNotAllowed' };
  }
  if (message.type === MESSAGE_TYPES.getFederatedPolicy || message.type === MESSAGE_TYPES.federatedDetected || message.type === MESSAGE_TYPES.federatedUsed) {
    if (!isSecureLoginOrigin(message.origin)) return { ok: true, action: 'ignore' };
    const preferences = await getRegistrationState();
    const provider = preferences.federatedProviders[message.origin];
    if (message.type === MESSAGE_TYPES.getFederatedPolicy) {
      return provider ? { ok: true, action: 'submit', method: 'federated', provider } : { ok: true, action: 'ignore' };
    }
    if (message.type === MESSAGE_TYPES.federatedDetected || preferences.registeredOrigins.includes(message.origin)) return { ok: true, action: 'ignore' };
    await notifySiteDetected(effects, { origin: message.origin, method: 'federated', provider: message.provider, federatedUsed: true });
    return { ok: true, action: 'pending' };
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
      await notifySiteDetected(effects, { origin: target.siteOrigin, method: 'passkey', passkeyUsed: true,
        ...(target.frameId !== 0 ? { authenticationOrigin: target.authenticationOrigin } : {}) });
      return { ok: true, action: 'pending' };
    }
    if (usesPasskey && frameAllowed) return { ok: true, action: 'submit', method: 'passkey' };
    if (message.type === MESSAGE_TYPES.getPasskeyPolicy) return { ok: true, action: 'ignore' };
    // Button visibility alone does not imply that the user signs in here.
    return { ok: true, action: 'ignore' };
  }
  if (message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.passwordUsed || message.type === MESSAGE_TYPES.getLoginPolicy) {
    const senderUrl = sender.url ?? sender.tab?.url;
    const senderOrigin = senderUrl ? normalizeOrigin(senderUrl) : null;
    if (!senderOrigin || senderOrigin !== message.origin) {
      return { ok: true, action: 'ignore' };
    }

    const preferences = await getRegistrationState();
    if (preferences.registeredOrigins.includes(message.origin)) {
      if (message.type === MESSAGE_TYPES.passwordUsed) return { ok: true, action: 'ignore' };
      if (preferences.federatedProviders[message.origin]) return { ok: true, action: 'ignore', method: 'federated' };
      if (preferences.passkeyOrigins.includes(message.origin)) {
        return { ok: true, action: message.type === MESSAGE_TYPES.autofillDetected ? 'ignore' : 'submit', method: 'passkey' };
      }
      return { ok: true, action: 'submit' };
    }

    if (message.type === MESSAGE_TYPES.getLoginPolicy) return { ok: true, action: 'ignore' };

    await notifySiteDetected(effects, { origin: message.origin,
      ...(message.type === MESSAGE_TYPES.passwordUsed ? { passwordUsed: true as const } : {}) });
    return { ok: true, action: 'pending' };
  }

  if (message.type === MESSAGE_TYPES.getPopupState) {
    return getPopupState(message.currentOrigin);
  }

  const origin = normalizeOrigin(message.origin);
  if (!origin) {
    return { ok: false, error: 'invalidOrigin' };
  }

  const registration = await getRegistrationState();
  const { registeredOrigins: origins, passkeyOrigins, passkeyFrameOrigins: frames, federatedProviders } = registration;

  if (message.type === MESSAGE_TYPES.registerOrigin) {
    const savedMethod = passkeyOrigins.includes(origin) ? 'passkey' : federatedProviders[origin] ? 'federated' : 'password';
    if (origins.includes(origin) && message.method !== undefined && (message.method !== savedMethod ||
      (message.method === 'federated' && message.provider !== federatedProviders[origin]))) {
      return { ok: false, error: 'reregisterToChangeMethod' };
    }
    if (message.method === 'passkey' && !isSecureLoginOrigin(origin)) return { ok: false, error: 'passkeyHttpsOnly' };
    if (message.method === 'federated' && !isSecureLoginOrigin(origin)) return { ok: false, error: 'federatedHttpsOnly' };
    const pendingSite = await getPendingSite();
    if (message.authenticationOrigin !== undefined) {
      const cached = [...passkeyTargets.values()].some((target) => target.siteOrigin === origin &&
        target.authenticationOrigin === message.authenticationOrigin && Date.now() - target.seenAt <= 15000 &&
        (message.tabId === undefined || target.tabId === message.tabId));
      if (!isSecureLoginOrigin(message.authenticationOrigin) ||
        (!(pendingSite?.origin === origin && pendingSite.authenticationOrigin === message.authenticationOrigin) && !cached)) {
        return { ok: false, error: 'reloadLoginPage' };
      }
    }
    if (message.method !== undefined) {
      registration.passkeyOrigins = message.method === 'passkey'
        ? [...passkeyOrigins, origin] : passkeyOrigins.filter((saved) => saved !== origin);
      if (message.authenticationOrigin) frames[origin] = message.authenticationOrigin;
      else delete frames[origin];
      if (message.method === 'federated' && message.provider) federatedProviders[origin] = message.provider;
      else delete federatedProviders[origin];
    }
    registration.registeredOrigins = [...origins, origin];
    const saved = await setRegistrationState(registration);
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

    return popupState(message.currentOrigin === undefined ? origin : message.currentOrigin, saved,
      pendingSite?.origin === origin ? null : pendingSite);
  }

  if (message.type === MESSAGE_TYPES.removeOrigin) {
    registration.registeredOrigins = origins.filter((saved) => saved !== origin);
    registration.passkeyOrigins = passkeyOrigins.filter((saved) => saved !== origin);
    delete federatedProviders[origin];
    delete frames[origin];
    const pendingSite = await getPendingSite();
    const saved = await setRegistrationState(registration);
    return popupState(message.currentOrigin === undefined ? origin : message.currentOrigin, saved, pendingSite);
  }

  return { ok: false, error: 'unsupportedMessage' };
}

export default defineBackground(() => {
  passkeyTargets.clear();
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isRuntimeMessage(message)) {
      return false;
    }

    const changesState = message.type === MESSAGE_TYPES.registerOrigin || message.type === MESSAGE_TYPES.removeOrigin ||
      message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.passwordUsed || message.type === MESSAGE_TYPES.passkeyDetected || message.type === MESSAGE_TYPES.passkeyUsed ||
      message.type === MESSAGE_TYPES.federatedDetected || message.type === MESSAGE_TYPES.federatedUsed;
    const effects: Effect[] = [];
    void (changesState ? mutateState(() => handleMessage(message, sender, effects)) : handleMessage(message, sender, effects))
      .then(async (response) => {
        const returnsState = message.type === MESSAGE_TYPES.registerOrigin || message.type === MESSAGE_TYPES.removeOrigin;
        // Return persisted state before a page can wait for Chrome's chooser.
        if (returnsState) sendResponse(response);
        // UI/page failures never roll back or misreport persisted preferences.
        await Promise.allSettled(effects.map((effect) => effect()));
        if (!returnsState) sendResponse(response);
      })
      .catch(() => sendResponse({ ok: false, error: 'processingFailed' }));

    return true;
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== NOTIFICATION_ID) {
      return;
    }

    void browser.notifications.clear(NOTIFICATION_ID);
  });
});
