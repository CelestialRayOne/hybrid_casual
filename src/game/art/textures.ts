// Generates every code-drawn board/UI/FX image with canvas 2D at the current cell size and packs
// them into ONE atlas texture (`ART_ATLAS`); each image is a named frame (names from keys.ts).
//   scene.add.image(x, y, ART_ATLAS, gemKey(2))
//   scene.add.nineslice(x, y, ART_ATLAS, PANEL, w, h, inset, inset, inset, inset)
//   particles: scene.add.particles(x, y, ART_ATLAS, { frame: [shardKey(0), SPARK], ... })
// One atlas key. At large cell sizes the frames do not fit one 2048x2048 page, so the atlas becomes a
// multi-page texture (several canvas sources under the same key; each Frame knows its page). Callers never
// see the split: `scene.add.image(x, y, ART_ATLAS, frame)` works for every frame. Pages are <= 2048x2048.
//
// Regeneration contract: frame names never contain the size. Calling `registerTextures` again with
// a new cellPx repaints the SAME atlas texture in place and updates each Frame object in place, so
// references stay valid. Game objects keep their old display size: after a resize call
// `obj.setFrame(name)` again (picks up the new frame size) or `setDisplaySize(...)`.
// Calling it with the same cellPx as last time is a no-op (cheap to call from every layout pass).
import Phaser from 'phaser';
import * as K from './keys';
import { ART_ATLAS } from './keys';
import type { Ctx } from './draw';
import { paintGem, paintShard, paintGeode } from './gems';
import { paintSlot, paintBoardFrame, paintDirt, paintCrust, paintBedrock } from './terrain';
import { paintRelic } from './relics';
import { paintPanel, paintButton, paintStar, paintIcon, paintPerk, paintSpark, paintDust, paintGlint, paintGlow, type IconId } from './ui';
import { paintBackground } from './background';
import { paintPowerToken, paintPip, paintArmedRing, paintReticle, paintTraySlot } from './powers';
import { paintFlame, paintEmber, paintWaterDrop, paintWaveStreak, paintRock, paintShockRing, paintColorSpark, paintGeodeGlint, paintBoltSegment, paintDrillBit } from './fx';
import { paintBoon, paintStackBubble, paintRelicSlot } from './boons';
import { paintPerkIcon, paintPerkNode, paintPerkPoint, paintReforgeToken, paintBossBadge, paintHardBadge, paintBossBanner, paintBossTile } from './perks';

/** Sizes (px) of every UI texture for a given cell size, plus nine-slice insets. */
export interface ArtMetrics {
  cell: number;
  /** Relic/crust 2x2 textures are 2*cell. */
  big: number;
  icon: number;
  perk: number;
  star: number;
  hand: number;
  panel: number;
  /** Nine-slice inset for panel / panel_dark (all four sides). */
  panelInset: number;
  boardFrame: number;
  /** Nine-slice inset for board_frame. */
  boardFrameInset: number;
  buttonW: number;
  buttonH: number;
  /** Nine-slice insets for button / button_pressed: left/right and top/bottom. */
  buttonInsetX: number;
  buttonInsetY: number;
  spark: number;
  shard: number;
  dust: number;
  glint: number;
  glow: number;
  // ---- v2 ----
  /** Power tray token (and tray_slot). */
  power: number;
  /** Power level pip. */
  pip: number;
  /** Armed ring around a token (= power * 1.4; token sits in the middle). */
  armedRing: number;
  /** Board reticle for an armed power (about 1.4 cells, centre it on the cell). */
  reticle: number;
  flameW: number;
  flameH: number;
  ember: number;
  dropW: number;
  dropH: number;
  /** fx_wave_streak: one cell wide. */
  waveW: number;
  waveH: number;
  rock: number;
  shockRing: number;
  boltW: number;
  boltH: number;
  drillW: number;
  drillH: number;
  /** HUD boon badge. */
  boon: number;
  /** Stack-count bubble. */
  bubble: number;
  /** Perks-screen node frame (icon goes on top at 0.7 of this). */
  perkNode: number;
  /** perk_point / reforge_token counter icons. */
  token: number;
  /** badge_boss / badge_hard. */
  badge: number;
  bossBannerW: number;
  bossBannerH: number;
  /** Horizontal nine-slice inset of boss_banner (left = right; top/bottom 0). */
  bossBannerInset: number;
  /** level_tile_boss is a square of this size; nine-slice it with `panelInset` like PANEL. */
  levelTile: number;
}

export function artMetrics(cellPx: number): ArtMetrics {
  const c = Math.max(16, Math.round(cellPx));
  const u = c;
  return {
    cell: c,
    big: c * 2,
    icon: Math.round(u * 0.9),
    perk: Math.round(u * 1.6),
    star: Math.round(u * 1.1),
    hand: Math.round(u * 1.5),
    panel: Math.round(u * 2),
    panelInset: Math.round(u * 0.6),
    boardFrame: Math.round(u * 3),
    boardFrameInset: Math.round(u * 0.9),
    buttonW: Math.round(u * 3),
    buttonH: Math.round(u * 1.2),
    buttonInsetX: Math.round(u * 0.6),
    buttonInsetY: Math.round(u * 0.5),
    spark: Math.max(8, Math.round(u * 0.32)),
    shard: Math.max(8, Math.round(u * 0.34)),
    dust: Math.max(8, Math.round(u * 0.45)),
    glint: Math.max(12, Math.round(u * 0.7)),
    glow: Math.round(u * 2),
    power: Math.round(u * 1.25),
    pip: Math.max(8, Math.round(u * 0.24)),
    armedRing: Math.round(u * 1.25 * 1.4),
    reticle: Math.round(u * 1.4),
    flameW: Math.max(10, Math.round(u * 0.6)),
    flameH: Math.max(13, Math.round(u * 0.8)),
    ember: Math.max(8, Math.round(u * 0.22)),
    dropW: Math.max(8, Math.round(u * 0.22)),
    dropH: Math.max(11, Math.round(u * 0.31)),
    waveW: c,
    waveH: Math.round(u * 0.9),
    rock: Math.max(8, Math.round(u * 0.36)),
    shockRing: Math.round(u * 1.5),
    boltW: Math.round(u * 2),
    boltH: Math.max(8, Math.round(u * 0.5)),
    drillW: c,
    drillH: Math.round(u * 1.4),
    boon: Math.round(u * 0.8),
    bubble: Math.max(10, Math.round(u * 0.42)),
    perkNode: Math.round(u * 2),
    token: Math.round(u * 0.9),
    badge: Math.round(u * 1.2),
    bossBannerW: Math.round(u * 6),
    bossBannerH: Math.round(u * 1.3),
    bossBannerInset: Math.round(u * 1.2),
    levelTile: Math.round(u * 2),
  };
}

interface Job { name: string; w: number; h: number; paint: (ctx: Ctx) => void; x: number; y: number; page: number }

/** Max page edge (keeps every GPU texture within the 2048 limit common on low-end mobile). */
const PAGE_MAX = 2048;

/** Create or redraw a standalone canvas texture (used for the large background). */
function put(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: Ctx) => void): void {
  const tm = scene.textures;
  let tex: Phaser.Textures.CanvasTexture | null = null;
  if (tm.exists(key)) {
    const t = tm.get(key);
    if (t instanceof Phaser.Textures.CanvasTexture) tex = t;
    else tm.remove(key);
  }
  if (!tex) {
    tex = tm.addCanvas(key, cpuCanvas(w, h));
    if (!tex) throw new Error(`art: could not create texture ${key}`);
  } else if (tex.width !== w || tex.height !== h) {
    tex.setSize(w, h);
  }
  const ctx = tex.context;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  paint(ctx);
  ctx.restore();
  tex.refresh();
}

/**
 * A canvas whose 2D context is CPU-backed (willReadFrequently). Gradient/shadow painting is cheap
 * there and the WebGL upload needs no GPU readback (measured several times faster on Chrome/D3D).
 */
function cpuCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true });
  return canvas;
}

/** Shelf-pack jobs (tallest first) into pages of a fixed width and at most PAGE_MAX tall. Returns page heights. */
function pack(jobs: Job[], width: number, pad: number): number[] {
  const order = [...jobs].sort((a, b) => b.h - a.h || b.w - a.w);
  const heights: number[] = [];
  let page = 0;
  let x = pad;
  let y = pad;
  let shelf = 0;
  for (const j of order) {
    if (x + j.w + pad > width) { x = pad; y += shelf + pad; shelf = 0; }
    if (y + j.h + pad > PAGE_MAX) {
      heights[page] = y + (x > pad ? shelf + pad : 0);
      page++;
      x = pad;
      y = pad;
      shelf = 0;
    }
    j.x = x;
    j.y = y;
    j.page = page;
    x += j.w + pad;
    shelf = Math.max(shelf, j.h);
  }
  heights[page] = y + shelf + pad;
  return heights.map((h) => Math.min(PAGE_MAX, Math.ceil(h / 4) * 4));
}

const isPow2 = (w: number, h: number): boolean => w > 0 && h > 0 && (w & (w - 1)) === 0 && (h & (h - 1)) === 0;

/** Timing of the last generation pass (dev diagnostics). */
export const genStats = { paintMs: 0, uploadMs: 0, count: 0, atlas: '', pages: 0 };

const lastSize = new WeakMap<Phaser.Textures.TextureManager, number>();

/** Generate (or regenerate at a new size) the art atlas. Returns generation time in ms. */
export function registerTextures(scene: Phaser.Scene, cellPx: number): number {
  const m = artMetrics(cellPx);
  if (lastSize.get(scene.textures) === m.cell) return 0;
  const t0 = performance.now();
  const s = m.cell;
  const jobs: Job[] = [];
  const job = (name: string, w: number, h: number, paint: (ctx: Ctx) => void): void => {
    jobs.push({ name, w: Math.ceil(w), h: Math.ceil(h), paint, x: 0, y: 0, page: 0 });
  };

  for (let g = 0; g < K.GEM_COUNT; g++) {
    job(K.gemKey(g), s, s, (ctx) => paintGem(ctx, s, g, false));
    job(K.gemGlowKey(g), s, s, (ctx) => paintGem(ctx, s, g, true));
    job(K.shardKey(g), m.shard, m.shard, (ctx) => paintShard(ctx, m.shard, g));
  }
  job(K.CELL_SLOT, s, s, (ctx) => paintSlot(ctx, s));
  job(K.BOARD_FRAME, m.boardFrame, m.boardFrame, (ctx) => paintBoardFrame(ctx, m.boardFrame, s));
  for (const hp of [1, 2, 3]) job(K.dirtKey(hp), s, s, (ctx) => paintDirt(ctx, s, hp));
  for (const hp of [1, 2]) {
    job(K.crustKey(hp), s, s, (ctx) => paintCrust(ctx, s, hp, 1));
    job(K.crustKey(hp, true), m.big, m.big, (ctx) => paintCrust(ctx, m.big, hp, 2));
  }
  for (let v = 0; v < K.RELIC_COUNT; v++) {
    job(K.relicKey(v), s, s, (ctx) => paintRelic(ctx, s, v));
    job(K.relicKey(v, true), m.big, m.big, (ctx) => paintRelic(ctx, m.big, v));
  }
  for (let mask = 0; mask < 16; mask++) job(K.bedrockTile(mask), s, s, (ctx) => paintBedrock(ctx, s, mask));

  job(K.SPARK, m.spark, m.spark, (ctx) => paintSpark(ctx, m.spark));
  job(K.DUST, m.dust, m.dust, (ctx) => paintDust(ctx, m.dust));
  job(K.GLINT, m.glint, m.glint, (ctx) => paintGlint(ctx, m.glint));
  job(K.GLOW, m.glow, m.glow, (ctx) => paintGlow(ctx, m.glow));

  job(K.PANEL, m.panel, m.panel, (ctx) => paintPanel(ctx, m.panel, s, false));
  job(K.PANEL_DARK, m.panel, m.panel, (ctx) => paintPanel(ctx, m.panel, s, true));
  job(K.BUTTON, m.buttonW, m.buttonH, (ctx) => paintButton(ctx, m.buttonW, m.buttonH, s, false));
  job(K.BUTTON_PRESSED, m.buttonW, m.buttonH, (ctx) => paintButton(ctx, m.buttonW, m.buttonH, s, true));
  job(K.STAR_FULL, m.star, m.star, (ctx) => paintStar(ctx, m.star, true));
  job(K.STAR_EMPTY, m.star, m.star, (ctx) => paintStar(ctx, m.star, false));

  const icons: [string, IconId][] = [
    [K.ICON_MOVES, 'moves'], [K.ICON_DEPTH, 'depth'], [K.ICON_RELIC, 'relic'],
    [K.ICON_SOUND_ON, 'sound_on'], [K.ICON_SOUND_OFF, 'sound_off'], [K.ICON_SETTINGS, 'settings'],
    [K.ICON_BACK, 'back'], [K.ICON_LEVELS, 'levels'], [K.LOCK, 'lock'],
    [K.ICON_RESTART, 'restart'], [K.ICON_BIN, 'bin'],
  ];
  for (const [key, id] of icons) job(key, m.icon, m.icon, (ctx) => paintIcon(ctx, m.icon, id));
  job(K.HAND, m.hand, m.hand, (ctx) => paintIcon(ctx, m.hand, 'hand'));
  const paths: K.PathId[] = ['jeweler', 'archaeologist', 'alchemist', 'blacksmith'];
  for (const p of paths) job(K.perkKey(p), m.perk, m.perk, (ctx) => paintPerk(ctx, m.perk, p));

  // ---- v2: powers ----
  for (let g = 0; g < K.GEM_COUNT; g++) {
    job(K.powerKey(g), m.power, m.power, (ctx) => paintPowerToken(ctx, m.power, g));
    job(K.geodeKey(g), s, s, (ctx) => paintGeode(ctx, s, g));
  }
  job(K.POWER_PIP_ON, m.pip, m.pip, (ctx) => paintPip(ctx, m.pip, true));
  job(K.POWER_PIP_OFF, m.pip, m.pip, (ctx) => paintPip(ctx, m.pip, false));
  job(K.POWER_ARMED_RING, m.armedRing, m.armedRing, (ctx) => paintArmedRing(ctx, m.armedRing));
  job(K.POWER_RETICLE, m.reticle, m.reticle, (ctx) => paintReticle(ctx, m.reticle));
  job(K.TRAY_SLOT, m.power, m.power, (ctx) => paintTraySlot(ctx, m.power));
  job(K.GEODE_GLINT, m.glint, m.glint, (ctx) => paintGeodeGlint(ctx, m.glint));
  // ---- v2: fx ----
  K.FX_FLAME_FRAMES.forEach((name, i) => job(name, m.flameW, m.flameH, (ctx) => paintFlame(ctx, m.flameW, m.flameH, i)));
  job(K.FX_EMBER, m.ember, m.ember, (ctx) => paintEmber(ctx, m.ember));
  job(K.FX_WATER_DROP, m.dropW, m.dropH, (ctx) => paintWaterDrop(ctx, m.dropW, m.dropH));
  job(K.FX_WAVE_STREAK, m.waveW, m.waveH, (ctx) => paintWaveStreak(ctx, m.waveW, m.waveH));
  K.FX_ROCK_FRAMES.forEach((name, i) => job(name, m.rock, m.rock, (ctx) => paintRock(ctx, m.rock, i)));
  job(K.FX_SHOCK_RING, m.shockRing, m.shockRing, (ctx) => paintShockRing(ctx, m.shockRing));
  job(K.FX_BOLT_SEGMENT, m.boltW, m.boltH, (ctx) => paintBoltSegment(ctx, m.boltW, m.boltH));
  job(K.FX_DRILL_BIT, m.drillW, m.drillH, (ctx) => paintDrillBit(ctx, m.drillW, m.drillH));
  job(K.FX_SPARK_BLUE, m.spark, m.spark, (ctx) => paintColorSpark(ctx, m.spark, '#bfe6ff', '#3f8cff'));
  job(K.FX_SPARK_GREEN, m.spark, m.spark, (ctx) => paintColorSpark(ctx, m.spark, '#d8ffd0', '#2fd06a'));
  // ---- v2: boons, goal slots ----
  for (let v = 0; v < K.RELIC_COUNT; v++) job(K.boonKey(v), m.boon, m.boon, (ctx) => paintBoon(ctx, m.boon, v));
  job(K.BOON_STACK_BUBBLE, m.bubble, m.bubble, (ctx) => paintStackBubble(ctx, m.bubble));
  job(K.RELIC_SLOT_EMPTY, s, s, (ctx) => paintRelicSlot(ctx, s, false));
  job(K.RELIC_SLOT_BONUS, s, s, (ctx) => paintRelicSlot(ctx, s, true));
  // ---- v2: perks screen, level badges ----
  for (const id of K.PERK_IDS) job(K.perkIconKey(id), m.perk, m.perk, (ctx) => paintPerkIcon(ctx, m.perk, id));
  job(K.PERK_NODE_OWNED, m.perkNode, m.perkNode, (ctx) => paintPerkNode(ctx, m.perkNode, 'owned'));
  job(K.PERK_NODE_AVAILABLE, m.perkNode, m.perkNode, (ctx) => paintPerkNode(ctx, m.perkNode, 'available'));
  job(K.PERK_NODE_LOCKED, m.perkNode, m.perkNode, (ctx) => paintPerkNode(ctx, m.perkNode, 'locked'));
  job(K.PERK_POINT, m.token, m.token, (ctx) => paintPerkPoint(ctx, m.token));
  job(K.REFORGE_TOKEN, m.token, m.token, (ctx) => paintReforgeToken(ctx, m.token));
  job(K.BADGE_BOSS, m.badge, m.badge, (ctx) => paintBossBadge(ctx, m.badge));
  job(K.BADGE_HARD, m.badge, m.badge, (ctx) => paintHardBadge(ctx, m.badge));
  job(K.BOSS_BANNER, m.bossBannerW, m.bossBannerH, (ctx) => paintBossBanner(ctx, m.bossBannerW, m.bossBannerH, m.bossBannerInset));
  job(K.LEVEL_TILE_BOSS, m.levelTile, m.levelTile, (ctx) => paintBossTile(ctx, m.levelTile, s));

  // pack into pages, paint, upload once per page
  const pad = 2;
  let width = s >= 80 ? 2048 : 1024;
  let heights = pack(jobs, width, pad);
  if (heights.length > 1 && width < PAGE_MAX) { width = PAGE_MAX; heights = pack(jobs, width, pad); }
  const p0 = performance.now();
  const tm = scene.textures;
  let tex: Phaser.Textures.Texture | null = tm.exists(ART_ATLAS) ? tm.get(ART_ATLAS) : null;
  if (tex && !tex.source.every((src) => src.isCanvas)) { tm.remove(ART_ATLAS); tex = null; }
  const canvases: HTMLCanvasElement[] = heights.map((h, i) => {
    const src = tex?.source[i];
    if (!src) return cpuCanvas(width, h);
    const cv = src.image as HTMLCanvasElement;
    if (cv.width !== width || cv.height !== h) {
      cv.width = width;
      cv.height = h;
      src.width = width;
      src.height = h;
      src.isPowerOf2 = isPow2(width, h);
    }
    return cv;
  });
  const ctxs = canvases.map((cv) => {
    const c = cv.getContext('2d') as Ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    return c;
  });
  for (const j of jobs) {
    const ctx = ctxs[j.page] as Ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(j.x, j.y, j.w, j.h);
    ctx.clip();
    ctx.translate(j.x, j.y);
    j.paint(ctx);
    ctx.restore();
  }
  const p1 = performance.now();
  if (!tex) {
    tex = tm.create(ART_ATLAS, canvases, width, heights[0] ?? 1);
    if (!tex) throw new Error('art: could not create atlas');
    // Texture() gives every source the width/height passed to create(); pages differ in height, and
    // frame UVs are computed from source size, so set each page's real size.
    tex.source.forEach((src, i) => {
      const cv = canvases[i] as HTMLCanvasElement;
      src.width = cv.width;
      src.height = cv.height;
      src.isPowerOf2 = isPow2(cv.width, cv.height);
    });
    tex.add('__BASE', 0, 0, 0, width, heights[0] ?? 1);
  } else {
    const t = tex;
    canvases.forEach((cv, i) => {
      const src = t.source[i];
      if (src) src.update();
      else t.source.push(new Phaser.Textures.TextureSource(t, cv, cv.width, cv.height));
    });
    // shrink pages no longer needed (no frame points at them any more)
    for (let i = canvases.length; i < t.source.length; i++) {
      const src = t.source[i];
      if (!src) continue;
      const cv = src.image as HTMLCanvasElement;
      if (cv.width > 4) { cv.width = 4; cv.height = 4; src.width = 4; src.height = 4; src.isPowerOf2 = true; src.update(); }
    }
    t.get('__BASE').setSize(width, heights[0] ?? 1, 0, 0);
  }
  for (const j of jobs) {
    if (tex.has(j.name)) {
      const f = tex.get(j.name);
      if (f.sourceIndex !== j.page) {
        f.sourceIndex = j.page;
        f.source = tex.source[j.page] as Phaser.Textures.TextureSource;
      }
      f.setSize(j.w, j.h, j.x, j.y);
    } else {
      tex.add(j.name, j.page, j.x, j.y, j.w, j.h);
    }
  }
  genStats.paintMs = p1 - p0;
  genStats.uploadMs = performance.now() - p1;
  genStats.count = jobs.length;
  genStats.pages = heights.length;
  genStats.atlas = heights.map((h) => `${width}x${h}`).join(' + ');

  lastSize.set(scene.textures, m.cell);
  return performance.now() - t0;
}

/**
 * Generate (or redraw in place) the strata backdrop texture `K.BACKGROUND` at width×height.
 * Call on resize and when the depth band changes, never per frame. Returns ms taken.
 */
export function drawStrataBackground(scene: Phaser.Scene, width: number, height: number, depthRows: number, cellPx = Math.min(width, height) / 9): number {
  const t0 = performance.now();
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  put(scene, K.BACKGROUND, w, h, (ctx) => paintBackground(ctx, w, h, depthRows, cellPx));
  return performance.now() - t0;
}
