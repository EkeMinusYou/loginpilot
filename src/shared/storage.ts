import { browser } from 'wxt/browser';
import type { PendingSite } from './messages';
import { normalizeOrigin } from './origins';

const REGISTERED_ORIGINS_KEY = 'registeredOrigins';
const PENDING_SITE_KEY = 'pendingSite';

interface StoredState {
  registeredOrigins?: unknown;
  pendingSite?: unknown;
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
  };
}

export async function setPendingSite(pendingSite: PendingSite): Promise<void> {
  await browser.storage.local.set({ [PENDING_SITE_KEY]: pendingSite });
}

export async function clearPendingSite(): Promise<void> {
  await browser.storage.local.remove(PENDING_SITE_KEY);
}
