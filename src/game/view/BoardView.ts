// Renders the level column and animates CoreEvents. Sprites live in the board layer in "board world" space
// (x = col * cell, y = row * cell over the WHOLE level column); a dedicated camera whose viewport is the board
// rect shows rows [viewScroll, viewScroll + 10), so scrolling is a camera tween and the viewport clips for free.
// After every action the scene calls `sync(state)`, which reconciles sprites with the core state, so the
// animations are cosmetic and can never leave the board out of step with the rules.
import Phaser from 'phaser';
import { COLUMNS, VISIBLE_ROWS, isStuckGem } from '../../core';
import type { Cell, CoreEvent, GemColor, LevelState, Pos, Relic } from '../../core';
import * as K from '../art/keys';
import type { ArtMetrics } from '../art/textures';
import type { Layout } from '../layout';
import { TIMING, fallDuration } from '../timeline';
import type { Fx } from './Fx';

const A = K.ART_ATLAS;

const DEPTH = { terrain: 1, relic: 2, crust: 3, gem: 4, lifted: 5 } as const;
const STUCK_TINT = 0x8a8a8a;

interface RelicSprites {
  icon: Phaser.GameObjects.Image;
  crust: Phaser.GameObjects.Image | null;
}

export class BoardView {
  /** Visual scroll in rows (fractional while the camera tweens). */
  viewScroll = 0;
  private readonly c: number;
  /** texture px -> screen px */
  private readonly s: number;
  private rows = 0;
  private gems: (Phaser.GameObjects.Image | null)[] = [];
  private dirt: (Phaser.GameObjects.Image | null)[] = [];
  private rock: (Phaser.GameObjects.Image | null)[] = [];
  private relics = new Map<number, RelicSprites>();
  private readonly free: Phaser.GameObjects.Image[] = [];
  private slots: Phaser.GameObjects.TileSprite | null = null;
  private highlighted: Pos[] = [];
  private scrollTween: Phaser.Tweens.Tween | null = null;
  private readonly peekItems: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly peekLayer: Phaser.GameObjects.Layer,
    readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly layout: Layout,
    private readonly m: ArtMetrics,
    private readonly fx: Fx,
  ) {
    this.c = layout.cell;
    this.s = layout.cell / m.cell;
  }

  // ---- coordinates -----------------------------------------------------------------------------------

  private wx(x: number): number {
    return x * this.c + this.c / 2;
  }

  private wy(y: number): number {
    return y * this.c + this.c / 2;
  }

  /** Screen (game px) centre of a level cell at the current visual scroll. */
  screen(x: number, y: number): { x: number; y: number } {
    const b = this.layout.board;
    return { x: b.x + this.wx(x), y: b.y + this.wy(y) - this.viewScroll * this.c };
  }

  private idx(x: number, y: number): number {
    return y * COLUMNS + x;
  }

  private setScroll(rows: number): void {
    this.viewScroll = rows;
    this.cam.setScroll(0, Math.round(rows * this.c * 100) / 100);
  }

  // ---- pooling ---------------------------------------------------------------------------------------

  private acquire(frame: string, depth: number): Phaser.GameObjects.Image {
    const img = this.free.pop();
    if (img) {
      img.setFrame(frame).setVisible(true).setActive(true);
      img.setAlpha(1).setAngle(0).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      img.setScale(this.s).setDepth(depth);
      return img;
    }
    const n = this.scene.add.image(0, 0, A, frame).setScale(this.s).setDepth(depth);
    this.layer.add(n);
    return n;
  }

  private release(img: Phaser.GameObjects.Image | null | undefined): void {
    if (!img) return;
    this.scene.tweens.killTweensOf(img);
    img.setVisible(false).setActive(false);
    this.free.push(img);
  }

  // ---- build / sync ----------------------------------------------------------------------------------

  build(state: LevelState): void {
    this.rows = state.grid.length;
    const n = this.rows * COLUMNS;
    this.gems = new Array<Phaser.GameObjects.Image | null>(n).fill(null);
    this.dirt = new Array<Phaser.GameObjects.Image | null>(n).fill(null);
    this.rock = new Array<Phaser.GameObjects.Image | null>(n).fill(null);
    this.slots?.destroy();
    const slotFrame = this.scene.textures.getFrame(A, K.CELL_SLOT);
    this.slots = this.scene.add.tileSprite(0, 0, COLUMNS * this.c, this.rows * this.c, A, K.CELL_SLOT).setOrigin(0, 0);
    this.slots.setTileScale(this.c / slotFrame.width, this.c / slotFrame.height);
    this.layer.add(this.slots);
    this.setScroll(state.scroll);
    this.sync(state);
  }

  /** Reconciles every sprite with the core state (frames, positions, tints). Cheap enough to run per action. */
  sync(state: LevelState): void {
    this.clearHighlight();
    for (let y = 0; y < this.rows; y++) {
      const row = state.grid[y] as Cell[];
      for (let x = 0; x < COLUMNS; x++) {
        const cell = row[x] as Cell;
        const i = this.idx(x, y);
        this.syncGem(state, cell, x, y, i);
        // dirt
        if (cell.kind === 'dirt') {
          const img = this.dirt[i] ?? this.acquire(K.dirtKey(cell.hp), DEPTH.terrain);
          this.scene.tweens.killTweensOf(img);
          img.setFrame(K.dirtKey(cell.hp)).setPosition(this.wx(x), this.wy(y)).setScale(this.s).setAlpha(1).setAngle(0);
          this.dirt[i] = img;
        } else if (this.dirt[i]) {
          this.release(this.dirt[i]);
          this.dirt[i] = null;
        }
        // bedrock
        if (cell.kind === 'bedrock') {
          const frame = K.bedrockTile(this.bedrockMask(state, x, y, cell.id));
          const img = this.rock[i] ?? this.acquire(frame, DEPTH.terrain);
          this.scene.tweens.killTweensOf(img);
          img.setFrame(frame).setPosition(this.wx(x), this.wy(y)).setScale(this.s).setAlpha(1).setAngle(0);
          this.rock[i] = img;
        } else if (this.rock[i]) {
          this.release(this.rock[i]);
          this.rock[i] = null;
        }
      }
    }
    for (const r of state.relics) this.syncRelic(r);
    this.scrollTween?.stop();
    this.scrollTween = null;
    this.setScroll(state.scroll);
  }

  private syncGem(state: LevelState, cell: Cell, x: number, y: number, i: number): void {
    if (cell.kind !== 'block') {
      if (this.gems[i]) {
        this.release(this.gems[i]);
        this.gems[i] = null;
      }
      return;
    }
    const frame = cell.geode ? K.geodeKey(cell.color) : K.gemKey(cell.color);
    const img = this.gems[i] ?? this.acquire(frame, DEPTH.gem);
    const tx = this.wx(x);
    const ty = this.wy(y);
    // A gem that just landed in the right cell keeps its landing squash (it starts when the fall ends, which is
    // exactly when the scene settles, so resetting it here would cut the squash off before it is ever seen).
    const landing =
      img.getData('landing') === true && img.getData('color') === cell.color && img.x === tx &&
      Math.abs(img.y - ty) <= this.c * 0.1 && this.scene.tweens.isTweening(img);
    if (!landing) {
      this.scene.tweens.killTweensOf(img);
      img.setPosition(tx, ty).setScale(this.s).setAngle(0);
    }
    img.setFrame(frame).setAlpha(1);
    img.setDepth(DEPTH.gem).setTintMode(Phaser.TintModes.MULTIPLY);
    img.setData('color', cell.color);
    img.setData('geode', cell.geode === true);
    const stuck = isStuckGem(state, x, y);
    img.setData('stuck', stuck);
    if (stuck) img.setTint(STUCK_TINT).setAlpha(0.8);
    else img.clearTint();
    this.gems[i] = img;
  }

  private syncRelic(r: Relic): void {
    let sp = this.relics.get(r.id);
    if (r.collected) {
      if (sp) {
        this.release(sp.icon);
        this.release(sp.crust);
        this.relics.delete(r.id);
      }
      return;
    }
    const big = r.size === 2;
    const cx = r.x * this.c + (this.c * r.size) / 2;
    const cy = r.y * this.c + (this.c * r.size) / 2;
    if (!sp) {
      sp = { icon: this.acquire(K.relicKey(r.variant, big), DEPTH.relic), crust: null };
      this.relics.set(r.id, sp);
    }
    sp.icon.setFrame(K.relicKey(r.variant, big)).setPosition(cx, cy).setScale(this.s).setAlpha(1);
    if (r.crust > 0) {
      const frame = K.crustKey(r.crust, big);
      sp.crust ??= this.acquire(frame, DEPTH.crust);
      this.scene.tweens.killTweensOf(sp.crust);
      sp.crust.setFrame(frame).setPosition(cx, cy).setScale(this.s).setAlpha(1).setAngle(0);
    } else if (sp.crust) {
      this.release(sp.crust);
      sp.crust = null;
    }
  }

  private bedrockMask(state: LevelState, x: number, y: number, id: number): number {
    const same = (dx: number, dy: number) => {
      const c = state.grid[y + dy]?.[x + dx];
      return c?.kind === 'bedrock' && c.id === id;
    };
    return (same(0, -1) ? K.BEDROCK_N : 0) | (same(1, 0) ? K.BEDROCK_E : 0) | (same(0, 1) ? K.BEDROCK_S : 0) | (same(-1, 0) ? K.BEDROCK_W : 0);
  }

  /** Relic outlines in the strip under the board for relics within `revealRows` below the visible window. */
  updatePeek(state: LevelState): void {
    for (const p of this.peekItems) p.destroy();
    this.peekItems.length = 0;
    const bottom = state.scroll + VISIBLE_ROWS;
    const peek = this.layout.peek;
    for (const r of state.relics) {
      if (r.collected || r.y < bottom || r.y >= bottom + state.rules.revealRows) continue;
      const dist = r.y - bottom; // 0 = just below the board
      const size = peek.h * (r.size === 2 ? 1.15 : 0.9);
      const x = this.layout.board.x + (r.x + r.size / 2) * this.c;
      const img = this.scene.add.image(x, peek.y + peek.h * 0.55, A, K.relicKey(r.variant, r.size === 2));
      img.setDisplaySize(size, size).setTint(0x4a2a16).setAlpha(Math.max(0.35, 0.85 - dist * 0.12));
      this.peekLayer.add(img);
      this.peekItems.push(img);
      this.scene.tweens.add({ targets: img, alpha: img.alpha * 0.6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ---- press feedback ----------------------------------------------------------------------------------

  highlight(state: LevelState, group: Pos[]): void {
    this.clearHighlight();
    for (const p of group) {
      const img = this.gems[this.idx(p.x, p.y)];
      const c = state.grid[p.y]?.[p.x];
      if (!img || c?.kind !== 'block') continue;
      img.setFrame(K.gemGlowKey(c.color)).setDepth(DEPTH.lifted).clearTint();
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({ targets: img, scale: this.s * 1.08, duration: 90, ease: 'Quad.easeOut' });
    }
    this.highlighted = group;
  }

  clearHighlight(): void {
    for (const p of this.highlighted) {
      const img = this.gems[this.idx(p.x, p.y)];
      if (!img) continue;
      const color = img.getData('color') as GemColor | undefined;
      if (color !== undefined) img.setFrame(img.getData('geode') ? K.geodeKey(color) : K.gemKey(color));
      if (img.getData('stuck')) img.setTint(STUCK_TINT);
      else img.clearTint();
      img.setDepth(DEPTH.gem);
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({ targets: img, scale: this.s, duration: 90, ease: 'Quad.easeOut' });
    }
    this.highlighted = [];
  }

  /** "No" wobble for a lone gem or an impossible action. */
  wobble(at: Pos): void {
    const img = this.gems[this.idx(at.x, at.y)];
    if (!img) return;
    this.scene.tweens.killTweensOf(img);
    img.setAngle(0).setScale(this.s);
    this.scene.tweens.add({
      targets: img,
      angle: { from: -11, to: 11 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => img.setAngle(0),
    });
  }

  /** Bottom-most visible point of a cell set (for the count bubble etc.). */
  groupTop(cells: Pos[]): { x: number; y: number } {
    let minY = Infinity;
    let sx = 0;
    let n = 0;
    for (const p of cells) minY = Math.min(minY, p.y);
    for (const p of cells) {
      if (p.y === minY) {
        sx += p.x;
        n++;
      }
    }
    return this.screen(sx / Math.max(1, n), minY);
  }

  centroid(cells: Pos[]): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (const p of cells) {
      sx += p.x;
      sy += p.y;
    }
    const n = Math.max(1, cells.length);
    return this.screen(sx / n, sy / n);
  }

  relicScreen(r: Relic): { x: number; y: number } {
    const b = this.layout.board;
    return {
      x: b.x + r.x * this.c + (this.c * r.size) / 2,
      y: b.y + r.y * this.c + (this.c * r.size) / 2 - this.viewScroll * this.c,
    };
  }

  // ---- event animation ---------------------------------------------------------------------------------

  /** Pops cleared gems with a ripple from `origin`. */
  popCells(cells: Pos[], color: GemColor, origin: Pos): void {
    const budget = 34;
    const perCell = Math.max(1, Math.min(4, Math.floor(budget / Math.max(1, cells.length))));
    const sparks = cells.length > 12 ? 0 : 1;
    for (const p of cells) {
      const i = this.idx(p.x, p.y);
      const img = this.gems[i];
      this.gems[i] = null;
      const d = Math.abs(p.x - origin.x) + Math.abs(p.y - origin.y);
      const delay = Math.min(TIMING.popStaggerMaxMs, d * TIMING.popStaggerMs);
      const pos = this.screen(p.x, p.y);
      this.scene.time.delayedCall(delay, () => this.fx.gemBurst(pos.x, pos.y, color, perCell, sparks));
      if (!img) continue;
      this.scene.tweens.killTweensOf(img);
      img.setDepth(DEPTH.lifted).setFrame(K.gemGlowKey(color)).clearTint();
      this.scene.tweens.add({
        targets: img,
        scale: this.s * 1.32,
        delay,
        duration: TIMING.popMs * 0.45,
        ease: 'Quad.easeOut',
        onStart: () => img.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff),
      });
      this.scene.tweens.add({
        targets: img,
        scale: this.s * 0.4,
        alpha: 0,
        delay: delay + TIMING.popMs * 0.45,
        duration: TIMING.popMs * 0.55,
        ease: 'Quad.easeIn',
        onComplete: () => this.release(img),
      });
    }
  }

  apply(state: LevelState, e: CoreEvent, ctx: { origin: Pos }): void {
    switch (e.type) {
      case 'cleared':
        this.popCells(e.cells, e.color, ctx.origin);
        this.fx.shake(e.size >= 5 ? this.c * 0.02 * (e.size - 3) : 0, 140 + Math.min(120, e.size * 8));
        break;
      case 'dirtDamaged':
        this.damageDirt(e.at, e.hp);
        break;
      case 'bedrockShattered':
        this.shatterBedrock(e.cells);
        break;
      case 'crustChipped':
        this.chipCrust(state, e.relicId, e.crust);
        break;
      case 'fell':
        this.fall(e.moves);
        break;
      case 'recoloured':
        this.recolour(e.cells, e.color);
        break;
      case 'shuffled':
        this.shuffle(e.cells);
        break;
      default:
        break;
    }
  }

  private damageDirt(at: Pos, hp: number): void {
    const i = this.idx(at.x, at.y);
    const img = this.dirt[i];
    const pos = this.screen(at.x, at.y);
    if (hp > 0) {
      if (img) {
        img.setFrame(K.dirtKey(hp));
        this.scene.tweens.killTweensOf(img);
        img.setPosition(this.wx(at.x), this.wy(at.y));
        this.scene.tweens.add({ targets: img, x: this.wx(at.x) + this.c * 0.05, duration: 35, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
      }
      this.fx.dustBurst(pos.x, pos.y, 4, 'dirt');
      return;
    }
    this.dirt[i] = null;
    this.fx.dustBurst(pos.x, pos.y, 10, 'dirt');
    if (img) {
      this.scene.tweens.add({ targets: img, scale: this.s * 1.18, alpha: 0, duration: 170, ease: 'Quad.easeOut', onComplete: () => this.release(img) });
    }
  }

  private shatterBedrock(cells: Pos[]): void {
    let k = 0;
    for (const p of cells) {
      const i = this.idx(p.x, p.y);
      const img = this.rock[i];
      this.rock[i] = null;
      const pos = this.screen(p.x, p.y);
      this.fx.stoneBurst(pos.x, pos.y, 5);
      this.fx.rockBurst(pos.x, pos.y, 4);
      this.fx.dustBurst(pos.x, pos.y, 6, 'stone');
      if (!img) continue;
      const dir = (k++ % 2 === 0 ? -1 : 1) * (0.4 + (k % 3) * 0.25);
      img.setDepth(DEPTH.lifted);
      this.scene.tweens.add({
        targets: img,
        x: img.x + dir * this.c * 0.9,
        y: img.y - this.c * 0.35,
        angle: dir * 70,
        alpha: 0,
        scale: this.s * 0.55,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => this.release(img),
      });
    }
    this.fx.shake(this.c * 0.14, 260);
    const mid = cells.reduce((a, p) => ({ x: a.x + p.x / cells.length, y: a.y + p.y / cells.length }), { x: 0, y: 0 });
    const m = this.screen(mid.x, mid.y);
    this.fx.glow(m.x, m.y, 0xd8e4ff, 0.6, 2.4, 380, 0.7);
  }

  private chipCrust(state: LevelState, relicId: number, crust: number): void {
    const r = state.relics.find((q) => q.id === relicId);
    const sp = this.relics.get(relicId);
    if (!r || !sp) return;
    const pos = this.relicScreen(r);
    if (crust > 0 && sp.crust) {
      sp.crust.setFrame(K.crustKey(crust, r.size === 2));
      this.scene.tweens.killTweensOf(sp.crust);
      sp.crust.setScale(this.s);
      this.scene.tweens.add({ targets: sp.crust, scale: this.s * 1.1, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
      this.fx.dustBurst(pos.x, pos.y, 6, 'crust');
      this.fx.sparkBurst(pos.x, pos.y, 3, 0xffe07a);
      return;
    }
    if (sp.crust) {
      const cr = sp.crust;
      sp.crust = null;
      this.scene.tweens.add({ targets: cr, scale: this.s * 1.3, alpha: 0, duration: 180, ease: 'Quad.easeOut', onComplete: () => this.release(cr) });
    }
    this.fx.dustBurst(pos.x, pos.y, 12 * r.size, 'crust');
  }

  /** Hit-stop frame of a relic reveal: the relic flashes white while everything is frozen. */
  relicFlash(relicId: number): void {
    const sp = this.relics.get(relicId);
    if (!sp) return;
    sp.icon.setDepth(DEPTH.lifted + 2).setTintMode(Phaser.TintModes.FILL).setTint(0xfff6d0);
  }

  /** Detaches the relic sprite from the board (the scene flies a copy to the HUD). */
  takeRelic(relicId: number): void {
    const sp = this.relics.get(relicId);
    if (!sp) return;
    this.release(sp.icon);
    this.release(sp.crust);
    this.relics.delete(relicId);
  }

  private fall(moves: { from: Pos; to: Pos }[]): void {
    const moving: { img: Phaser.GameObjects.Image; to: Pos; rows: number }[] = [];
    for (const mv of moves) {
      const i = this.idx(mv.from.x, mv.from.y);
      const img = this.gems[i];
      this.gems[i] = null;
      if (img) moving.push({ img, to: mv.to, rows: mv.to.y - mv.from.y });
    }
    for (const mv of moving) {
      this.gems[this.idx(mv.to.x, mv.to.y)] = mv.img;
      const img = mv.img;
      this.scene.tweens.killTweensOf(img);
      img.setScale(this.s).setAngle(0);
      const ty = this.wy(mv.to.y);
      this.scene.tweens.add({
        targets: img,
        y: ty,
        duration: fallDuration(mv.rows),
        ease: 'Quad.easeIn',
        onComplete: () => {
          // Squash on landing, anchored to the bottom of the cell.
          img.setData('landing', true);
          this.scene.tweens.add({
            targets: img,
            scaleX: this.s * 1.12,
            scaleY: this.s * 0.86,
            y: ty + this.c * 0.07,
            duration: TIMING.landSquashMs / 2,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => {
              img.setData('landing', false);
              img.setScale(this.s).setY(ty);
            },
            onStop: () => img.setData('landing', false),
          });
        },
      });
    }
  }

  private recolour(cells: Pos[], color: GemColor): void {
    for (const p of cells) {
      const img = this.gems[this.idx(p.x, p.y)];
      if (!img) continue;
      const pos = this.screen(p.x, p.y);
      this.scene.tweens.add({
        targets: img,
        scaleX: 0,
        duration: 100,
        ease: 'Quad.easeIn',
        onComplete: () => {
          img.setFrame(img.getData('geode') ? K.geodeKey(color) : K.gemKey(color)).setData('color', color);
          this.fx.sparkBurst(pos.x, pos.y, 4, 0xd68bff);
          this.scene.tweens.add({ targets: img, scaleX: this.s, duration: 130, ease: 'Back.easeOut' });
        },
      });
    }
  }

  private shuffle(cells: { at: Pos; color: GemColor }[]): void {
    cells.forEach((cl, n) => {
      const img = this.gems[this.idx(cl.at.x, cl.at.y)];
      if (!img) return;
      this.scene.tweens.add({
        targets: img,
        scale: this.s * 0.2,
        angle: 180,
        delay: (n % 8) * 12,
        duration: 170,
        ease: 'Quad.easeIn',
        onComplete: () => {
          img.setFrame(img.getData('geode') ? K.geodeKey(cl.color) : K.gemKey(cl.color)).setData('color', cl.color).clearTint();
          this.scene.tweens.add({ targets: img, scale: this.s, angle: 360, duration: 200, ease: 'Back.easeOut', onComplete: () => img.setAngle(0) });
        },
      });
    });
  }

  /** Smooth camera scroll to `rows` over `ms`; `onRow` fires per whole row passed (depth meter ticks). */
  scrollTo(rows: number, ms: number): void {
    this.scrollTween?.stop();
    const from = this.viewScroll;
    const counter = { v: from };
    this.scrollTween = this.scene.tweens.add({
      targets: counter,
      v: rows,
      duration: ms,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.setScroll(counter.v),
      onComplete: () => {
        this.setScroll(rows);
        this.scrollTween = null;
      },
    });
  }

  // ---- power support ----------------------------------------------------------------------------------

  /** World (board-camera) centre of a cell. */
  world(x: number, y: number): { x: number; y: number } {
    return { x: this.wx(x), y: this.wy(y) };
  }

  /** Detaches the gem sprite at `at` for a custom animation (the caller must `recycle` it). */
  takeGem(at: Pos): Phaser.GameObjects.Image | null {
    const i = this.idx(at.x, at.y);
    const img = this.gems[i] ?? null;
    this.gems[i] = null;
    if (img) {
      this.scene.tweens.killTweensOf(img);
      img.setDepth(DEPTH.lifted).setAngle(0).setScale(this.s).setPosition(this.wx(at.x), this.wy(at.y));
    }
    return img;
  }

  recycle(img: Phaser.GameObjects.Image): void {
    this.release(img);
  }

  /** Earthshaker: a gem in the shaken area rattles in place (it is not destroyed). */
  rattle(at: Pos, delay: number): void {
    const img = this.gems[this.idx(at.x, at.y)];
    if (!img) return;
    const x0 = this.wx(at.x);
    this.scene.tweens.add({
      targets: img,
      x: { from: x0 - this.c * 0.06, to: x0 + this.c * 0.06 },
      angle: { from: -6, to: 6 },
      delay,
      duration: 45,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => img.setX(x0).setAngle(0),
      onStop: () => img.setX(x0).setAngle(0),
    });
  }

  /** Short shake of a dirt / relic / bedrock sprite (Earthshaker, Drill). */
  rattleTerrain(at: Pos, delay: number): void {
    const i = this.idx(at.x, at.y);
    const img = this.dirt[i] ?? this.rock[i];
    if (!img) return;
    const x0 = this.wx(at.x);
    this.scene.tweens.add({ targets: img, x: { from: x0 - this.c * 0.05, to: x0 + this.c * 0.05 }, delay, duration: 40, yoyo: true, repeat: 2, onComplete: () => img.setX(x0) });
  }

  /** Visible geode gems (screen centres), for the periodic glint. */
  geodeScreens(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const top = Math.floor(this.viewScroll);
    for (let y = top; y < Math.min(this.rows, top + VISIBLE_ROWS); y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const img = this.gems[this.idx(x, y)];
        if (img && img.visible && img.getData('geode')) out.push(this.screen(x, y));
      }
    }
    return out;
  }

  destroy(): void {
    this.scrollTween?.stop();
    for (const p of this.peekItems) p.destroy();
    this.peekItems.length = 0;
  }
}
