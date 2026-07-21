export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function isHttpOrigin(value: string): boolean {
  return normalizeOrigin(value) !== null;
}
