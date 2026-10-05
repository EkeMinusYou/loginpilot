import { describe, expect, it } from 'vitest';
import type { Browser } from 'wxt/browser';
import { MESSAGE_TYPES, type RuntimeMessage } from './messages';
import { isAuthorizedRuntimeMessage, isContentMessage, isRuntimeMessage } from './message-validation';

const extensionId = 'test-extension';
const popupUrl = `chrome-extension://${extensionId}/popup.html`;
const popup = { id: extensionId, url: popupUrl };
const content = { id: extensionId, url: 'https://example.com/login', tab: { id: 1 }, frameId: 0 };
const origin = 'https://example.com';

function authorized(message: RuntimeMessage, sender: object): boolean {
  return isAuthorizedRuntimeMessage(message, sender as Browser.runtime.MessageSender, extensionId, popupUrl);
}

describe('runtime message validation', () => {
  it.each([
    { type: MESSAGE_TYPES.autofillDetected, origin },
    { type: MESSAGE_TYPES.getLoginPolicy, origin },
    { type: MESSAGE_TYPES.getPopupState, currentOrigin: null },
    { type: MESSAGE_TYPES.getPopupState, currentOrigin: origin },
    { type: MESSAGE_TYPES.registerOrigin, origin },
    { type: MESSAGE_TYPES.registerOrigin, origin, tabId: 1 },
    { type: MESSAGE_TYPES.removeOrigin, origin },
    { type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: 1 },
  ])('accepts a supported message (%j)', (message) => {
    expect(isRuntimeMessage(message)).toBe(true);
  });

  it.each([
    null, [], 'register-origin', {}, { type: 'unknown', origin },
    { type: MESSAGE_TYPES.registerOrigin },
    { type: MESSAGE_TYPES.registerOrigin, origin: 1 },
    { type: MESSAGE_TYPES.registerOrigin, origin: 'https://example.com/login' },
    { type: MESSAGE_TYPES.registerOrigin, origin: 'javascript:alert(1)' },
    { type: MESSAGE_TYPES.registerOrigin, origin, tabId: '1' },
    { type: MESSAGE_TYPES.registerOrigin, origin, tabId: -1 },
    { type: MESSAGE_TYPES.registerOrigin, origin, tabId: 0.5 },
    { type: MESSAGE_TYPES.enableCredentialLogin, origin },
    { type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: Infinity },
    { type: MESSAGE_TYPES.getPopupState },
    { type: MESSAGE_TYPES.getPopupState, currentOrigin: 'chrome://settings' },
  ])('rejects malformed or unsupported messages (%j)', (message) => {
    expect(isRuntimeMessage(message)).toBe(false);
  });

  it.each([
    { type: MESSAGE_TYPES.getPopupState, currentOrigin: origin },
    { type: MESSAGE_TYPES.registerOrigin, origin },
    { type: MESSAGE_TYPES.removeOrigin, origin },
    { type: MESSAGE_TYPES.enableCredentialLogin, origin, tabId: 1 },
  ] as RuntimeMessage[])('restricts popup operations to the extension popup (%j)', (message) => {
    expect(authorized(message, popup)).toBe(true);
    expect(authorized(message, content)).toBe(false);
    expect(authorized(message, { ...popup, id: 'another-extension' })).toBe(false);
    expect(authorized(message, { ...popup, url: `${popupUrl}?forged` })).toBe(false);
  });

  it.each([MESSAGE_TYPES.autofillDetected, MESSAGE_TYPES.getLoginPolicy])(
    'restricts %s to a matching top-level content script', (type) => {
      const message = { type, origin };
      expect(authorized(message, content)).toBe(true);
      expect(authorized(message, popup)).toBe(false);
      expect(authorized(message, { ...content, url: 'https://other.example' })).toBe(false);
      expect(authorized(message, { ...content, frameId: 1 })).toBe(false);
      expect(authorized(message, { ...content, id: 'another-extension' })).toBe(false);
      expect(authorized(message, { ...content, tab: undefined })).toBe(false);
      expect(authorized(message, { ...content, url: undefined })).toBe(false);
    },
  );
});

describe('content message validation', () => {
  it('accepts background commands with a canonical origin', () => {
    expect(isContentMessage({ type: MESSAGE_TYPES.siteRegistered, origin })).toBe(true);
    expect(isContentMessage({ type: MESSAGE_TYPES.enableCredentialLogin, origin })).toBe(true);
  });
  it('rejects arbitrary operations and malformed origins', () => {
    expect(isContentMessage({ type: MESSAGE_TYPES.registerOrigin, origin })).toBe(false);
    expect(isContentMessage({ type: MESSAGE_TYPES.siteRegistered, origin: null })).toBe(false);
    expect(isContentMessage({ type: MESSAGE_TYPES.siteRegistered, origin: `${origin}/login` })).toBe(false);
  });
});
