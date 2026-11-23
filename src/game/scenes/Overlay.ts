// Base for modal overlays drawn above the Play scene: a dimmed backdrop that swallows input, a centred panel
// sized from the live layout, and a rebuild on resize. Subclasses implement `buildContent`.
import Phaser from 'phaser';
import * as K from '../art/keys';
import type { ArtMetrics } from '../art/textures';
import type { Layout, Rect } from '../layout';
import { currentLayout, onResize } from '../ui/screen';
import { addPanel, addText, ensureArt, fontSizes } from '../ui/widgets';

export interface OverlayData {
  onClose?: () => void;
}

export abstract class Overlay<D extends OverlayData = OverlayData> extends Phaser.Scene {
  protected layout!: Layout;
  protected m!: ArtMetrics;
  protected d!: D;
  protected f!: ReturnType<typeof fontSizes>;
  /** Root container of the panel content (animated in on first build). */
  protected root!: Phaser.GameObjects.Container;
  private firstBuild = true;

  init(data: D): void {
    this.d = data;
    this.firstBuild = true;
  }

  create(): void {
    this.build();
    onResize(this, () => this.build());
  }

  /** Dim alpha of the backdrop. */
  protected dim = 0.55;

  protected build(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    this.layout = currentLayout(this);
    this.m = ensureArt(this, this.layout);
    this.f = fontSizes(this.layout.cell);
    this.cameras.main.setViewport(0, 0, this.layout.width, this.layout.height);
    const bg = this.add.rectangle(0, 0, this.layout.width, this.layout.height, 0x1a0c05, this.dim).setOrigin(0);
    bg.setInteractive();
    bg.on('pointerup', () => this.onBackdrop());
    this.root = this.add.container(0, 0);
    this.buildContent();
    if (this.firstBuild) {
      this.firstBuild = false;
      bg.setAlpha(0);
      this.tweens.add({ targets: bg, alpha: 1, duration: 200 });
      this.animateIn();
    }
  }

  protected animateIn(): void {
    const r = this.root;
    const area = this.area();
    r.setPosition(0, area.h * 0.06).setAlpha(0);
    this.tweens.add({ targets: r, y: 0, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  protected abstract buildContent(): void;

  /** Backdrop tap: close by default when the overlay has a close action. */
  protected onBackdrop(): void {}

  /** The area overlays centre in (the play column, or the whole safe area in the wide arrangement). */
  protected area(): Rect {
    const L = this.layout;
    return L.mode === 'column' ? { x: L.play.x, y: L.safe.y, w: L.play.w, h: L.safe.h } : L.safe;
  }

  /** Unit size so content of `wUnits` x `hUnits` cells fits the area. */
  protected unitFor(wUnits: number, hUnits: number): number {
    const a = this.area();
    return Math.min(this.layout.cell * 1.15, (a.w * 0.96) / wUnits, (a.h * 0.96) / hUnits);
  }

  protected panel(cx: number, cy: number, w: number, h: number, frame = K.PANEL): Phaser.GameObjects.NineSlice {
    const p = addPanel(this, cx, cy, w, h, this.m, frame);
    this.root.add(p);
    return p;
  }

  protected text(x: number, y: number, s: string, size: number, color?: string, wrap?: number): Phaser.GameObjects.Text {
    const t = addText(this, x, y, s, size, { color, stroke: color === undefined, wrap }).setOrigin(0.5);
    this.root.add(t);
    return t;
  }

  /** Ribbon-style title plate on top of a panel. */
  protected titlePlate(cx: number, y: number, w: number, label: string, u: number): void {
    const h = u * 1.0;
    const p = addPanel(this, cx, y, w, h, this.m, K.PANEL_DARK);
    this.root.add(p);
    const t = addText(this, cx, y, label, u * 0.55).setOrigin(0.5);
    if (t.width > w * 0.9) t.setScale((w * 0.9) / t.width);
    this.root.add(t);
  }

  protected close(): void {
    this.d.onClose?.();
  }
}
