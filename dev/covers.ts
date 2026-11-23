// Dev-only store covers: http://localhost:5173/dev/covers.html
// Renders the three CrazyGames covers (landscape 1920x1080, portrait 800x1200, square 800x800) from the game's own
// code-drawn art: earth strata, a dig hole bursting with light, a relic rising out of it, gems flying outward and
// the title. Only text allowed on covers is the game name (docs.crazygames.com/requirements/game-covers/).
// `window.renderCover(kind)` returns a PNG data URL (used by the export script).
import { paintBackground } from '../src/game/art/background';
import { paintGem, paintShard } from '../src/game/art/gems';
import { paintRelic } from '../src/game/art/relics';
import { paintRock } from '../src/game/art/fx';
import { paintSpark } from '../src/game/art/ui';
import { GAME_TITLE } from '../src/game/config';

type Ctx = CanvasRenderingContext2D;
type Kind = 'landscape' | 'portrait' | 'square';

const SIZES: Record<Kind, [number, number]> = { landscape: [1920, 1080], portrait: [800, 1200], square: [800, 800] };

/** Per-format composition: burst centre (fractions of w/h), art unit (fraction of min side), horizontal spread. */
const LAYOUT: Record<Kind, { cx: number; cy: number; unit: number; spread: number; titleY: number; titleW: number; lines: 1 | 2 }> = {
  landscape: { cx: 0.5, cy: 0.66, unit: 0.25, spread: 1.75, titleY: 0.19, titleW: 0.62, lines: 1 },
  portrait: { cx: 0.5, cy: 0.66, unit: 0.34, spread: 0.62, titleY: 0.17, titleW: 0.86, lines: 2 },
  square: { cx: 0.5, cy: 0.66, unit: 0.28, spread: 0.78, titleY: 0.16, titleW: 0.84, lines: 1 },
};

/** Flying gems: offset (in units from the burst centre), size, colour, rotation, glow. Mirrored-ish, hand placed. */
const GEMS: [number, number, number, number, number, boolean][] = [
  [-1.55, -0.55, 0.62, 0, -0.35, true],
  [1.5, -0.65, 0.66, 1, 0.3, true],
  [-0.95, -1.25, 0.48, 3, 0.2, false],
  [0.95, -1.3, 0.5, 2, -0.25, false],
  [-2.35, -1.15, 0.4, 4, 0.5, false],
  [2.4, -1.1, 0.42, 3, -0.45, false],
  [-2.2, 0.15, 0.46, 2, -0.15, true],
  [2.25, 0.1, 0.48, 0, 0.2, true],
  [-0.3, -1.75, 0.36, 1, 0.6, false],
  [0.45, -1.85, 0.32, 4, -0.5, false],
  [-3.1, -0.45, 0.34, 1, 0.3, false],
  [3.15, -0.5, 0.34, 4, -0.2, false],
];

function sprite(size: number, paint: (c: Ctx, s: number) => void): HTMLCanvasElement {
  const s = Math.max(2, Math.round(size));
  const c = document.createElement('canvas');
  c.width = c.height = s;
  paint(c.getContext('2d') as Ctx, s);
  return c;
}

function drawCentered(ctx: Ctx, img: HTMLCanvasElement, x: number, y: number, rot = 0, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Deterministic pseudo-random (so re-exports are identical). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function drawTitle(ctx: Ctx, w: number, h: number, L: (typeof LAYOUT)[Kind]): void {
  const lines = L.lines === 2 ? GAME_TITLE.toUpperCase().split(' ') : [GAME_TITLE.toUpperCase()];
  const font = (px: number) => `${px}px "Lilita One", "Arial Black", sans-serif`;
  // Fit the widest line to titleW.
  let px = 400;
  ctx.font = font(px);
  const widest = Math.max(...lines.map((s) => ctx.measureText(s).width));
  px = Math.floor((px * w * L.titleW) / widest);
  px = Math.min(px, h * (L.lines === 2 ? 0.17 : 0.2));
  ctx.font = font(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = px * 0.95;
  const top = h * L.titleY - ((lines.length - 1) * lh) / 2;
  lines.forEach((s, i) => {
    const x = w / 2;
    const y = top + i * lh;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.035);
    // Soft drop shadow, then a thick dark outline, a gold body with a light top, and a thin bright rim.
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(30,10,0,0.6)';
    ctx.shadowBlur = px * 0.12;
    ctx.shadowOffsetY = px * 0.08;
    ctx.lineWidth = px * 0.2;
    ctx.strokeStyle = '#3a1d0a';
    ctx.strokeText(s, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = px * 0.11;
    ctx.strokeStyle = '#7a3e12';
    ctx.strokeText(s, 0, 0);
    const g = ctx.createLinearGradient(0, -px * 0.45, 0, px * 0.45);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.35, '#ffd65a');
    g.addColorStop(0.7, '#f29a1e');
    g.addColorStop(1, '#d8650c');
    ctx.fillStyle = g;
    ctx.fillText(s, 0, 0);
    ctx.lineWidth = Math.max(1.5, px * 0.018);
    ctx.strokeStyle = 'rgba(255,250,225,0.85)';
    ctx.strokeText(s, 0, -px * 0.01);
    ctx.restore();
  });
}

export function renderCover(kind: Kind): HTMLCanvasElement {
  const [w, h] = SIZES[kind];
  const L = LAYOUT[kind];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as Ctx;
  const u = Math.min(w, h) * L.unit;
  const cx = w * L.cx;
  const cy = h * L.cy;
  const r = rng(7);

  // Earth backdrop (a few strata deep), warmed towards the burst and darkened at the edges.
  paintBackground(ctx, w, h, 14, Math.min(w, h) / 10);
  const edge = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.2, cx, cy, Math.max(w, h) * 0.8);
  edge.addColorStop(0, 'rgba(40,16,4,0)');
  edge.addColorStop(1, 'rgba(40,16,4,0.55)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  // Light rays bursting up out of the hole.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (i - 6.5) * 0.2 + (r() - 0.5) * 0.08;
    const len = u * (3 + r() * 1.6);
    const half = 0.045 + r() * 0.04;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.addColorStop(0, 'rgba(255,230,150,0.38)');
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - half) * len, cy + Math.sin(a - half) * len);
    ctx.lineTo(cx + Math.cos(a + half) * len, cy + Math.sin(a + half) * len);
    ctx.closePath();
    ctx.fill();
  }
  radial(ctx, cx, cy - u * 0.4, u * 2.2, [[0, 'rgba(255,240,190,0.45)'], [0.35, 'rgba(255,190,80,0.28)'], [1, 'rgba(255,160,40,0)']]);
  ctx.restore();

  // The dig hole: a dark crater with a glowing inside and broken rock around the rim.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + u * 0.55, u * 1.25, u * 0.38, 0, 0, Math.PI * 2);
  const hole = ctx.createRadialGradient(cx, cy + u * 0.5, 0, cx, cy + u * 0.55, u * 1.25);
  hole.addColorStop(0, '#ffe7a0');
  hole.addColorStop(0.35, '#e98a2a');
  hole.addColorStop(0.75, '#5a2a10');
  hole.addColorStop(1, '#2a1206');
  ctx.fillStyle = hole;
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.2;
    const front = Math.sin(a) > 0;
    if (front && i % 2 === 0) continue;
    const rx = cx + Math.cos(a) * u * (1.25 + r() * 0.12);
    const ry = cy + u * 0.55 + Math.sin(a) * u * (0.4 + r() * 0.06);
    const rock = sprite(u * (front ? 0.34 : 0.28) * (0.8 + r() * 0.4), (k, s) => paintRock(k, s, i % 3));
    drawCentered(ctx, rock, rx, ry, r() * Math.PI * 2);
  }

  // The relic rising out of the hole.
  const relic = sprite(u * 1.55, (k, s) => paintRelic(k, s, 1));
  drawCentered(ctx, relic, cx, cy - u * 0.15);

  // A pile of gems spilling over the front rim of the hole.
  const PILE: [number, number, number][] = [[-1.05, 0.62, 0], [-0.6, 0.86, 3], [-0.12, 0.98, 1], [0.38, 0.9, 2], [0.85, 0.7, 4], [-0.35, 0.68, 2], [0.15, 0.72, 0], [0.62, 0.52, 3]];
  PILE.forEach(([dx, dy, color], i) => {
    drawCentered(ctx, sprite(u * (0.5 + 0.08 * ((i * 7) % 3)), (k, s) => paintGem(k, s, color, i % 3 === 0)), cx + dx * u, cy + dy * u, (r() - 0.5) * 0.6);
  });

  // Flying gems with soft motion trails back towards the hole, plus shards and sparks.
  const spark = sprite(u * 0.2, (k, s) => paintSpark(k, s));
  for (const [dx, dy, size, color, rot, glow] of GEMS) {
    const gs = size * 1.35;
    const gx = cx + dx * u * L.spread;
    const gy = cy + dy * u;
    // Keep every gem fully inside the cover.
    if (gx - u * gs * 0.5 < 0 || gx + u * gs * 0.5 > w) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tx = cx + (gx - cx) * 0.55;
    const ty = cy + (gy - cy) * 0.55;
    const tg = ctx.createLinearGradient(gx, gy, tx, ty);
    tg.addColorStop(0, 'rgba(255,245,210,0.35)');
    tg.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.strokeStyle = tg;
    ctx.lineCap = 'round';
    ctx.lineWidth = u * gs * 0.45;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
    if (glow) radial(ctx, gx, gy, u * gs * 0.9, [[0, 'rgba(255,255,230,0.5)'], [1, 'rgba(255,255,230,0)']]);
    drawCentered(ctx, sprite(u * gs, (k, s) => paintGem(k, s, color, glow)), gx, gy, rot);
  }
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const d = u * (0.8 + r() * 2.2);
    const sx = cx + Math.cos(a) * d * L.spread;
    const sy = cy + Math.sin(a) * d * 0.8;
    drawCentered(ctx, sprite(u * (0.14 + r() * 0.12), (k, s) => paintShard(k, s, i % 5)), sx, sy, r() * Math.PI * 2);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.8;
    const d = u * (0.4 + r() * 2.6);
    drawCentered(ctx, spark, cx + Math.cos(a) * d * L.spread, cy + Math.sin(a) * d * 0.85, 0, 0.35 + r() * 0.5);
  }
  ctx.restore();

  drawTitle(ctx, w, h, L);
  return c;
}

declare global {
  interface Window {
    renderCover?: (kind: Kind) => string;
    coversReady?: boolean;
  }
}

async function main(): Promise<void> {
  try {
    await document.fonts.load('100px "Lilita One"');
  } catch {
    // Offline: the fallback font is used.
  }
  for (const kind of Object.keys(SIZES) as Kind[]) {
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    const [w, h] = SIZES[kind];
    cap.textContent = `${kind} ${w}x${h}`;
    const c = renderCover(kind);
    c.style.width = `${kind === 'landscape' ? 960 : 400}px`;
    fig.append(cap, c);
    document.body.append(fig);
  }
  window.renderCover = (kind) => renderCover(kind).toDataURL('image/png');
  window.coversReady = true;
}

void main();
