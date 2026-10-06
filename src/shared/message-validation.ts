import type { Browser } from 'wxt/browser';
import { MESSAGE_TYPES, type ContentMessage, type RuntimeMessage } from './messages';
import { normalizeOrigin } from './origins';

function isOrigin(value: unknown): value is string {
  return typeof value === 'string' && normalizeOrigin(value) === value;
}

function isTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === MESSAGE_TYPES.getPopupState) {
    return 'currentOrigin' in value && (value.currentOrigin === null || isOrigin(value.currentOrigin));
  }
  if (!('origin' in value) || !isOrigin(value.origin)) return false;
  switch (value.type) {
    case MESSAGE_TYPES.autofillDetected:
    case MESSAGE_TYPES.passkeyDetected:
    case MESSAGE_TYPES.passkeyUsed:
    case MESSAGE_TYPES.getPasskeyPolicy:
    case MESSAGE_TYPES.getLoginPolicy:
    case MESSAGE_TYPES.removeOrigin:
      return true;
    case MESSAGE_TYPES.registerOrigin:
      return (!('tabId' in value) || value.tabId === undefined || isTabId(value.tabId)) &&
        (!('method' in value) || value.method === undefined || value.method === 'password' || value.method === 'passkey') &&
        (!('authenticationOrigin' in value) || value.authenticationOrigin === undefined ||
          ('method' in value && value.method === 'passkey' && isOrigin(value.authenticationOrigin)));
    case MESSAGE_TYPES.enableCredentialLogin:
    case MESSAGE_TYPES.startPasskeyLogin:
      return 'tabId' in value && isTabId(value.tabId);
    default:
      return false;
  }
}

export function isAuthorizedRuntimeMessage(
  message: RuntimeMessage,
  sender: Browser.runtime.MessageSender,
  extensionId: string,
  popupUrl: string,
): boolean {
  if (sender.id !== extensionId) return false;
  if (message.type === MESSAGE_TYPES.passkeyDetected || message.type === MESSAGE_TYPES.passkeyUsed || message.type === MESSAGE_TYPES.getPasskeyPolicy) {
    return isTabId(sender.tab?.id) && isTabId(sender.frameId) &&
      (sender.documentLifecycle === undefined || sender.documentLifecycle === 'active') &&
      typeof sender.url === 'string' && normalizeOrigin(sender.url) === message.origin;
  }
  if (message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.getLoginPolicy) {
    return isTabId(sender.tab?.id) && sender.frameId === 0 &&
      typeof sender.url === 'string' && normalizeOrigin(sender.url) === message.origin;
  }
  return sender.tab === undefined && sender.url === popupUrl;
}

export function isContentMessage(value: unknown): value is ContentMessage {
  if (value && typeof value === 'object' && 'type' in value && value.type === MESSAGE_TYPES.checkPasskeyFrame) {
    return 'origin' in value && isOrigin(value.origin) && 'authenticationOrigin' in value && isOrigin(value.authenticationOrigin);
  }
  return !!value && typeof value === 'object' && 'type' in value && 'origin' in value &&
    (value.type === MESSAGE_TYPES.siteRegistered || value.type === MESSAGE_TYPES.enableCredentialLogin || value.type === MESSAGE_TYPES.startPasskeyLogin) &&
    isOrigin(value.origin);
}
