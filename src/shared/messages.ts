export const MESSAGE_TYPES = {
  autofillDetected: 'autofill-detected',
  getPopupState: 'get-popup-state',
  registerOrigin: 'register-origin',
  removeOrigin: 'remove-origin',
  siteRegistered: 'site-registered',
  getLoginPolicy: 'get-login-policy',
  enableCredentialLogin: 'enable-credential-login',
} as const;

export type RuntimeMessage =
  | {
      type: typeof MESSAGE_TYPES.getLoginPolicy;
      origin: string;
    }
  | {
      type: typeof MESSAGE_TYPES.enableCredentialLogin;
      origin: string;
      tabId: number;
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
    }
  | {
      type: typeof MESSAGE_TYPES.removeOrigin;
      origin: string;
    };

export type ContentMessage = {
  type: typeof MESSAGE_TYPES.siteRegistered | typeof MESSAGE_TYPES.enableCredentialLogin;
  origin: string;
};

export type CredentialSetupResponse = { ok: true; filled: boolean } | { ok: false; error: string };

export type AutofillResponse =
  | { ok: true; action: 'submit' | 'ignore' | 'pending' }
  | { ok: false; error: string };

export interface PendingSite {
  origin: string;
  detectedAt: number;
}

export interface PopupState {
  registeredOrigins: string[];
  pendingSite: PendingSite | null;
  currentOrigin: string | null;
}

export type PopupResponse =
  | ({ ok: true } & PopupState)
  | { ok: false; error: string };
