// Shared view helpers: art registration at the right size, text styles, nine-slice panels and buttons.
import Phaser from 'phaser';
import * as K from '../art/keys';
import { type ArtMetrics, artMetrics, registerTextures } from '../art/textures';
import { UI } from '../art/palette';
import { type Layout, textureCellFor } from '../layout';
import { getServices } from '../services';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Registers (or repaints) the shared art atlas for this layout and returns the texture metrics. */
export function ensureArt(scene: Phaser.Scene, layout: Layout): ArtMetrics {
  const tc = textureCellFor(layout.cell);
  registerTextures(scene, tc);
  return artMetrics(tc);
}

export interface TextOpts {
  color?: string;
  /** Outline for light text over busy backgrounds. Default: on for light text. */
  stroke?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  weight?: 'bold' | 'normal' | '800';
  lineSpacing?: number;
}

export function textStyle(sizePx: number, o: TextOpts = {}): Phaser.Types.GameObjects.Text.TextStyle {
  const color = o.color ?? UI.textLight;
  const stroke = o.stroke ?? color === UI.textLight;
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT,
    fontSize: `${Math.max(8, Math.round(sizePx))}px`,
    fontStyle: o.weight ?? 'bold',
    color,
    align: o.align ?? 'center',
  };
  if (stroke) {
    style.stroke = UI.textShadow;
    style.strokeThickness = Math.max(2, Math.round(sizePx / 6));
  }
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
  if (o.lineSpacing !== undefined) style.lineSpacing = o.lineSpacing;
  return style;
}

export function addText(scene: Phaser.Scene, x: number, y: number, s: string, sizePx: number, o: TextOpts = {}): Phaser.GameObjects.Text {
  return scene.add.text(Math.round(x), Math.round(y), s, textStyle(sizePx, o));
}

/** Shrinks a text object's font until it fits `maxW` (single line). */
export function fitText(t: Phaser.GameObjects.Text, maxW: number, minPx = 10): void {
  let size = parseInt(String(t.style.fontSize), 10) || 16;
  while (t.width > maxW && size > minPx) {
    size -= 1;
    t.setFontSize(size);
    if (t.style.strokeThickness) t.setStroke(UI.textShadow, Math.max(2, Math.round(size / 6)));
  }
}

/**
 * A nine-slice panel of any size. Nine-slice corners are fixed in texture px, so very small panels are built
 * larger and scaled down to keep the corners intact.
 */
export function addPanel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, m: ArtMetrics, frame: string = K.PANEL,
): Phaser.GameObjects.NineSlice {
  const inset = frame === K.BOARD_FRAME ? m.boardFrameInset : m.panelInset;
  const minSide = inset * 2 + 2;
  const f = Math.min(1, w / Math.max(w, minSide), h / Math.max(h, minSide));
  const p = scene.add.nineslice(x, y, K.ART_ATLAS, frame, w / f, h / f, inset, inset, inset, inset);
  p.setScale(f);
  return p;
}

export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'icon';

export interface ButtonOpts {
  /** Centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** Atlas frame drawn left of the label (or centred for icon buttons). */
  icon?: string;
  kind?: ButtonKind;
  fontPx?: number;
  onClick: () => void;
  /** Test-hook id (lets e2e scripts press it). */
  id?: string;
}

const registry = new Map<string, () => void>();

/** Presses a registered button by id (debug/test hook only). Returns false if it does not exist. */
export function pressButtonById(id: string): boolean {
  const fn = registry.get(id);
  if (!fn) return false;
  fn();
  return true;
}

export function registeredButtonIds(): string[] {
  return [...registry.keys()];
}

const registryObjs = new Map<string, Phaser.GameObjects.Container>();

/** Centre of a registered button in game px (test hook: lets e2e scripts press it with a real pointer). */
export function buttonCenter(id: string): { x: number; y: number } | null {
  const b = registryObjs.get(id);
  if (!b || !b.active) return null;
  const r = b.getBounds();
  return { x: r.centerX, y: r.centerY };
}

export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.NineSlice;
  private readonly kind: ButtonKind;
  private pressed = false;
  private enabledState = true;
  readonly label: Phaser.GameObjects.Text | null = null;
  private readonly baseScale: number;

  constructor(scene: Phaser.Scene, m: ArtMetrics, o: ButtonOpts) {
    super(scene, Math.round(o.x), Math.round(o.y));
    this.kind = o.kind ?? 'primary';
    const primary = this.kind === 'primary';
    const frame = primary ? K.BUTTON : K.PANEL_DARK;
    const ix = primary ? m.buttonInsetX : m.panelInset;
    const iy = primary ? m.buttonInsetY : m.panelInset;
    const f = Math.min(1, o.w / Math.max(o.w, ix * 2 + 2), o.h / Math.max(o.h, iy * 2 + 2));
    this.bg = scene.add.nineslice(0, 0, K.ART_ATLAS, frame, o.w / f, o.h / f, ix, ix, iy, iy).setScale(f);
    this.add(this.bg);
    const fontPx = o.fontPx ?? o.h * 0.42;
    const color = this.kind === 'danger' ? '#ffb4a8' : UI.textLight;
    let iconImg: Phaser.GameObjects.Image | null = null;
    if (o.icon) {
      const s = this.kind === 'icon' ? Math.min(o.w, o.h) * 0.66 : fontPx * 1.35;
      iconImg = scene.add.image(0, primary ? -o.h * 0.04 : 0, K.ART_ATLAS, o.icon).setDisplaySize(s, s);
      this.add(iconImg);
    }
    if (o.label) {
      const t = scene.add.text(0, primary ? -o.h * 0.05 : 0, o.label, textStyle(fontPx, { color, stroke: true }));
      t.setOrigin(0.5);
      fitText(t, o.w * (iconImg ? 0.62 : 0.86));
      this.add(t);
      (this as { label: Phaser.GameObjects.Text | null }).label = t;
      if (iconImg) {
        const gap = fontPx * 0.3;
        const total = iconImg.displayWidth + gap + t.width;
        iconImg.x = -total / 2 + iconImg.displayWidth / 2;
        t.x = iconImg.x + iconImg.displayWidth / 2 + gap + t.width / 2;
      }
    }
    this.baseScale = 1;
    this.setSize(o.w, o.h);
    this.bg.setInteractive({ useHandCursor: true });
    const click = () => {
      if (!this.enabledState) return;
      getServices().audio.play('ui_click');
      o.onClick();
    };
    // Left mouse button, touch or pen only: right/middle clicks never press buttons.
    const primaryBtn = (p: Phaser.Input.Pointer) => p.wasTouch || p.button === 0;
    this.bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabledState || !primaryBtn(p)) return;
      this.pressed = true;
      if (primary) this.bg.setFrame(K.BUTTON_PRESSED);
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: this.baseScale * 0.93, duration: 70, ease: 'Quad.easeOut' });
    });
    const release = (fire: boolean) => {
      if (!this.pressed) return;
      this.pressed = false;
      if (primary) this.bg.setFrame(K.BUTTON);
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: this.baseScale, duration: 160, ease: 'Back.easeOut' });
      if (fire) click();
    };
    // A touch the browser cancelled (system gesture) releases the button without clicking it.
    this.bg.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (primaryBtn(p)) release(!p.wasCanceled);
    });
    this.bg.on('pointerout', () => release(false));
    if (o.id) {
      const id = o.id;
      registry.set(id, click);
      registryObjs.set(id, this);
      this.once(Phaser.GameObjects.Events.DESTROY, () => {
        if (registry.get(id) === click) registry.delete(id);
        if (registryObjs.get(id) === this) registryObjs.delete(id);
      });
    }
    scene.add.existing(this);
  }

  setEnabled(on: boolean): this {
    this.enabledState = on;
    this.setAlpha(on ? 1 : 0.45);
    return this;
  }
}

/** Common font sizes in game px from the cell size. */
export function fontSizes(cell: number) {
  return {
    small: Math.max(11, cell * 0.3),
    body: Math.max(13, cell * 0.36),
    label: Math.max(14, cell * 0.42),
    stat: Math.max(16, cell * 0.56),
    title: Math.max(20, cell * 0.66),
    hero: Math.max(24, cell * 0.85),
  };
}
