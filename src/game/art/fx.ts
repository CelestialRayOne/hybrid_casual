// Power VFX sprites (canvas painters for the atlas) plus a procedural lightning helper for Phaser Graphics.
import type Phaser from 'phaser';
import { GEM, EARTH, DIRT, type GemTone } from './palette';
import { type Ctx, type Pt, rng, mix, rgba, poly, lin, rad, sparkle } from './draw';
import { drillShape } from './powers';

// ---------- fire ----------

/** Soft flame (w x h, tip up). variant 0..2 changes the lean/shape for flicker. */
export function paintFlame(ctx: Ctx, w: number, h: number, variant: number): void {
  const lean = [0, 0.12, -0.1][variant % 3] as number;
  const tall = [1, 0.92, 1.04][variant % 3] as number;
  const cx = w / 2;
  const base = h * 0.94;
  const top = h * (1 - 0.92 * tall);
  const shape = (k: number): void => {
    const rx = (w / 2) * 0.92 * k;
    const by = base - (1 - k) * h * 0.08;
    const ty = by - (by - top) * k;
    ctx.beginPath();
    ctx.moveTo(cx + lean * w * k, ty);
    ctx.bezierCurveTo(cx + rx * 0.5 + lean * w * 0.5, ty + (by - ty) * 0.35, cx + rx, by - rx * 1.0, cx + rx, by - rx * 0.6);
    ctx.bezierCurveTo(cx + rx, by - rx * 0.1, cx + rx * 0.55, by, cx, by);
    ctx.bezierCurveTo(cx - rx * 0.55, by, cx - rx, by - rx * 0.1, cx - rx, by - rx * 0.6);
    ctx.bezierCurveTo(cx - rx, by - rx * 1.0, cx - rx * 0.4 + lean * w * 0.5, ty + (by - ty) * 0.35, cx + lean * w * k, ty);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = 'rgba(255,90,20,0.9)';
  ctx.shadowBlur = w * 0.18;
  shape(0.9);
  ctx.fillStyle = lin(ctx, 0, top, 0, base, [[0, 'rgba(255,60,30,0.0)'], [0.25, 'rgba(255,70,30,0.85)'], [0.7, '#ff7a1c'], [1, '#ffb43a']]);
  ctx.fill();
  ctx.restore();
  shape(0.62);
  ctx.fillStyle = lin(ctx, 0, top, 0, base, [[0, 'rgba(255,190,60,0)'], [0.4, '#ffc23a'], [1, '#ffe98a']]);
  ctx.fill();
  shape(0.34);
  ctx.fillStyle = lin(ctx, 0, top, 0, base, [[0, 'rgba(255,250,210,0)'], [0.5, '#fff6c8'], [1, '#ffffff']]);
  ctx.fill();
}

export function paintEmber(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h, [[0, '#ffffff'], [0.2, '#fff0a0'], [0.45, 'rgba(255,140,30,0.9)'], [1, 'rgba(255,60,20,0)']]);
  ctx.fillRect(0, 0, s, s);
}

// ---------- water ----------

export function paintWaterDrop(ctx: Ctx, w: number, h: number): void {
  const t = GEM[1] as GemTone;
  const r = w * 0.4;
  const cx = w / 2;
  const cy = h - r - h * 0.06;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.05);
    ctx.bezierCurveTo(cx + r * 0.3, cy - r * 1.1, cx + r, cy - r * 0.6, cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI, false);
    ctx.bezierCurveTo(cx - r, cy - r * 0.6, cx - r * 0.3, cy - r * 1.1, cx, h * 0.05);
    ctx.closePath();
  };
  path();
  ctx.lineWidth = Math.max(1, w * 0.07);
  ctx.strokeStyle = rgba(t.edge, 0.8);
  ctx.stroke();
  ctx.fillStyle = rad(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.1, r * 1.4, [[0, '#ffffff'], [0.3, t.light], [1, t.base]]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.2, r * 0.18, r * 0.36, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}

/** Horizontal water band, seamless at the left/right edges (one sine period per frame width). */
export function paintWaveStreak(ctx: Ctx, w: number, h: number): void {
  const t = GEM[1] as GemTone;
  const crest = (x: number, amp: number, ph: number): number => h * 0.34 + Math.sin((x / w) * Math.PI * 2 + ph) * amp;
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, crest(0, h * 0.06, 0));
    for (let x = 0; x <= w; x += Math.max(1, w / 24)) ctx.lineTo(x, crest(x, h * 0.06, 0));
    ctx.lineTo(w, crest(w, h * 0.06, 0));
    ctx.lineTo(w, h * 0.86);
    ctx.lineTo(0, h * 0.86);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = lin(ctx, 0, h * 0.26, 0, h * 0.9, [[0, rgba(t.light, 0.95)], [0.45, rgba(t.base, 0.85)], [0.85, rgba(t.dark, 0.55)], [1, rgba(t.dark, 0)]]);
  ctx.fill();
  // inner ripple lines
  ctx.lineWidth = Math.max(1, h * 0.035);
  ctx.strokeStyle = rgba('#ffffff', 0.45);
  for (const [y0, ph] of [[0.56, 1.6], [0.72, 3.4]] as Pt[]) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += Math.max(1, w / 24)) {
      const y = h * y0 + Math.sin((x / w) * Math.PI * 2 + ph) * h * 0.03;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // foam crest
  ctx.beginPath();
  for (let x = 0; x <= w; x += Math.max(1, w / 24)) {
    const y = crest(x, h * 0.06, 0);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = Math.max(2, h * 0.09);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineCap = 'butt';
  ctx.stroke();
  // spray blobs above the crest (positions repeat per width -> seamless)
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [fx, dy, r] of [[0.12, -0.1, 0.04], [0.3, -0.16, 0.03], [0.62, -0.12, 0.045], [0.82, -0.18, 0.028]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(fx * w, crest(fx * w, h * 0.06, 0) + dy * h, r * h, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- earth ----------

export function paintRock(ctx: Ctx, s: number, variant: number): void {
  const r = rng(91 + variant * 17);
  const band = EARTH[2 + (variant % 3)] ?? EARTH[2];
  if (!band) return;
  const n = 6 + (variant % 2);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const k = s * (0.34 + r() * 0.12);
    pts.push([s / 2 + Math.cos(a) * k, s / 2 + Math.sin(a) * k * 0.85]);
  }
  poly(ctx, pts);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.08);
  ctx.strokeStyle = DIRT.edge;
  ctx.stroke();
  ctx.fillStyle = lin(ctx, 0, 0, s, s, [[0, mix(band.top, '#fff0d8', 0.35)], [0.5, band.top], [1, band.line]]);
  ctx.fill();
  // lit facet
  const c: Pt = [s * 0.46, s * 0.46];
  poly(ctx, [pts[n - 2] as Pt, pts[n - 1] as Pt, pts[0] as Pt, c]);
  ctx.fillStyle = rgba('#fff4e0', 0.35);
  ctx.fill();
  poly(ctx, [pts[1] as Pt, pts[2] as Pt, pts[3] as Pt, c]);
  ctx.fillStyle = rgba(DIRT.edge, 0.3);
  ctx.fill();
}

// ---------- rings, sparks ----------

export function paintShockRing(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h, [
    [0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0.08)'], [0.8, 'rgba(255,255,255,0.75)'],
    [0.87, 'rgba(255,255,255,1)'], [0.93, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(0, 0, s, s);
}

export function paintColorSpark(ctx: Ctx, s: number, mid: string, outer: string): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h, [[0, '#ffffff'], [0.22, mid], [0.55, rgba(outer, 0.75)], [1, rgba(outer, 0)]]);
  ctx.fillRect(0, 0, s, s);
  sparkle(ctx, h, h, h * 0.9, 'rgba(255,255,255,0.85)', 0.12);
}

/** Rainbow-cored twinkle for geodes. */
export function paintGeodeGlint(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h * 0.7, [[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,170,240,0.45)'], [0.7, 'rgba(120,220,255,0.25)'], [1, 'rgba(120,220,255,0)']]);
  ctx.fillRect(0, 0, s, s);
  sparkle(ctx, h, h, h * 0.98, '#ffffff', 0.11);
  ctx.save();
  ctx.translate(h, h);
  ctx.rotate(Math.PI / 4);
  sparkle(ctx, 0, 0, h * 0.55, 'rgba(255,240,180,0.9)', 0.16);
  ctx.restore();
  const cols = ['#ff6a9a', '#ffd84a', '#5ff08f', '#5fb0ff', '#d68bff'];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(h + Math.cos(a) * h * 0.42, h + Math.sin(a) * h * 0.42, Math.max(0.8, s * 0.035), 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
}

// ---------- lightning ----------

/** Midpoint-displaced jagged polyline from a to b. */
export function boltPoints(x1: number, y1: number, x2: number, y2: number, seed: number, jag = 0.22, depth = 5): Pt[] {
  const r = rng(seed);
  let pts: Pt[] = [[x1, y1], [x2, y2]];
  let amp = Math.hypot(x2 - x1, y2 - y1) * jag;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0] as Pt];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i] as Pt;
      const b = pts[i + 1] as Pt;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const off = (r() - 0.5) * amp;
      next.push([(a[0] + b[0]) / 2 - (dy / l) * off, (a[1] + b[1]) / 2 + (dx / l) * off], b);
    }
    pts = next;
    amp *= 0.55;
  }
  return pts;
}

/** Stretchable bolt segment texture: endpoints at (0, h/2) and (w, h/2). Warm topaz glow, white core. */
export function paintBoltSegment(ctx: Ctx, w: number, h: number): void {
  const pts = boltPoints(h * 0.25, h / 2, w - h * 0.25, h / 2, 7, 0.14, 4).map(([x, y]) => [x, Math.max(h * 0.2, Math.min(h * 0.8, y))] as Pt);
  pts.unshift([0, h / 2]);
  pts.push([w, h / 2]);
  const t = GEM[3] as GemTone;
  const line = (): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [lw, col] of [[h * 0.5, rgba(t.glow, 0.18)], [h * 0.28, rgba(t.light, 0.45)], [h * 0.14, rgba('#fff6c0', 0.95)], [h * 0.06, '#ffffff']] as [number, string][]) {
    line();
    ctx.lineWidth = lw;
    ctx.strokeStyle = col;
    ctx.stroke();
  }
}

export interface BoltStyle {
  /** Core width in px (default 3). */
  width?: number;
  /** Glow colour (0xRRGGBB, default topaz glow). */
  glow?: number;
  /** Core colour (default white). */
  core?: number;
  /** Jaggedness relative to length (default 0.22). */
  jag?: number;
  /** Number of short side forks (default 2). */
  forks?: number;
  alpha?: number;
}

/**
 * Draw a lightning bolt into a Phaser Graphics object (procedural; a new `seed` gives a new shape).
 * Typical use: one Graphics per strike, redraw with a new seed every ~50 ms for flicker, fade out alpha.
 *   drawLightningBolt(g, x1, y1, x2, y2, seed, { width: cell * 0.06 })
 * Does NOT clear the graphics first.
 */
export function drawLightningBolt(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, seed: number, style: BoltStyle = {}): void {
  const w = style.width ?? 3;
  const glow = style.glow ?? 0xffd84a;
  const core = style.core ?? 0xffffff;
  const a = style.alpha ?? 1;
  const main = boltPoints(x1, y1, x2, y2, seed, style.jag ?? 0.22, 5);
  const r = rng(seed ^ 0x5bd1e995);
  const forks: Pt[][] = [];
  const nf = style.forks ?? 2;
  for (let i = 0; i < nf; i++) {
    const from = main[2 + Math.floor(r() * (main.length - 4))] as Pt;
    const ang = Math.atan2(y2 - y1, x2 - x1) + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6);
    const len = Math.hypot(x2 - x1, y2 - y1) * (0.15 + r() * 0.2);
    forks.push(boltPoints(from[0], from[1], from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len, seed + i * 31, 0.3, 3));
  }
  const stroke = (pts: Pt[], width: number, color: number, alpha: number): void => {
    g.lineStyle(width, color, alpha * a);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokePath();
  };
  for (const [k, col, al] of [[5, glow, 0.18], [2.6, glow, 0.5], [1, core, 1]] as [number, number, number][]) {
    stroke(main, w * k, col, al);
    for (const f of forks) stroke(f, w * k * 0.55, col, al);
  }
}

// ---------- drill ----------

/** Big drill head pointing down (w x 1.6w). */
export function paintDrillBit(ctx: Ctx, w: number, h: number): void {
  const t = GEM[4] as GemTone;
  ctx.save();
  ctx.shadowColor = 'rgba(30,10,0,0.45)';
  ctx.shadowBlur = w * 0.06;
  ctx.shadowOffsetY = w * 0.04;
  // unit space over a w x h box: scale y by h/w via a non-square unit
  const k = Math.min((w / 2) * 0.96 / 0.42, (h / 2) * 0.97 / 0.78);
  ctx.translate(w / 2, h / 2);
  ctx.scale(k, k);
  drillShape(ctx, Math.max(1.2, w * 0.03) / k, t.edge, { ...t, light: mix(t.light, '#ffffff', 0.35), base: t.light, dark: t.base });
  ctx.restore();
}
