// Small canvas-2D helpers shared by the painters. No Phaser here.

export type Ctx = CanvasRenderingContext2D;
export type Pt = readonly [number, number];

/** Deterministic PRNG (mulberry32) so generated art is identical every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear mix of two '#rrggbb' colours, t in 0..1. */
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  const k = Math.max(0, Math.min(1, t));
  const c = ca.map((v, i) => Math.round(v + ((cb[i] ?? 0) - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function poly(ctx: Ctx, pts: readonly Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Polygon with rounded corners (radius r) through the given vertices. */
export function roundPoly(ctx: Ctx, pts: readonly Pt[], r: number): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n] as Pt;
    const p1 = pts[i] as Pt;
    const p2 = pts[(i + 1) % n] as Pt;
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    ctx.arcTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, r);
  }
  ctx.closePath();
}

export function star(ctx: Ctx, cx: number, cy: number, points: number, outer: number, inner: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Linear gradient helper. stops: [offset, colour][] */
export function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: readonly [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function rad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: readonly [number, string][], x1 = x, y1 = y): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Four-point sparkle star (glints). */
export function sparkle(ctx: Ctx, cx: number, cy: number, r: number, color: string, thin = 0.18): void {
  ctx.beginPath();
  const t = r * thin;
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + t, cy - t, cx + r, cy);
  ctx.quadraticCurveTo(cx + t, cy + t, cx, cy + r);
  ctx.quadraticCurveTo(cx - t, cy + t, cx - r, cy);
  ctx.quadraticCurveTo(cx - t, cy - t, cx, cy - r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Fill the current path with a soft drop shadow, then clear the shadow state. */
export function withShadow(ctx: Ctx, color: string, blur: number, dx: number, dy: number, fn: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = dx;
  ctx.shadowOffsetY = dy;
  fn();
  ctx.restore();
}

/** Jagged crack polylines (main + branches) from (x,y) heading `angle`. Draw with `strokeLines`. */
export function crackLines(r: () => number, x: number, y: number, angle: number, len: number, segs: number, branch: number, out: Pt[][] = []): Pt[][] {
  const pts: Pt[] = [[x, y]];
  out.push(pts);
  let cx = x;
  let cy = y;
  let a = angle;
  const step = len / segs;
  for (let i = 0; i < segs; i++) {
    a += (r() - 0.5) * 1.1;
    cx += Math.cos(a) * step;
    cy += Math.sin(a) * step;
    pts.push([cx, cy]);
    if (branch > 0 && i > 0 && r() < 0.4) {
      crackLines(r, cx, cy, a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.5), len * 0.45, Math.max(2, segs >> 1), branch - 1, out);
    }
  }
  return out;
}

export function strokeLines(ctx: Ctx, lines: readonly (readonly Pt[])[], dx = 0, dy = 0): void {
  ctx.beginPath();
  for (const pts of lines) pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px + dx, py + dy) : ctx.lineTo(px + dx, py + dy)));
  ctx.stroke();
}

let scratchCanvas: HTMLCanvasElement | null = null;
/** Shared cleared scratch canvas of at least sizexsize (single-threaded use only). */
export function scratch(w: number, h = w): HTMLCanvasElement {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas');
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = w;
    scratchCanvas.height = h;
  } else {
    (scratchCanvas.getContext('2d') as Ctx).clearRect(0, 0, w, h);
  }
  return scratchCanvas;
}
