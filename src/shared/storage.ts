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

export async function getRegisteredOrigins(): Promise<string[]> {
  const state = (await browser.storage.local.get(REGISTERED_ORIGINS_KEY)) as StoredState;

  if (!Array.isArray(state.registeredOrigins)) {
    return [];
  }

  return [...new Set(state.registeredOrigins.filter((origin): origin is string =>
    typeof origin === 'string' && normalizeOrigin(origin) === origin,
  ))].sort();
}

export async function setRegisteredOrigins(origins: string[]): Promise<void> {
  await browser.storage.local.set({
    [REGISTERED_ORIGINS_KEY]: [...new Set(origins)].sort(),
  });
}

export async function getPasskeyOrigins(): Promise<string[]> {
  const state = (await browser.storage.local.get(PASSKEY_ORIGINS_KEY)) as StoredState;
  if (!Array.isArray(state.passkeyOrigins)) return [];
  return [...new Set(state.passkeyOrigins.filter((origin): origin is string =>
    typeof origin === 'string' && normalizeOrigin(origin) === origin,
  ))].sort();
}

export async function setPasskeyOrigins(origins: string[]): Promise<void> {
  await browser.storage.local.set({ [PASSKEY_ORIGINS_KEY]: [...new Set(origins)].sort() });
}

export async function getPasskeyFrameOrigins(): Promise<Record<string, string>> {
  const state = (await browser.storage.local.get(PASSKEY_FRAME_ORIGINS_KEY)) as StoredState;
  const value = state.passkeyFrameOrigins;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([site, frame]) =>
    normalizeOrigin(site) === site && typeof frame === 'string' && normalizeOrigin(frame) === frame,
  ));
}

export async function setPasskeyFrameOrigins(origins: Record<string, string>): Promise<void> {
  await browser.storage.local.set({ [PASSKEY_FRAME_ORIGINS_KEY]: origins });
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
