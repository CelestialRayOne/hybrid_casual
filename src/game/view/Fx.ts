// Pooled visual effects drawn in the FX layer (screen space, above the board): particles, glows, flashes,
// floating text, one-off sprites (flames, wave streaks, shock rings, drill bits), lightning bolts and camera
// shake. Emitters are created once per layout and reused; every count is capped (60 fps on mid phones).
import Phaser from 'phaser';
import { drawLightningBolt } from '../art/fx';
import * as K from '../art/keys';
import { BEDROCK, CRUST, DIRT, GEM, hexToInt } from '../art/palette';
import type { ArtMetrics } from '../art/textures';
import { textStyle } from '../ui/widgets';

const A = K.ART_ATLAS;
/** Hard cap on live particles per emitter (keeps mid phones at 60 fps). */
const MAX_PARTICLES = 140;
/** Hard cap on live one-off sprites (flames, streaks, rings, bits). */
const MAX_SPRITES = 120;

export const GEM_TINT = GEM.map((g) => hexToInt(g.glow));
export const GEM_BASE = GEM.map((g) => hexToInt(g.base));

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

export class Fx {
  private readonly shards: Emitter;
  private readonly sparks: Emitter;
  private readonly dust: Emitter;
  private readonly chunks: Emitter;
  private readonly embers: Emitter;
  private readonly drops: Emitter;
  private readonly rocks: Emitter;
  private readonly blue: Emitter;
  private readonly green: Emitter;
  private readonly glints: Emitter;
  readonly trail: Emitter;
  private readonly glowPool: Phaser.GameObjects.Image[] = [];
  private readonly spritePool: Phaser.GameObjects.Image[] = [];
  private readonly boltPool: Phaser.GameObjects.Graphics[] = [];
  private readonly textPool: Phaser.GameObjects.Text[] = [];
  private readonly emitters: Emitter[];
  private live = 0;
  /** Set when the layout is rebuilt: bursts still queued on timers for the old layout are dropped. */
  dead = false;
  /** texture px -> screen px */
  readonly s: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    readonly c: number,
    readonly m: ArtMetrics,
    private readonly cameras: Phaser.Cameras.Scene2D.Camera[],
  ) {
    const s = c / m.cell;
    this.s = s;
    const add = (frame: string | string[], cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): Emitter =>
      scene.add.particles(0, 0, A, { frame, emitting: false, maxParticles: MAX_PARTICLES, ...cfg });
    this.shards = add(K.shardKey(0), {
      speed: { min: c * 2.2, max: c * 6.5 },
      angle: { min: 200, max: 340 },
      gravityY: c * 16,
      lifespan: { min: 420, max: 720 },
      scale: { start: s * 1.05, end: s * 0.35 },
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      rotate: { min: 0, max: 360 },
    });
    this.sparks = add(K.SPARK, {
      blendMode: Phaser.BlendModes.ADD,
      speed: { min: c * 1.2, max: c * 4.5 },
      lifespan: { min: 220, max: 460 },
      scale: { start: s * 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
    });
    this.dust = add(K.DUST, {
      speed: { min: c * 0.4, max: c * 1.8 },
      gravityY: c * 2.5,
      lifespan: { min: 380, max: 700 },
      scale: { start: s * 0.7, end: s * 1.5 },
      alpha: { start: 0.85, end: 0 },
      rotate: { min: 0, max: 360 },
    });
    this.chunks = add(K.bedrockTile(0), {
      maxParticles: 60,
      speed: { min: c * 2, max: c * 6 },
      angle: { min: 190, max: 350 },
      gravityY: c * 18,
      lifespan: { min: 450, max: 750 },
      scale: { start: s * 0.28, end: s * 0.12 },
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      rotate: { start: 0, end: 540 },
    });
    this.embers = add(K.FX_EMBER, {
      blendMode: Phaser.BlendModes.ADD,
      maxParticles: 110,
      speed: { min: c * 0.6, max: c * 2.6 },
      angle: { min: 220, max: 320 },
      gravityY: -c * 2.2,
      lifespan: { min: 420, max: 820 },
      scale: { start: s * 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
    });
    this.drops = add(K.FX_WATER_DROP, {
      maxParticles: 110,
      speed: { min: c * 1.6, max: c * 4.8 },
      angle: { min: 210, max: 330 },
      gravityY: c * 15,
      lifespan: { min: 380, max: 640 },
      scale: { start: s * 1.1, end: s * 0.55 },
      alpha: { start: 0.95, end: 0, ease: 'Quad.easeIn' },
    });
    this.rocks = add([...K.FX_ROCK_FRAMES], {
      maxParticles: 90,
      speed: { min: c * 2.2, max: c * 6.2 },
      angle: { min: 200, max: 340 },
      gravityY: c * 17,
      lifespan: { min: 460, max: 760 },
      scale: { start: s * 1.0, end: s * 0.6 },
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      rotate: { start: 0, end: 420 },
    });
    this.blue = add(K.FX_SPARK_BLUE, {
      blendMode: Phaser.BlendModes.ADD,
      speed: { min: c * 1.5, max: c * 5.5 },
      lifespan: { min: 160, max: 380 },
      scale: { start: s * 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
    });
    this.green = add(K.FX_SPARK_GREEN, {
      blendMode: Phaser.BlendModes.ADD,
      speed: { min: c * 1.0, max: c * 3.6 },
      lifespan: { min: 260, max: 520 },
      scale: { start: s * 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
    });
    this.glints = add(K.GEODE_GLINT, {
      blendMode: Phaser.BlendModes.ADD,
      maxParticles: 60,
      speed: { min: c * 1.2, max: c * 4 },
      lifespan: { min: 380, max: 700 },
      scale: { start: s * 0.9, end: 0 },
      rotate: { min: 0, max: 180 },
      alpha: { start: 1, end: 0 },
    });
    this.trail = add(K.SPARK, {
      maxParticles: 80,
      blendMode: Phaser.BlendModes.ADD,
      frequency: 18,
      speed: { min: 0, max: c * 0.6 },
      lifespan: 380,
      scale: { start: s * 1.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xffe07a,
    });
    this.emitters = [this.dust, this.chunks, this.rocks, this.shards, this.drops, this.embers, this.green, this.blue, this.glints, this.trail, this.sparks];
    for (const e of this.emitters) layer.add(e);
  }

  // ---- particle bursts -------------------------------------------------------------------------------

  /** Gem shards + sparks for one cleared gem. */
  gemBurst(x: number, y: number, color: number, shards: number, sparks: number): void {
    if (this.dead) return;
    this.shards.setEmitterFrame(K.shardKey(color));
    this.shards.explode(shards, x, y);
    if (sparks > 0) {
      this.sparks.setParticleTint(GEM_TINT[color] ?? 0xffffff);
      this.sparks.explode(sparks, x, y);
    }
  }

  sparkBurst(x: number, y: number, count: number, tint = 0xfff1b0): void {
    if (this.dead) return;
    this.sparks.setParticleTint(tint);
    this.sparks.explode(count, x, y);
  }

  dustBurst(x: number, y: number, count: number, kind: 'dirt' | 'crust' | 'stone' = 'dirt'): void {
    if (this.dead) return;
    const tint = kind === 'dirt' ? hexToInt(DIRT.light[2]!) : kind === 'crust' ? hexToInt(CRUST.light) : hexToInt(BEDROCK.light);
    this.dust.setParticleTint(tint);
    this.dust.explode(count, x, y);
  }

  stoneBurst(x: number, y: number, count: number): void {
    if (this.dead) return;
    this.chunks.explode(count, x, y);
  }

  emberBurst(x: number, y: number, count: number): void {
    if (!this.dead) this.embers.explode(count, x, y);
  }

  dropBurst(x: number, y: number, count: number): void {
    if (!this.dead) this.drops.explode(count, x, y);
  }

  rockBurst(x: number, y: number, count: number): void {
    if (!this.dead) this.rocks.explode(count, x, y);
  }

  blueSparks(x: number, y: number, count: number): void {
    if (!this.dead) this.blue.explode(count, x, y);
  }

  greenSparks(x: number, y: number, count: number): void {
    if (!this.dead) this.green.explode(count, x, y);
  }

  glintBurst(x: number, y: number, count: number): void {
    if (!this.dead) this.glints.explode(count, x, y);
  }

  // ---- glows and one-off sprites ---------------------------------------------------------------------

  /** Soft additive light that blooms and fades. */
  glow(x: number, y: number, tint: number, fromScale: number, toScale: number, ms: number, alpha = 0.95): void {
    if (this.dead) return;
    const img = this.glowPool.pop() ?? this.newGlow();
    const base = this.c / this.m.glow;
    img.setPosition(x, y).setTint(tint).setAlpha(alpha).setScale(base * fromScale).setVisible(true).setActive(true);
    this.scene.tweens.add({
      targets: img,
      scale: base * toScale,
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => {
        img.setVisible(false).setActive(false);
        this.glowPool.push(img);
      },
    });
  }

  private newGlow(): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, A, K.GLOW).setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(img);
    return img;
  }

  /**
   * A pooled one-off sprite (null when the cap is reached: callers just skip the decoration). Release it with
   * `free` (or let `tweenOut` do it). Reset: origin 0.5, no tint, NORMAL blend, alpha 1, angle 0, scale = cell scale.
   */
  sprite(frame: string): Phaser.GameObjects.Image | null {
    if (this.dead || this.live >= MAX_SPRITES) return null;
    this.live++;
    let img = this.spritePool.pop();
    if (!img) {
      img = this.scene.add.image(0, 0, A, frame);
      this.layer.add(img);
    }
    img.setFrame(frame).setOrigin(0.5).clearTint().setBlendMode(Phaser.BlendModes.NORMAL).setAlpha(1).setAngle(0)
      .setScale(this.s).setVisible(true).setActive(true).setDepth(0);
    return img;
  }

  free(img: Phaser.GameObjects.Image): void {
    if (!img.active) return;
    this.scene.tweens.killTweensOf(img);
    img.setVisible(false).setActive(false);
    this.live = Math.max(0, this.live - 1);
    this.spritePool.push(img);
  }

  /** Expanding ring (FX_SHOCK_RING is 1.5 cells across). `toCells` = final diameter in cells. */
  shockRing(x: number, y: number, tint: number, fromCells: number, toCells: number, ms: number, delay = 0): void {
    const img = this.sprite(K.FX_SHOCK_RING);
    if (!img) return;
    const k = this.c / this.m.shockRing;
    img.setPosition(x, y).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(k * fromCells).setAlpha(0);
    this.scene.tweens.add({
      targets: img,
      scale: k * toCells,
      alpha: { from: 1, to: 0 },
      delay,
      duration: ms,
      ease: 'Cubic.easeOut',
      onComplete: () => this.free(img),
    });
  }

  /**
   * A flickering lightning bolt between two screen points (procedural; redrawn twice with new seeds, then
   * fades out). `tint` is the glow colour.
   */
  bolt(x1: number, y1: number, x2: number, y2: number, tint: number, ms = 240): void {
    if (this.dead) return;
    const g = this.boltPool.pop() ?? this.newBolt();
    const width = Math.max(1.5, this.c * 0.06);
    let seed = (Math.random() * 1e9) | 0;
    const draw = () => {
      g.clear();
      drawLightningBolt(g, x1, y1, x2, y2, seed++, { width, glow: tint });
    };
    draw();
    g.setAlpha(1).setVisible(true).setActive(true);
    const flick = { t: 0 };
    let last = 0;
    this.scene.tweens.add({
      targets: flick,
      t: 1,
      duration: ms,
      onUpdate: () => {
        if (flick.t - last > 0.22 && flick.t < 0.7) {
          last = flick.t;
          draw();
        }
        g.setAlpha(flick.t < 0.45 ? 1 : 1 - (flick.t - 0.45) / 0.55);
      },
      onComplete: () => {
        g.clear().setVisible(false).setActive(false);
        this.boltPool.push(g);
      },
    });
  }

  private newBolt(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(g);
    return g;
  }

  /** Floating text that rises and fades (e.g. "+1" moves). */
  floatText(x: number, y: number, s: string, sizePx: number, color = '#fff7e6'): void {
    if (this.dead) return;
    const t = this.textPool.pop() ?? this.newText();
    t.setStyle(textStyle(sizePx, { color, stroke: true }));
    t.setText(s).setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true).setActive(true);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - this.c * 1.1,
      alpha: 0,
      delay: 380,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => {
        t.setVisible(false).setActive(false);
        this.textPool.push(t);
      },
    });
  }

  private newText(): Phaser.GameObjects.Text {
    const t = this.scene.add.text(0, 0, '', textStyle(16)).setOrigin(0.5);
    this.layer.add(t);
    return t;
  }

  /** Camera shake in screen px, capped; all play cameras shake together. */
  shake(px: number, ms = 160): void {
    const amount = Math.min(px, this.c * 0.16);
    if (amount <= 0.5 || this.dead) return;
    for (const cam of this.cameras) {
      cam.shake(ms, new Phaser.Math.Vector2(amount / Math.max(1, cam.width), amount / Math.max(1, cam.height)), true);
    }
  }

  /** Freeze/unfreeze particles (relic hit-stop). */
  setFrozen(frozen: boolean): void {
    if (this.dead) return;
    for (const e of this.emitters) e.timeScale = frozen ? 0 : 1;
  }

  /** Live particles over all emitters (perf checks). */
  particleCount(): number {
    let n = 0;
    for (const e of this.emitters) n += e.getAliveParticleCount();
    return n;
  }

  /** Marks this instance as replaced (the layer that owns its objects is being destroyed). */
  destroy(): void {
    this.dead = true;
  }
}
