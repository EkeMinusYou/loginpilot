import { browser } from 'wxt/browser';
import { MESSAGE_TYPES, type PopupResponse, type PopupState } from '../../shared/messages';
import type { MessageKey } from '../../shared/i18n';
import { normalizeOrigin } from '../../shared/origins';

export interface Feedback {
  kind: 'success' | 'error';
  context: 'register' | 'remove' | 'load';
  key: MessageKey;
}

export class PopupError extends Error {
  constructor(readonly key: MessageKey) { super(key); }
}

export class PopupModel {
  state: PopupState = { registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {}, pendingSite: null, currentOrigin: null };
  isLoading = true;
  hasLoaded = false;
  action: { type: 'register' | 'remove'; origin: string } | null = null;
  feedback: Feedback | null = null;

  constructor(private readonly changed: () => void) {}

  private apply(response: PopupResponse): void {
    if (!response.ok) throw new PopupError(response.error);
    const { ok: _ok, ...state } = response;
    this.state = state;
    this.hasLoaded = true;
  }

  async load(): Promise<void> {
    try {
      const currentOrigin = await this.currentOrigin();
      this.apply(await browser.runtime.sendMessage({ type: MESSAGE_TYPES.getPopupState, currentOrigin }) as PopupResponse);
    } catch (error) {
      this.fail(error, 'load', 'loadFailed');
    } finally {
      this.isLoading = false;
      this.changed();
    }
  }

  private async currentOrigin(): Promise<string | null> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.url ? normalizeOrigin(tab.url) : null;
  }

  private fail(error: unknown, context: Feedback['context'], fallback: MessageKey): void {
    this.feedback = { kind: 'error', context, key: error instanceof PopupError ? error.key : fallback };
  }

  async register(candidate = this.state.pendingSite): Promise<void> {
    if (this.action || !candidate) return;
    this.action = { type: 'register', origin: candidate.origin };
    this.feedback = null;
    this.changed();
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const currentOrigin = tab?.url ? normalizeOrigin(tab.url) : null;
      const matchesCurrentSite = currentOrigin === candidate.origin;
      this.apply(await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.registerOrigin,
        origin: candidate.origin,
        currentOrigin,
        method: candidate.method ?? 'password',
        ...(candidate.authenticationOrigin ? { authenticationOrigin: candidate.authenticationOrigin } : {}),
        ...(matchesCurrentSite && !candidate.passkeyUsed && tab?.id !== undefined ? { tabId: tab.id } : {}),
      }) as PopupResponse);
      this.feedback = { kind: 'success', context: 'register',
        key: matchesCurrentSite && !candidate.passkeyUsed ? 'registeredCurrent' : 'registeredNext' };
    } catch (error) {
      this.fail(error, 'register', 'registerFailed');
    } finally {
      this.action = null;
      this.changed();
    }
  }

  async remove(origin: string): Promise<void> {
    if (this.action) return;
    this.action = { type: 'remove', origin };
    this.feedback = null;
    this.changed();
    try {
      this.apply(await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.removeOrigin, origin, currentOrigin: this.state.currentOrigin,
      }) as PopupResponse);
      this.feedback = { kind: 'success', context: 'remove', key: 'removed' };
    } catch (error) {
      this.fail(error, 'remove', 'removeFailed');
    } finally {
      this.action = null;
      this.changed();
    }
  }
}
