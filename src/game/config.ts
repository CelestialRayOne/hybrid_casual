// Game-wide constants for the view layer. Pure (no Phaser), so tests can import it.

/** Placeholder title. The final name is decided at the end (CLAUDE.md); change it only here. */
export const GAME_TITLE = 'Gem Dig';

/**
 * Logical base for `Scale.EXPAND`. 720x1280 is a 9:16 portrait base that is exactly 2x a 360-CSS-px phone,
 * so typical phones render the canvas at ~1.8-2 game px per CSS px (crisp at a sane fill rate for mid phones),
 * and a 1080p desktop at ~1.2x. EXPAND grows the short dimension to the parent's aspect, so all layout is
 * computed from the live game size (see layout.ts), never from these numbers.
 */
export const BASE_WIDTH = 720;
export const BASE_HEIGHT = 1280;

/** Page background (matches index.html). */
export const PAGE_BG = '#3a2418';

/** Minimum on-screen cell size in CSS px (CLAUDE.md "Screen layout"). */
export const MIN_CELL_CSS_TOUCH = 40;
export const MIN_CELL_CSS_DESKTOP = 32;
/** Cap so huge monitors don't get a gigantic board. */
export const MAX_CELL_CSS = 96;
/** Minimum touch target (CSS px) for buttons on touch devices. */
export const MIN_TOUCH_TARGET_CSS = 44;

/** Long-press duration for the Alchemist transmute (ms) and when its progress ring appears. */
export const LONG_PRESS_MS = 450;
export const LONG_PRESS_RING_DELAY_MS = 140;

/** Feature flags from the URL. `debug` enables the telemetry overlay, debug keys and the test hook. */
export interface UrlFlags {
  debug: boolean;
}

export function parseFlags(search: string): UrlFlags {
  const p = new URLSearchParams(search);
  const d = p.get('debug');
  return { debug: d === '1' || d === 'true' };
}
