import { browser } from 'wxt/browser';
import type { PendingSite } from './messages';
import { normalizeOrigin } from './origins';

const REGISTERED_ORIGINS_KEY = 'registeredOrigins';
const PENDING_SITE_KEY = 'pendingSite';
const PASSKEY_ORIGINS_KEY = 'passkeyOrigins';
const PASSKEY_FRAME_ORIGINS_KEY = 'passkeyFrameOrigins';

interface StoredState {
  registeredOrigins?: unknown;
  pendingSite?: unknown;
  passkeyOrigins?: unknown;
  passkeyFrameOrigins?: unknown;
}

export interface RegistrationState {
  registeredOrigins: string[];
  passkeyOrigins: string[];
  passkeyFrameOrigins: Record<string, string>;
}

function origins(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((origin): origin is string =>
    typeof origin === 'string' && normalizeOrigin(origin) === origin,
  ))].sort() : [];
}

function frameOrigins(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([site, frame]) =>
    normalizeOrigin(site) === site && typeof frame === 'string' && normalizeOrigin(frame) === frame,
  ));
}

export async function getRegistrationState(): Promise<RegistrationState> {
  const state = await browser.storage.local.get([REGISTERED_ORIGINS_KEY, PASSKEY_ORIGINS_KEY, PASSKEY_FRAME_ORIGINS_KEY]) as StoredState;
  const registeredOrigins = origins(state.registeredOrigins);
  const passkeyOrigins = origins(state.passkeyOrigins).filter((origin) => registeredOrigins.includes(origin));
  return { registeredOrigins, passkeyOrigins,
    passkeyFrameOrigins: Object.fromEntries(Object.entries(frameOrigins(state.passkeyFrameOrigins))
      .filter(([site]) => passkeyOrigins.includes(site))) };
}

/** Publish origin, method, and frame approval in one storage operation. */
export async function setRegistrationState(state: RegistrationState): Promise<RegistrationState> {
  const saved = { ...state,
    registeredOrigins: [...new Set(state.registeredOrigins)].sort(),
    passkeyOrigins: [...new Set(state.passkeyOrigins)].sort(),
  };
  await browser.storage.local.set(saved);
  return saved;
}

export async function getPendingSite(): Promise<PendingSite | null> {
  const state = (await browser.storage.local.get(PENDING_SITE_KEY)) as StoredState;

  if (!state.pendingSite || typeof state.pendingSite !== 'object') {
    return null;
  }

  const pendingSite = state.pendingSite as Partial<PendingSite>;

  if (typeof pendingSite.origin !== 'string' || normalizeOrigin(pendingSite.origin) !== pendingSite.origin ||
      typeof pendingSite.detectedAt !== 'number' || !Number.isFinite(pendingSite.detectedAt) || pendingSite.detectedAt < 0) {
    return null;
  }

  return {
    origin: pendingSite.origin,
    detectedAt: pendingSite.detectedAt,
    ...(pendingSite.method === 'passkey' ? { method: 'passkey' as const } : {}),
    ...(pendingSite.method === 'passkey' && pendingSite.passkeyUsed === true ? { passkeyUsed: true as const } : {}),
    ...(pendingSite.method === 'passkey' && typeof pendingSite.authenticationOrigin === 'string' &&
      normalizeOrigin(pendingSite.authenticationOrigin) === pendingSite.authenticationOrigin
      ? { authenticationOrigin: pendingSite.authenticationOrigin } : {}),
  };
}

export async function setPendingSite(pendingSite: PendingSite): Promise<void> {
  await browser.storage.local.set({ [PENDING_SITE_KEY]: pendingSite });
}

export async function clearPendingSite(): Promise<void> {
  await browser.storage.local.remove(PENDING_SITE_KEY);
}
