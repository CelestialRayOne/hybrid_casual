// The five gem power animations: the "money moment" of v2. Each one is short (~450-950 ms, see timeline.ts
// `powerTiming`), readable (the effect visibly travels the cells it hits, in the order the core resolved them) and
// built only from pooled sprites, capped particle emitters and pooled bolt graphics (Fx).
//
// - Wildfire: flames leap cell to cell in `burnt` step order; gems char, then pop in shards and embers.
// - Tidal Wave: water streaks sweep out along each row/column from the tapped cell; gems wash away with droplets.
// - Earthshaker: a stomp, a hard rumble and shock rings rolling over the area; rocks fly off dirt and stone.
// - Chain Lightning: jagged bolts jump strike to strike with a rising zap per strike and blue sparks.
// - Drill: a spinning bit bores down the path spraying rock chunks; gems along it burst as it passes.
//
// Damage events (dirt, bedrock, crusts) are NOT handled here: the timeline schedules them when the effect reaches
// their cell, and BoardView animates them.
import Phaser from 'phaser';
import type { Pos } from '../../core';
import type { AudioService } from '../../platform';
import { POWER_SOUND_FOR_COLOR } from '../../platform';
import * as K from '../art/keys';
import { GEM, hexToInt } from '../art/palette';
import type { Layout } from '../layout';
import { type PowerEvent, type PowerTiming, drillPace } from '../timeline';
import type { BoardView } from './BoardView';
import { type Fx, GEM_TINT } from './Fx';

type After = (ms: number, fn: () => void) => void;

const FIRE = 0xff7a2a;
const WATER = hexToInt(GEM[1]!.glow);
const EARTH = hexToInt(GEM[2]!.glow);
const VOLT = hexToInt(GEM[3]!.glow);
const DRILL = hexToInt(GEM[4]!.glow);

export class PowerFx {
  private readonly c: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Fx,
    private readonly board: BoardView,
    private readonly layout: Layout,
    private readonly audio: AudioService,
    private readonly after: After,
  ) {
    this.c = layout.cell;
  }

  private scr(p: Pos): { x: number; y: number } {
    return this.board.screen(p.x, p.y);
  }

  play(e: PowerEvent, t: PowerTiming): void {
    this.audio.play(POWER_SOUND_FOR_COLOR[e.color] ?? 'fire', { level: e.level });
    switch (e.effect.power) {
      case 'wildfire': this.wildfire(e, t); break;
      case 'tidal': this.tidal(e, t); break;
      case 'earthshaker': this.earthshaker(e, t); break;
      case 'lightning': this.lightning(e, t); break;
      case 'drill': this.drill(e, t); break;
    }
  }

  // ---- Wildfire ---------------------------------------------------------------------------------------

  private wildfire(e: PowerEvent, t: PowerTiming): void {
    const o = this.scr(e.at);
    this.fx.glow(o.x, o.y, FIRE, 0.4, 3.2, 520);
    this.fx.emberBurst(o.x, o.y, 10);
    this.fx.shake(this.c * 0.05, 200);
    for (const d of e.destroyed) {
      const at = t.cellTime(d.at);
      this.after(at, () => this.burn(d.at, d.color));
    }
    if (e.effect.power === 'wildfire' && !e.effect.group.length) this.flame(e.at, 0);
  }

  /** A flame leaps up on the cell; the gem chars, then pops in shards and embers. */
  private burn(p: Pos, color: number): void {
    const pos = this.scr(p);
    this.flame(p, 0);
    this.fx.glow(pos.x, pos.y, FIRE, 0.3, 1.5, 300, 0.7);
    const img = this.board.takeGem(p);
    if (img) {
      img.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffb080);
      this.scene.tweens.add({
        targets: img,
        scale: img.scale * 1.12,
        duration: 90,
        onComplete: () => img.setTint(0x5a2a18),
      });
      this.scene.tweens.add({
        targets: img,
        scale: img.scale * 0.35,
        alpha: 0,
        delay: 170,
        duration: 140,
        ease: 'Quad.easeIn',
        onStart: () => {
          this.fx.gemBurst(pos.x, pos.y, color, 3, 0);
          this.fx.emberBurst(pos.x, pos.y - this.c * 0.1, 4);
        },
        onComplete: () => this.board.recycle(img),
      });
    } else {
      this.fx.emberBurst(pos.x, pos.y, 3);
    }
  }

  private flame(p: Pos, delay: number): void {
    const f = this.fx.sprite(K.FX_FLAME_FRAMES[(p.x + p.y) % K.FX_FLAME_FRAMES.length] ?? K.FX_FLAME);
    if (!f) return;
    const pos = this.scr(p);
    const s = f.scale;
    f.setOrigin(0.5, 0.92).setPosition(pos.x, pos.y + this.c * 0.42).setScale(s * 0.25, s * 0.2).setAlpha(0.95).setDepth(2);
    let frame = (p.x * 3 + p.y) % 3;
    const flick = { t: 0 };
    let last = -1;
    this.scene.tweens.add({
      targets: flick,
      t: 1,
      delay,
      duration: 520,
      onUpdate: () => {
        const step = Math.floor(flick.t * 8);
        if (step !== last) {
          last = step;
          frame = (frame + 1) % 3;
          f.setFrame(K.FX_FLAME_FRAMES[frame] ?? K.FX_FLAME);
        }
      },
    });
    this.scene.tweens.chain({
      targets: f,
      tweens: [
        { scaleX: s * 1.25, scaleY: s * 1.45, delay, duration: 150, ease: 'Back.easeOut' },
        { scaleX: s * 0.7, scaleY: s * 0.9, alpha: 0, y: f.y - this.c * 0.35, delay: 160, duration: 220, ease: 'Quad.easeIn' },
      ],
      onComplete: () => this.fx.free(f),
    });
  }

  // ---- Tidal Wave ---------------------------------------------------------------------------------------

  private tidal(e: PowerEvent, t: PowerTiming): void {
    if (e.effect.power !== 'tidal') return;
    const o = this.scr(e.at);
    this.fx.glow(o.x, o.y, WATER, 0.4, 2.6, 420);
    this.fx.dropBurst(o.x, o.y, 8);
    this.fx.shockRing(o.x, o.y, WATER, 0.4, 2.2, 380);
    this.after(90, () => this.fx.shake(this.c * 0.05, 260));
    const top = this.board.viewScroll;
    for (const row of e.effect.rows) {
      for (let x = 0; x < 8; x++) {
        const p = { x, y: row };
        this.after(t.cellTime(p), () => this.streak(p, x < e.at.x ? -1 : 1, false));
      }
    }
    for (const col of e.effect.cols) {
      for (let y = Math.floor(top); y < Math.floor(top) + 10; y++) {
        const p = { x: col, y };
        if (e.effect.rows.includes(y)) continue;
        this.after(t.cellTime(p), () => this.streak(p, y < e.at.y ? -1 : 1, true));
      }
    }
    for (const d of e.destroyed) {
      const inRow = e.effect.rows.includes(d.at.y);
      const dir = inRow ? Math.sign(d.at.x - e.at.x) || 1 : Math.sign(d.at.y - e.at.y) || 1;
      this.after(t.cellTime(d.at), () => this.wash(d.at, d.color, dir, !inRow));
    }
  }

  private streak(p: Pos, dir: number, vertical: boolean): void {
    const img = this.fx.sprite(K.FX_WAVE_STREAK);
    if (!img) return;
    const pos = this.scr(p);
    const s = img.scale;
    img.setPosition(pos.x - (vertical ? 0 : dir * this.c * 0.3), pos.y - (vertical ? dir * this.c * 0.3 : 0));
    img.setAngle(vertical ? 90 : 0).setFlipX(dir < 0).setAlpha(0).setScale(s * 1.05, s * 0.35).setDepth(1);
    this.scene.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 0.95, scaleY: s * 1.05, x: pos.x, y: pos.y, duration: 90, ease: 'Quad.easeOut' },
        {
          alpha: 0,
          scaleX: s * 1.35,
          scaleY: s * 0.6,
          x: pos.x + (vertical ? 0 : dir * this.c * 0.35),
          y: pos.y + (vertical ? dir * this.c * 0.35 : 0),
          duration: 230,
          ease: 'Quad.easeIn',
        },
      ],
      onComplete: () => {
        img.setFlipX(false);
        this.fx.free(img);
      },
    });
    if ((p.x + p.y) % 2 === 0) this.fx.dropBurst(pos.x, pos.y, 1);
  }

  private wash(p: Pos, color: number, dir: number, vertical: boolean): void {
    const pos = this.scr(p);
    this.fx.dropBurst(pos.x, pos.y, 3);
    this.fx.gemBurst(pos.x, pos.y, color, 2, 1);
    const img = this.board.takeGem(p);
    if (!img) return;
    img.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xb8e0ff);
    this.scene.tweens.add({
      targets: img,
      x: img.x + (vertical ? 0 : dir * this.c * 0.7),
      y: img.y + (vertical ? dir * this.c * 0.7 : 0),
      angle: dir * 35,
      alpha: 0,
      scale: img.scale * 0.6,
      duration: 240,
      ease: 'Quad.easeIn',
      onComplete: () => this.board.recycle(img),
    });
  }

  // ---- Earthshaker ----------------------------------------------------------------------------------------

  private earthshaker(e: PowerEvent, t: PowerTiming): void {
    if (e.effect.power !== 'earthshaker') return;
    const fxe = e.effect;
    const origin = fxe.origin.length ? fxe.origin : [e.at];
    let cx = 0;
    let cy = 0;
    for (const p of origin) {
      const s = this.scr(p);
      cx += s.x / origin.length;
      cy += s.y / origin.length;
      this.fx.glow(s.x, s.y, EARTH, 0.3, 1.2, 260, 0.6);
    }
    const stomp = t.cellTime(origin[0]!);
    this.after(Math.max(0, stomp - 40), () => {
      this.fx.shake(this.c * 0.16, 420);
      this.fx.glow(cx, cy, EARTH, 0.6, 3.5 + fxe.radius, 520, 0.85);
      const span = (fxe.radius * 2 + 1 + 1) * 1.15;
      this.fx.shockRing(cx, cy, EARTH, 0.4, span, 560);
      this.fx.shockRing(cx, cy, 0xf0d098, 0.3, span * 0.8, 520, 110);
      if (fxe.radius >= 2) this.fx.shockRing(cx, cy, EARTH, 0.3, span * 1.15, 600, 230);
      this.fx.greenSparks(cx, cy, 10);
      this.fx.rockBurst(cx, cy, 6);
    });
    let n = 0;
    for (const p of fxe.area) {
      const kind = this.cellKind(p);
      const at = t.cellTime(p);
      if (kind === 'block') {
        this.board.rattle(p, at);
        continue;
      }
      if (kind === 'empty') continue;
      const pos = this.scr(p);
      const lot = n++;
      this.after(at, () => {
        this.board.rattleTerrain(p, 0);
        this.fx.rockBurst(pos.x, pos.y, lot % 2 === 0 ? 3 : 2);
        this.fx.dustBurst(pos.x, pos.y, 3, kind === 'bedrock' ? 'stone' : 'dirt');
        if (lot % 3 === 0) this.fx.greenSparks(pos.x, pos.y, 2);
      });
    }
    // Fissures: a glowing crack runs cell by cell out of the square; gems on it rattle, ground bursts.
    for (const f of fxe.fissures) {
      f.forEach((p, i) => {
        const at = t.cellTime(p);
        const kind = this.cellKind(p);
        if (kind === 'block') this.board.rattle(p, at);
        const pos = this.scr(p);
        this.after(at, () => {
          this.fx.glow(pos.x, pos.y, EARTH, 0.25, 1.1, 220, 0.7);
          if (kind === 'block' || kind === 'empty') return;
          this.board.rattleTerrain(p, 0);
          this.fx.rockBurst(pos.x, pos.y, 2);
          this.fx.dustBurst(pos.x, pos.y, 3, kind === 'bedrock' ? 'stone' : 'dirt');
          if (i === f.length - 1) this.fx.greenSparks(pos.x, pos.y, 3);
        });
      });
    }
  }

  private cellKind(p: Pos): string {
    return this.kindOf ? this.kindOf(p) : 'empty';
  }

  /** Set by the scene: the kind of a cell BEFORE the action (the core state is already resolved). */
  kindOf: ((p: Pos) => string) | null = null;

  // ---- Chain Lightning ------------------------------------------------------------------------------------

  private lightning(e: PowerEvent, t: PowerTiming): void {
    if (e.effect.power !== 'lightning') return;
    const strikes = e.effect.strikes;
    const color = new Map(e.destroyed.map((d) => [d.at.y * 64 + d.at.x, d.color]));
    const b = this.layout.board;
    strikes.forEach((p, i) => {
      this.after(t.cellTime(p), () => {
        const to = this.scr(p);
        const prev = strikes[i - 1];
        const from = prev ? this.scr(prev) : { x: to.x + (to.x < b.x + b.w / 2 ? 1 : -1) * this.c * 0.6, y: b.y - this.c * 0.3 };
        this.fx.bolt(from.x, from.y, to.x, to.y, VOLT, 260);
        this.audio.play('zap', { index: i });
        this.fx.glow(to.x, to.y, 0xfff2b0, 0.3, 1.6, 240);
        this.fx.blueSparks(to.x, to.y, 7);
        this.fx.shake(this.c * 0.035, 80);
        this.zap(p, color.get(p.y * 64 + p.x) ?? 3);
      });
    });
  }

  private zap(p: Pos, color: number): void {
    const pos = this.scr(p);
    const img = this.board.takeGem(p);
    if (!img) {
      this.fx.sparkBurst(pos.x, pos.y, 4, VOLT);
      return;
    }
    img.setFrame(K.gemGlowKey(color)).clearTint();
    this.fx.glow(pos.x, pos.y, 0xffffff, 0.2, 1.1, 160, 0.9);
    this.scene.tweens.add({
      targets: img,
      scale: img.scale * 1.3,
      duration: 70,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.fx.gemBurst(pos.x, pos.y, color, 4, 2);
        this.board.recycle(img);
      },
    });
  }

  // ---- Drill -------------------------------------------------------------------------------------------------

  private drill(e: PowerEvent, t: PowerTiming): void {
    if (e.effect.power !== 'drill') return;
    const fxe = e.effect;
    const { lead, rows, perRow } = drillPace(fxe);
    const travel = rows * perRow;
    const startY = this.scr({ x: 0, y: fxe.from }).y - this.c * 0.55;
    const endY = this.scr({ x: 0, y: fxe.to }).y + this.c * 0.15;
    this.fx.shake(this.c * 0.05, lead + travel);
    for (const col of fxe.cols) {
      const bit = this.fx.sprite(K.FX_DRILL_BIT);
      if (!bit) continue;
      const x = this.scr({ x: col, y: fxe.from }).x;
      const s = bit.scale * 1.3;
      bit.setOrigin(0.5, 0.62).setPosition(x, startY - this.c * 0.4).setAlpha(0).setScale(s * 0.6).setDepth(3);
      this.fx.glow(x, startY, DRILL, 0.3, 1.8, 320, 0.8);
      const spin = this.scene.tweens.add({ targets: bit, scaleX: { from: s, to: -s }, duration: 55, yoyo: true, repeat: -1, delay: lead * 0.5 });
      this.scene.tweens.chain({
        targets: bit,
        tweens: [
          { alpha: 1, scale: s, y: startY, duration: lead, ease: 'Back.easeOut' },
          { y: endY, duration: travel, ease: 'Linear' },
          { alpha: 0, scaleY: s * 0.4, duration: 180, ease: 'Quad.easeIn' },
        ],
        onComplete: () => {
          spin.stop();
          this.fx.free(bit);
        },
      });
      // Rock spray from the tip while boring.
      const sprays = Math.max(2, Math.round(travel / 60));
      for (let k = 0; k < sprays; k++) {
        this.after(lead + (k / sprays) * travel, () => {
          const y = startY + ((k + 0.5) / sprays) * (endY - startY) + this.c * 0.35;
          this.fx.rockBurst(x, y, 3);
          this.fx.sparkBurst(x, y, 2, DRILL);
          if (k % 2 === 0) this.fx.dustBurst(x, y, 2, 'dirt');
          this.fx.glow(x, y - this.c * 0.2, DRILL, 0.3, 1.2, 200, 0.5);
        });
      }
    }
    // Break-through: a burst where the bit stops, then the blast runs sideways along the row.
    if (fxe.blast.length) {
      const tip = this.scr({ x: fxe.cols[0]!, y: fxe.to });
      this.after(lead + travel, () => {
        this.fx.shake(this.c * 0.09, 200);
        this.fx.glow(tip.x, tip.y, DRILL, 0.5, 2.6, 300, 0.85);
        this.fx.shockRing(tip.x, tip.y, DRILL, 0.35, 2.4, 360);
      });
      for (const p of fxe.blast) {
        const pos = this.scr(p);
        this.after(t.cellTime(p), () => {
          this.fx.rockBurst(pos.x, pos.y, 2);
          this.fx.sparkBurst(pos.x, pos.y, 2, DRILL);
          this.fx.glow(pos.x, pos.y, DRILL, 0.3, 1.3, 200, 0.6);
        });
      }
    }
    for (const p of fxe.path) {
      if (this.cellKind(p) !== 'block' && this.cellKind(p) !== 'empty') this.board.rattleTerrain(p, t.cellTime(p) - 40);
    }
    for (const d of e.destroyed) {
      this.after(t.cellTime(d.at), () => {
        const pos = this.scr(d.at);
        const img = this.board.takeGem(d.at);
        this.fx.gemBurst(pos.x, pos.y, d.color, 4, 1);
        this.fx.rockBurst(pos.x, pos.y, 1);
        this.fx.glow(pos.x, pos.y, DRILL, 0.3, 1.4, 220, 0.8);
        if (img) {
          img.setFrame(K.gemGlowKey(d.color)).clearTint();
          this.scene.tweens.add({ targets: img, scale: img.scale * 0.2, angle: 90, alpha: 0, duration: 120, onComplete: () => this.board.recycle(img) });
        }
      });
    }
  }
}

/** Tint for a power's colour (glows, pending flights). */
export function powerTint(color: number): number {
  return GEM_TINT[color] ?? 0xffffff;
}
