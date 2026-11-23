// Layout for the live screen (game size + displayed CSS size + safe area + device kind).
import type Phaser from 'phaser';
import { type Layout, computeLayout } from '../layout';
import { getServices } from '../services';

export function currentLayout(scene: Phaser.Scene): Layout {
  const sv = getServices();
  const width = scene.scale.width;
  const height = scene.scale.height;
  const cssWidth = scene.scale.displaySize.width > 0 ? scene.scale.displaySize.width : width;
  return computeLayout({ width, height, cssWidth, safe: sv.readSafeArea(), touch: sv.isTouch() });
}

/** Calls `fn` (debounced) whenever the game is resized; unsubscribes on scene shutdown. */
export function onResize(scene: Phaser.Scene, fn: () => void, debounceMs = 90): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handler = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (scene.sys.isActive() || scene.sys.isPaused()) fn();
    }, debounceMs);
  };
  scene.scale.on('resize', handler);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', handler);
    if (timer) clearTimeout(timer);
  });
}
