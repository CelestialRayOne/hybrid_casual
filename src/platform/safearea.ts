export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

function px(v: string | undefined): number {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Safe-area insets in CSS px, read from the computed position of `#safe-probe` (index.html), whose edges are set
 * from CrazyGames' `--safe-area-inset-*` variables with an `env(safe-area-inset-*)` fallback.
 * Returns zeros when the element, the DOM or computed styles are unavailable. Call again on every resize.
 */
export function readSafeArea(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): SafeArea {
  try {
    const el = doc?.getElementById('safe-probe');
    const view = doc?.defaultView;
    if (!el || !view) return { ...ZERO };
    const cs = view.getComputedStyle(el);
    return { top: px(cs.top), right: px(cs.right), bottom: px(cs.bottom), left: px(cs.left) };
  } catch {
    return { ...ZERO };
  }
}
