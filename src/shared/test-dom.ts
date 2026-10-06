import { parseHTML } from 'linkedom';

/** Supply the layout/form properties absent from linkedom, without mocking detection. */
export function loginPage(markup: string) {
  const window = parseHTML(`<html><body>${markup}</body></html>`);
  window.top = window;
  for (const node of window.document.querySelectorAll<HTMLInputElement>('input')) {
    Object.defineProperties(node, {
      form: { get: () => node.closest('form') },
      autocomplete: { get: () => node.getAttribute('autocomplete') ?? '' },
      readOnly: { get: () => node.hasAttribute('readonly') },
    });
  }
  for (const node of window.document.querySelectorAll('input, button, form')) {
    Object.defineProperty(node, 'getClientRects', { configurable: true, value: () => [{}] });
  }
  Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: 'visible' });
  return window;
}
