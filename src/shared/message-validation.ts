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
    case MESSAGE_TYPES.getLoginPolicy:
    case MESSAGE_TYPES.removeOrigin:
      return true;
    case MESSAGE_TYPES.registerOrigin:
      return !('tabId' in value) || value.tabId === undefined || isTabId(value.tabId);
    case MESSAGE_TYPES.enableCredentialLogin:
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
  if (message.type === MESSAGE_TYPES.autofillDetected || message.type === MESSAGE_TYPES.getLoginPolicy) {
    return isTabId(sender.tab?.id) && sender.frameId === 0 &&
      typeof sender.url === 'string' && normalizeOrigin(sender.url) === message.origin;
  }
  return sender.tab === undefined && sender.url === popupUrl;
}

export function isContentMessage(value: unknown): value is ContentMessage {
  return !!value && typeof value === 'object' && 'type' in value && 'origin' in value &&
    (value.type === MESSAGE_TYPES.siteRegistered || value.type === MESSAGE_TYPES.enableCredentialLogin) &&
    isOrigin(value.origin);
}
