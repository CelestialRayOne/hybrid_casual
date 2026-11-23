// The power tray (bottom panel, or right-hand panel in the wide layout): 3 slots, 4 with Tool Belt. Each slot
// shows a power token with 5 level pips. Tap a token to arm it (a tinted glow ring pulses round it; the token
// lifts a little); tap it again to disarm. The tray keeps its own displayed copy of the powers so charges can land
// when their flight arrives (merge = level-up pop, replace = the old token drops out); the scene re-syncs it from
// the core state whenever nothing is in flight.
import Phaser from 'phaser';
import type { Power } from '../../core';
import * as K from '../art/keys';
import { GEM, hexToInt } from '../art/palette';
import type { ArtMetrics } from '../art/textures';
import type { Layout, Rect, TrayLayout } from '../layout';
import { addPanel } from '../ui/widgets';

const A = K.ART_ATLAS;

type Shown = Pick<Power, 'color' | 'level'>;

interface Slot {
  rect: Rect;
  cx: number;
  /** Token centre y. */
  cy: number;
  socket: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  token: Phaser.GameObjects.Image;
  pips: Phaser.GameObjects.Image[];
  /** Pip home positions. */
  pipAt: [number, number][];
  shown: Shown | null;
  ringTween: Phaser.Tweens.Tween | null;
}

export class TrayView {
  private slots: Slot[] = [];
  private tl!: TrayLayout;
  private armed: number | null = null;
  private token = 0;
  private pip = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly layout: Layout,
    private readonly m: ArtMetrics,
  ) {}

  build(capacity: number): void {
    const cap = capacity >= 4 ? 4 : 3;
    this.tl = this.layout.tray[cap];
    const p = this.tl.panel;
    const c = this.layout.cell;
    this.layer.add(addPanel(this.scene, p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, this.m, K.PANEL));
    const first = this.tl.slots[0] as Rect;
    this.token = Math.min(first.h * 0.74, first.w * 0.8, c * 1.35);
    this.pip = Math.max(7, this.token * 0.2);
    const offs = K.pipOffsets(this.token, this.pip);
    const pipY = offs[0]?.[1] ?? this.token * 0.56;
    const shift = (-this.token / 2 + pipY + this.pip / 2) / 2;
    this.slots = this.tl.slots.map((rect) => {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2 - shift;
      const socket = this.scene.add.image(cx, cy, A, K.TRAY_SLOT).setDisplaySize(this.token, this.token);
      const ringS = this.token * (this.m.armedRing / this.m.power);
      const ring = this.scene.add.image(cx, cy, A, K.POWER_ARMED_RING).setDisplaySize(ringS, ringS).setVisible(false);
      ring.setBlendMode(Phaser.BlendModes.ADD);
      const token = this.scene.add.image(cx, cy, A, K.powerKey(0)).setDisplaySize(this.token, this.token).setVisible(false);
      const pips = offs.map(([dx, dy]) => this.scene.add.image(cx + dx, cy + dy, A, K.POWER_PIP_OFF).setDisplaySize(this.pip, this.pip).setVisible(false));
      this.layer.add([socket, ring, token, ...pips]);
      const pipAt = offs.map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]);
      return { rect, cx, cy, socket, ring, token, pips, pipAt, shown: null, ringTween: null };
    });
    this.armed = null;
  }

  private tokenScale(): number {
    return this.token / this.m.power;
  }

  private show(slot: Slot, p: Shown | null): void {
    slot.shown = p ? { color: p.color, level: p.level } : null;
    this.scene.tweens.killTweensOf(slot.token);
    slot.token.setPosition(slot.cx, slot.cy).setAngle(0).setAlpha(1);
    if (!p) {
      slot.token.setVisible(false);
      for (const pp of slot.pips) pp.setVisible(false);
      slot.socket.setAlpha(0.85);
      return;
    }
    slot.socket.setAlpha(1);
    slot.token.setFrame(K.powerKey(p.color)).setVisible(true).setScale(this.tokenScale());
    slot.pips.forEach((pp, i) => {
      this.scene.tweens.killTweensOf(pp);
      const [px, py] = slot.pipAt[i] ?? [slot.cx, slot.cy];
      pp.setFrame(i < p.level ? K.POWER_PIP_ON : K.POWER_PIP_OFF).setVisible(true).setDisplaySize(this.pip, this.pip).setAlpha(1);
      pp.setPosition(px, py);
    });
  }

  /** Instant sync with the core tray. */
  render(powers: readonly Power[], armed: number | null): void {
    this.slots.forEach((slot, i) => this.show(slot, powers[i] ?? null));
    this.setArmed(armed, false);
  }

  /** True if the displayed tray matches `powers` (no animation pending). */
  matches(powers: readonly Power[]): boolean {
    return this.slots.every((s, i) => {
      const p = powers[i];
      return (!p && !s.shown) || (!!p && !!s.shown && p.color === s.shown.color && p.level === s.shown.level);
    });
  }

  setArmed(i: number | null, animate = true): void {
    this.armed = i;
    this.slots.forEach((slot, k) => {
      const on = k === i && !!slot.shown;
      slot.ringTween?.stop();
      slot.ringTween = null;
      const ringS = this.token * (this.m.armedRing / this.m.power);
      if (on) {
        const tint = hexToInt(GEM[slot.shown!.color]!.glow);
        slot.ring.setVisible(true).setTint(tint).setAlpha(1).setDisplaySize(ringS, ringS);
        const base = slot.ring.scale;
        slot.ringTween = this.scene.tweens.add({ targets: slot.ring, alpha: 0.5, scale: base * 1.07, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        if (animate) {
          slot.ring.setScale(base * 0.6);
          this.scene.tweens.add({ targets: slot.ring, scale: base, duration: 200, ease: 'Back.easeOut' });
        }
      } else {
        slot.ring.setVisible(false);
      }
      if (slot.shown) {
        this.scene.tweens.killTweensOf(slot.token);
        const lift = on ? -this.layout.cell * 0.08 : 0;
        const s = this.tokenScale() * (on ? 1.1 : 1);
        if (animate) this.scene.tweens.add({ targets: slot.token, y: slot.cy + lift, scale: s, duration: 160, ease: 'Back.easeOut' });
        else slot.token.setY(slot.cy + lift).setScale(s);
      }
    });
  }

  /** A power was used from slot `i`: the token blasts off, the tokens to its right slide over. */
  removeAt(i: number): void {
    const slot = this.slots[i];
    if (!slot) return;
    this.setArmed(null, false);
    // Ghost of the used token.
    if (slot.shown) {
      const ghost = this.scene.add.image(slot.cx, slot.token.y, A, K.powerKey(slot.shown.color)).setScale(this.tokenScale() * 1.1);
      this.layer.add(ghost);
      this.scene.tweens.add({ targets: ghost, scale: this.tokenScale() * 1.8, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => ghost.destroy() });
    }
    const shown = this.slots.map((s) => s.shown);
    shown.splice(i, 1);
    shown.push(null);
    this.slots.forEach((s, k) => {
      if (k < i) return;
      const p = shown[k] ?? null;
      this.show(s, p);
      if (p) {
        const from = this.slots[k + 1];
        if (from) {
          const dx = from.cx - s.cx;
          const dy = from.cy - s.cy;
          s.token.setPosition(s.cx + dx, s.cy + dy);
          this.scene.tweens.add({ targets: s.token, x: s.cx, y: s.cy, duration: 220, ease: 'Cubic.easeOut' });
          s.pips.forEach((pp) => {
            const x = pp.x;
            const y = pp.y;
            pp.setPosition(x + dx, y + dy);
            this.scene.tweens.add({ targets: pp, x, y, duration: 220, ease: 'Cubic.easeOut' });
          });
        }
      }
    });
  }

  /**
   * A charge flight landed in slot `i`. `merged`: level-up pop with the new pips filling in; `replaced`: the old
   * token drops out first; otherwise the new token pops in.
   */
  land(i: number, p: Shown, merged: boolean, replaced: boolean): void {
    const slot = this.slots[i];
    if (!slot) return;
    const s = this.tokenScale();
    if (merged && slot.shown) {
      const old = slot.shown.level;
      this.show(slot, p);
      slot.token.setScale(s * 1.45);
      this.scene.tweens.add({ targets: slot.token, scale: s, duration: 380, ease: 'Elastic.easeOut', easeParams: [1.1, 0.5] });
      slot.pips.forEach((pp, k) => {
        if (k < old || k >= p.level) return;
        pp.setDisplaySize(this.pip * 2.2, this.pip * 2.2);
        this.scene.tweens.add({ targets: pp, displayWidth: this.pip, displayHeight: this.pip, delay: (k - old) * 70, duration: 260, ease: 'Back.easeOut' });
      });
    } else {
      if (replaced && slot.shown) {
        const ghost = this.scene.add.image(slot.cx, slot.cy, A, K.powerKey(slot.shown.color)).setScale(s);
        this.layer.add(ghost);
        this.scene.tweens.add({ targets: ghost, y: slot.cy + this.layout.cell * 0.9, angle: 40, alpha: 0, scale: s * 0.6, duration: 320, ease: 'Quad.easeIn', onComplete: () => ghost.destroy() });
      }
      this.show(slot, p);
      slot.token.setScale(0);
      this.scene.tweens.add({ targets: slot.token, scale: s, duration: 320, ease: 'Back.easeOut' });
    }
    if (this.armed === i) this.setArmed(i, false);
  }

  /** Attention pulse (out of moves but a power is waiting, or a tutorial points here). */
  pulse(): void {
    for (const s of this.slots) {
      if (!s.shown) continue;
      this.scene.tweens.killTweensOf(s.token);
      const base = this.tokenScale();
      s.token.setScale(base).setY(s.cy);
      this.scene.tweens.add({ targets: s.token, scale: base * 1.18, duration: 160, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
    }
  }

  slotAt(px: number, py: number): number | null {
    for (let i = 0; i < this.slots.length; i++) {
      const r = (this.slots[i] as Slot).rect;
      if (px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h) return i;
    }
    return null;
  }

  slotCenter(i: number): { x: number; y: number } {
    const s = this.slots[Math.max(0, Math.min(i, this.slots.length - 1))] as Slot;
    return { x: s.cx, y: s.cy };
  }

  /** Displayed token size (for flights that land here). */
  tokenSize(): number {
    return this.token;
  }

  get panel(): Rect {
    return this.tl.panel;
  }

  get vertical(): boolean {
    return this.tl.vertical;
  }

  get count(): number {
    return this.slots.length;
  }
}
