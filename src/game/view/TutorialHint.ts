// The in-play tutorial hint: a pulsing hand on the target (a gem group, a tray slot, a board cell) plus a short
// label. Purely visual: never interactive, never blocks input.
import Phaser from 'phaser';
import * as K from '../art/keys';
import type { ArtMetrics } from '../art/textures';
import type { Layout } from '../layout';
import { addPanel, addText, fontSizes } from '../ui/widgets';

const A = K.ART_ATLAS;

/**
 * `topY`: centre of the target's top row, so the label sits above the whole group, not on its upper half.
 * `below`: put the label under the target instead (e.g. near the top of the board).
 */
export type HintSpec = { kind: 'tap'; x: number; y: number; topY?: number; text: string; labelY?: number };

export class TutorialHint {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private current: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly layout: Layout,
    private readonly m: ArtMetrics,
  ) {}

  get visible(): boolean {
    return this.current !== null;
  }

  show(spec: HintSpec): void {
    const key = JSON.stringify(spec);
    if (key === this.current) return;
    this.hide();
    this.current = key;
    const c = this.layout.cell;
    const handS = c * 1.35;
    // The hand's fingertip is near the top-left of the icon; offset so the tip lands on the target.
    const tipDx = handS * 0.18;
    const tipDy = handS * 0.36;
    const hand = this.scene.add.image(0, 0, A, K.HAND).setDisplaySize(handS, handS).setOrigin(0.5);
    hand.setDepth(20);
    const ring = this.scene.add.image(spec.x, spec.y, A, K.GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1b0);
    const base = c / this.m.glow;
    ring.setScale(base * 0.5).setAlpha(0);
    hand.setPosition(spec.x + tipDx, spec.y + tipDy);
    this.add(ring, hand);
    this.tweens.push(
      this.scene.tweens.add({ targets: hand, x: spec.x + tipDx * 0.7, y: spec.y + tipDy * 0.7, scale: hand.scale * 0.9, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
      this.scene.tweens.add({ targets: ring, scale: { from: base * 0.4, to: base * 1.6 }, alpha: { from: 0.9, to: 0 }, duration: 840, repeat: -1, ease: 'Quad.easeOut' }),
    );
    this.label(spec.text, spec.x, spec.y, spec.topY, spec.labelY);
  }

  private label(text: string, x: number, y: number, topY = y, fixedY?: number): void {
    const c = this.layout.cell;
    const f = fontSizes(c);
    const t = addText(this.scene, 0, 0, text, f.label).setOrigin(0.5);
    const w = t.width + c * 0.7;
    const h = t.height + c * 0.3;
    const b = this.layout.board;
    // Above the target if there is room inside the board, else below it.
    let ly = topY - c * 1.05;
    if (ly - h / 2 < b.y + c * 0.1) ly = y + c * 1.55;
    if (fixedY !== undefined) ly = fixedY;
    const pl = this.layout.play;
    const lx = Phaser.Math.Clamp(x, pl.x + w / 2 + c * 0.1, pl.x + pl.w - w / 2 - c * 0.1);
    const bg = addPanel(this.scene, lx, ly, w, h, this.m, K.PANEL_DARK).setAlpha(0.92);
    t.setPosition(lx, ly);
    bg.setDepth(19);
    t.setDepth(19);
    this.add(bg, t);
    bg.setScale(bg.scaleX * 0.6);
    t.setScale(0.6);
    this.tweens.push(this.scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' }));
    const bs = bg.scaleX / 0.6;
    this.tweens.push(this.scene.tweens.add({ targets: bg, scaleX: bs, scaleY: bs, duration: 260, ease: 'Back.easeOut' }));
  }

  private add(...o: Phaser.GameObjects.GameObject[]): void {
    for (const x of o) {
      this.layer.add(x);
      this.objs.push(x);
    }
  }

  hide(): void {
    for (const t of this.tweens) t.stop();
    this.tweens = [];
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.current = null;
  }
}
