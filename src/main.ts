// Composition root: picks the platform implementations, wires page lifecycle and input hygiene, boots Phaser.
import Phaser from 'phaser';
import {
  createPlatform, localStorageSaveStore, onVisibilityChange, readSafeArea, safeLocalStorage, synthAudio,
} from './platform';
import { createTelemetry } from './telemetry';
import { BASE_HEIGHT, BASE_WIDTH, PAGE_BG, parseFlags } from './game/config';
import { BootScene } from './game/scenes/BootScene';
import { DebugScene } from './game/scenes/DebugScene';
import { LevelEndScene } from './game/scenes/LevelEndScene';
import { LevelSelectScene } from './game/scenes/LevelSelectScene';
import { PerkPickScene } from './game/scenes/PerkPickScene';
import { PerksScene } from './game/scenes/PerksScene';
import { PlayScene } from './game/scenes/PlayScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { ctx, provideServices } from './game/services';
import { installTestHook } from './game/testHook';

const flags = parseFlags(location.search);
const platform = createPlatform();
const audio = synthAudio();
const telemetry = createTelemetry(safeLocalStorage());
const save = localStorageSaveStore();

platform.loadingStart();
void platform.init().then(() => audio.setHostMuted(platform.isMutedByHost()));
platform.onMuteChange((muted) => audio.setHostMuted(muted));

const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
provideServices({
  platform,
  audio,
  save,
  telemetry,
  flags,
  dev: import.meta.env.DEV,
  readSafeArea: () => readSafeArea(),
  isTouch: () => {
    const t = platform.deviceType();
    if (t === 'mobile' || t === 'tablet') return true;
    if (t === 'desktop') return false;
    return coarse?.matches ?? false;
  },
});

// Audio may only start inside a user gesture (iOS); unlock on every gesture, it is cheap after the first.
const unlock = () => audio.unlock();
// Older iOS WebKit only counts touchend / click as a gesture that may start audio, so listen to the release too.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(type, unlock, { capture: true });

// Portal input hygiene: no page scrolling from keys or wheel, no context menu.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'PageUp', 'PageDown']);
window.addEventListener('keydown', (e) => {
  if (SCROLL_KEYS.has(e.key)) e.preventDefault();
}, { passive: false });
window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Lifecycle: gameplayStop when hidden (not on blur, per the CrazyGames docs); flush telemetry.
onVisibilityChange((visible) => {
  if (!visible) {
    platform.gameplayStop();
    telemetry.flush();
    return;
  }
  try {
    if (ctx().inPlay) platform.gameplayStart();
  } catch {
    // Context not ready yet (still booting).
  }
}, { includeFocus: false });
window.addEventListener('pagehide', () => {
  try {
    ctx().onPageHide?.(); // level_quit when the page goes away mid-level
  } catch {
    // Context not ready yet (still booting).
  }
  telemetry.endSession();
});

/**
 * Render-resolution scale for the portrait base: the canvas gets about one pixel per DEVICE pixel, never more
 * than the 720x1280 base. Without this, EXPAND always renders 1280 px tall (a 1280x720 window drew 2275x1280,
 * ~3x the pixels on screen), which made Chrome crawl when it falls back to CPU rendering (no GPU).
 * Layout is size-independent (it works in game px per CSS px), so only sharpness and cost change.
 */
function renderScale(): number {
  const el = document.getElementById('game');
  const cssW = el?.clientWidth || window.innerWidth;
  const cssH = el?.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const fit = Math.min(cssW / BASE_WIDTH, cssH / BASE_HEIGHT) * dpr;
  return Math.min(1, Math.max(0.4, fit));
}
let baseScale = renderScale();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PAGE_BG,
  banner: false,
  disableContextMenu: true,
  // Sound is our own AudioService (no AudioContext before a gesture); Phaser's sound system stays off.
  audio: { noAudio: true },
  input: { activePointers: 2 },
  // antialiasGL = WebGL MSAA: useless for our sprite art and very costly when Chrome renders on the CPU.
  render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance' },
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: Math.round(BASE_WIDTH * baseScale),
    height: Math.round(BASE_HEIGHT * baseScale),
  },
  scene: [BootScene, PlayScene, LevelEndScene, PerkPickScene, PerksScene, LevelSelectScene, SettingsScene, DebugScene],
});

// Keep the render resolution matched to the screen as the window, iframe or device pixel ratio changes.
function updateRenderScale(): void {
  const k = renderScale();
  if (Math.abs(k - baseScale) < 0.02) return;
  baseScale = k;
  const cfg = game.config as unknown as { width: number; height: number };
  cfg.width = Math.round(BASE_WIDTH * k);
  cfg.height = Math.round(BASE_HEIGHT * k);
  game.scale.refresh();
}
window.addEventListener('resize', updateRenderScale);
window.visualViewport?.addEventListener('resize', updateRenderScale);

if (flags.debug || import.meta.env.DEV) installTestHook(game);
