export function isControlAvailable(control: HTMLElement): boolean {
  if (!control.isConnected || control.matches(':disabled, [disabled], [aria-disabled="true"]') ||
    control.closest('[hidden], [inert], [aria-hidden="true"]') || control.getClientRects().length === 0) return false;
  for (let node: HTMLElement | null = control; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle?.(node);
    if (style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0') return false;
  }
  return true;
}
