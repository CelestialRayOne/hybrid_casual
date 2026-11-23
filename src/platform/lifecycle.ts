// Page lifecycle helper. The game decides what to do (pause, gameplayStop, resume); this only reports changes.

export interface VisibilityOptions {
  /**
   * Also treat window blur as "hidden" (default false). The CrazyGames docs (https://docs.crazygames.com/sdk/game/,
   * checked 2026-11-20) say of gameplayStop: "Don't call this event when the user switches focus or leaves the game
   * area (we handle this on our side)." So focus loss must not drive `gameplayStop`; only opt in for local pausing.
   */
  includeFocus?: boolean;
  /** Override for tests. Default: the global `document` / `window`. */
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> & { hasFocus?: () => boolean };
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Calls `cb(visible)` whenever the page goes from visible to hidden or back (only on changes).
 * Returns an unsubscribe function. A no-op outside the browser.
 */
export function onVisibilityChange(cb: (visible: boolean) => void, opts: VisibilityOptions = {}): () => void {
  const doc = opts.doc ?? (typeof document !== 'undefined' ? document : undefined);
  const win = opts.win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!doc) return () => {};
  const includeFocus = opts.includeFocus ?? false;

  let focused = true;
  try {
    focused = doc.hasFocus ? doc.hasFocus() : true;
  } catch {
    focused = true;
  }
  const isVisible = () => doc.visibilityState !== 'hidden' && (!includeFocus || focused);
  let last = isVisible();

  const update = () => {
    const now = isVisible();
    if (now === last) return;
    last = now;
    cb(now);
  };
  const onBlur = () => { focused = false; update(); };
  const onFocus = () => { focused = true; update(); };

  doc.addEventListener('visibilitychange', update);
  if (includeFocus && win) {
    win.addEventListener('blur', onBlur);
    win.addEventListener('focus', onFocus);
  }
  return () => {
    doc.removeEventListener('visibilitychange', update);
    if (includeFocus && win) {
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focus', onFocus);
    }
  };
}
