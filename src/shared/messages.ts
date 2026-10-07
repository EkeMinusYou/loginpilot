import type { FederatedProvider } from './federated-providers';

export const MESSAGE_TYPES = {
  autofillDetected: 'autofill-detected',
  passwordUsed: 'password-used',
  getPopupState: 'get-popup-state',
  registerOrigin: 'register-origin',
  removeOrigin: 'remove-origin',
  siteRegistered: 'site-registered',
  getLoginPolicy: 'get-login-policy',
  passkeyDetected: 'passkey-detected',
  passkeyUsed: 'passkey-used',
  startPasskeyLogin: 'start-passkey-login',
  getPasskeyPolicy: 'get-passkey-policy',
  checkPasskeyFrame: 'check-passkey-frame',
  federatedDetected: 'federated-detected',
  federatedUsed: 'federated-used',
  getFederatedPolicy: 'get-federated-policy',
} as const;

export type LoginMethod = 'password' | 'passkey' | 'federated';

export type ErrorCode =
  | 'operationNotAllowed' | 'invalidOrigin' | 'reregisterToChangeMethod'
  | 'passkeyHttpsOnly' | 'reloadLoginPage' | 'unsupportedMessage'
  | 'processingFailed' | 'loginFieldsRequired' | 'passkeyUnavailable'
  | 'federatedHttpsOnly' | 'federatedUnavailable';

export type ErrorResponse = { ok: false; error: ErrorCode };

export type RuntimeMessage =
  | { type: typeof MESSAGE_TYPES.passwordUsed; origin: string }
  | { type: typeof MESSAGE_TYPES.federatedDetected | typeof MESSAGE_TYPES.federatedUsed; origin: string; provider: FederatedProvider }
  | { type: typeof MESSAGE_TYPES.getFederatedPolicy; origin: string }
  | { type: typeof MESSAGE_TYPES.passkeyDetected; origin: string }
  | { type: typeof MESSAGE_TYPES.passkeyUsed; origin: string }
  | { type: typeof MESSAGE_TYPES.getPasskeyPolicy; origin: string }
  | {
      type: typeof MESSAGE_TYPES.getLoginPolicy;
      origin: string;
    }
  | {
      type: typeof MESSAGE_TYPES.autofillDetected;
      origin: string;
    }
  | {
      type: typeof MESSAGE_TYPES.getPopupState;
      currentOrigin: string | null;
    }
  | {
      type: typeof MESSAGE_TYPES.registerOrigin;
      origin: string;
      tabId?: number;
      method?: LoginMethod;
      provider?: FederatedProvider;
      authenticationOrigin?: string;
      currentOrigin?: string | null;
    }
  | {
      type: typeof MESSAGE_TYPES.removeOrigin;
      origin: string;
      currentOrigin?: string | null;
    };

export type ContentMessage = {
  type: typeof MESSAGE_TYPES.siteRegistered | typeof MESSAGE_TYPES.startPasskeyLogin;
  origin: string;
} | { type: typeof MESSAGE_TYPES.checkPasskeyFrame; origin?: string; authenticationOrigin: string };

export type PasskeyFrameResponse = { ok: true; visible: boolean; origin?: string } | ErrorResponse;

export type CredentialSetupResponse = { ok: true; filled: boolean } | ErrorResponse;

export type AutofillResponse =
  | { ok: true; action: 'submit' | 'ignore' | 'pending'; method?: LoginMethod; provider?: FederatedProvider; retry?: true }
  | ErrorResponse;

export interface PendingSite {
  origin: string;
  detectedAt: number;
  method?: LoginMethod;
  authenticationOrigin?: string;
  passkeyUsed?: true;
  passwordUsed?: true;
  provider?: FederatedProvider;
  federatedUsed?: true;
}

export interface PopupState {
  registeredOrigins: string[];
  passkeyOrigins: string[];
  passkeyFrameOrigins: Record<string, string>;
  federatedProviders: Record<string, FederatedProvider>;
  pendingSite: PendingSite | null;
  currentOrigin: string | null;
}

export type PopupResponse =
  | ({ ok: true } & PopupState)
  | ErrorResponse;
