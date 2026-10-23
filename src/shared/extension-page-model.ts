import { browser } from 'wxt/browser';
import { MESSAGE_TYPES, type PopupResponse, type PopupState, type RuntimeMessage } from './messages';
import type { MessageKey } from './i18n';
import { normalizeOrigin } from './origins';

export interface Feedback {
  kind: 'success' | 'error';
  context: 'register' | 'remove' | 'load' | 'preferences';
  key: MessageKey;
}

class ExtensionPageError extends Error {
  constructor(readonly key: MessageKey) { super(key); }
}

export class ExtensionPageModel {
  state: PopupState = { autoLoginPaused: false, excludedOrigins: [], registeredOrigins: [], passkeyOrigins: [], passkeyFrameOrigins: {}, federatedProviders: {}, pendingSite: null, currentOrigin: null };
  isLoading = true;
  hasLoaded = false;
  action: { type: 'register' | 'remove' | 'pause' | 'exclude' | 'restore'; origin?: string } | null = null;
  feedback: Feedback | null = null;

  constructor(private readonly changed: () => void, private readonly page: 'popup' | 'options' = 'popup') {}

  private apply(response: PopupResponse): void {
    if (!response.ok) throw new ExtensionPageError(response.error);
    const { ok: _ok, ...state } = response;
    this.state = { ...state, autoLoginPaused: state.autoLoginPaused ?? false, excludedOrigins: state.excludedOrigins ?? [], federatedProviders: state.federatedProviders ?? {} };
    this.hasLoaded = true;
  }

  async load(): Promise<void> {
    try {
      const message = this.page === 'options' ? { type: MESSAGE_TYPES.getSettingsState }
        : { type: MESSAGE_TYPES.getPopupState, currentOrigin: await this.currentOrigin() };
      this.apply(await browser.runtime.sendMessage(message) as PopupResponse);
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
    this.feedback = { kind: 'error', context, key: error instanceof ExtensionPageError ? error.key : fallback };
  }

  async register(candidate = this.state.pendingSite): Promise<void> {
    if (this.page === 'options' || this.action || !candidate) return;
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
        ...(candidate.provider ? { provider: candidate.provider } : {}),
        ...(candidate.authenticationOrigin ? { authenticationOrigin: candidate.authenticationOrigin } : {}),
        ...(matchesCurrentSite && !candidate.passwordUsed && !candidate.passkeyUsed && !candidate.federatedUsed && tab?.id !== undefined ? { tabId: tab.id } : {}),
      }) as PopupResponse);
      this.feedback = { kind: 'success', context: 'register',
        key: this.state.autoLoginPaused ? 'registeredPaused' : matchesCurrentSite && !candidate.passwordUsed && !candidate.passkeyUsed && !candidate.federatedUsed ? 'registeredCurrent' : 'registeredNext' };
    } catch (error) {
      this.fail(error, 'register', 'registerFailed');
    } finally {
      this.action = null;
      this.changed();
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.updatePreferences({ type: MESSAGE_TYPES.setAutoLoginPaused, paused, currentOrigin: this.state.currentOrigin },
      'pause', paused ? 'pausedSaved' : 'resumedSaved');
  }

  async excludeCandidate(): Promise<void> {
    if (this.page !== 'popup' || !this.state.pendingSite) return;
    await this.updatePreferences({ type: MESSAGE_TYPES.excludeOrigin, origin: this.state.pendingSite.origin, currentOrigin: this.state.currentOrigin },
      'exclude', 'excludedSaved');
  }

  async restore(origin: string): Promise<void> {
    if (this.page !== 'options') return;
    await this.updatePreferences({ type: MESSAGE_TYPES.restoreOrigin, origin }, 'restore', 'restoredSaved');
  }

  private async updatePreferences(message: RuntimeMessage, type: 'pause' | 'exclude' | 'restore', key: MessageKey): Promise<void> {
    if (this.action) return;
    this.action = { type };
    this.feedback = null;
    this.changed();
    try {
      this.apply(await browser.runtime.sendMessage(message) as PopupResponse);
      this.feedback = { kind: 'success', context: 'preferences', key };
    } catch (error) {
      this.fail(error, 'preferences', 'preferencesSaveFailed');
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
