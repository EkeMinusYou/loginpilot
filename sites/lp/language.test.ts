import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';

let document: Document;
let event: typeof Event;
const location = { pathname: '/', search: '?source=test', hash: '#start', replace: vi.fn() };
const storage = { getItem: vi.fn(), setItem: vi.fn() };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.getItem.mockReset().mockReturnValue(null);
  location.pathname = '/';
  const window = parseHTML('<html><body><a data-language="ja" href="/ja/">日本語</a><a data-language="en" href="/en/">English</a></body></html>');
  document = window.document;
  event = window.Event;
  vi.stubGlobal('document', document);
  vi.stubGlobal('location', location);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { languages: ['en-US'] });
});
afterEach(() => vi.unstubAllGlobals());

describe('landing page language navigation', () => {
  it('detects the browser language at the root and preserves query parameters and anchors', async () => {
    await import('./language');
    expect(location.replace).toHaveBeenCalledWith('/en/?source=test#start');
  });

  it('uses a saved manual selection before the browser language', async () => {
    storage.getItem.mockReturnValue('ja');
    await import('./language');
    expect(location.replace).toHaveBeenCalledWith('/ja/?source=test#start');
  });

  it('respects an explicit locale URL and saves a language selected through its link', async () => {
    location.pathname = '/en/';
    storage.getItem.mockReturnValue('ja');
    await import('./language');
    expect(location.replace).not.toHaveBeenCalled();
    const link = document.querySelector('a[data-language="ja"]')!;
    expect(link.getAttribute('href')).toBe('/ja/#start');
    link.dispatchEvent(new event('click'));
    expect(storage.setItem).toHaveBeenCalledWith('loginpilot.lp.language', 'ja');
  });

  it('still detects language and provides working links when storage is unavailable', async () => {
    storage.getItem.mockImplementation(() => { throw new Error('Storage blocked'); });
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage blocked'); });
    vi.stubGlobal('navigator', { languages: ['ja-JP'] });
    await import('./language');
    expect(location.replace).toHaveBeenCalledWith('/ja/?source=test#start');
    expect(() => document.querySelector('[data-language="en"]')!.dispatchEvent(new event('click'))).not.toThrow();
    expect(document.querySelector('[data-language="en"]')!.getAttribute('href')).toBe('/en/#start');
  });
});
