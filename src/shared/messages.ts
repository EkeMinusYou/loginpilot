export const MESSAGE_TYPES = {
  autofillDetected: 'autofill-detected',
  prepareAutofill: 'prepare-autofill',
  getPopupState: 'get-popup-state',
  registerOrigin: 'register-origin',
  removeOrigin: 'remove-origin',
  siteRegistered: 'site-registered',
} as const;

export type RuntimeMessage =
  | {
      type: typeof MESSAGE_TYPES.autofillDetected;
      origin: string;
    }
  | {
      type: typeof MESSAGE_TYPES.prepareAutofill;
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
  type: typeof MESSAGE_TYPES.siteRegistered;
  origin: string;
};

export type AutofillResponse =
  | { ok: true; action: 'submit' | 'ignore' | 'pending' }
  | { ok: false; error: string };

export type PrepareAutofillResponse = { ok: true; registered: boolean } | { ok: false; error: string };

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
