/**
 * Minimal synchronous key/value storage shape. `window.localStorage`, the CrazyGames SDK Data module
 * (`SDK.data`: getItem/setItem/removeItem, synchronous) and simple test fakes all satisfy it.
 */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Returns `window.localStorage` if it exists and is usable, otherwise `null`.
 * Merely touching `localStorage` can throw (sandboxed iframe with third-party storage blocked,
 * some private modes), so the probe is wrapped. This is the only place outside tests that
 * names `localStorage`; game code gets storage through `SaveStore` / telemetry.
 */
export function safeLocalStorage(): KeyValue | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValue }).localStorage;
    if (!ls) return null;
    const probe = '__gemdig_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
