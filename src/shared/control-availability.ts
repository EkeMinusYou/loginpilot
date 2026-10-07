export function isControlAvailable(control: HTMLElement): boolean {
  if (!control.isConnected || control.matches(':disabled, [disabled], [aria-disabled="true"]') ||
    control.closest('[hidden], [inert], [aria-hidden="true"]') || control.getClientRects().length === 0) return false;
  for (let node: HTMLElement | null = control; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle?.(node);
    if (style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0') return false;
  }
  return true;
}

export function controlLabel(control: HTMLElement): string {
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy.split(/\s+/).map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (labels) return labels;
  }
  return control.getAttribute('aria-label')?.trim() ||
    (control.tagName === 'INPUT' ? control.getAttribute('value') : control.textContent)?.trim() || '';
}
