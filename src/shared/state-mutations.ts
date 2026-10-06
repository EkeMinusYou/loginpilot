import type { PendingSite } from './messages';

/** Read and write inside the queue; a rejected operation must not block later work. */
export function createMutationQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
}

export function shouldReplaceCandidate(current: PendingSite | null, next: PendingSite): boolean {
  if (current?.origin !== next.origin || !current.passkeyUsed) return true;
  // A completed use outranks autofill and button hints on the same site.
  // A different authentication pair still needs its own review.
  return next.method === 'passkey' && current.authenticationOrigin !== next.authenticationOrigin;
}
