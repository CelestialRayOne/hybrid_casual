// Six original relic icons (gold + jewels): sun coin, chalice, compass, star amulet, ancient key, jewelled ring.
import { GOLD, GEM, type GemTone } from './palette';
import { type Ctx, type Pt, mix, rgba, poly, lin, rad, star, sparkle, roundRect, scratch } from './draw';

type PathFn = () => void;

/** Gold-material fill of a path in unit space, with outline and top sheen. */
export function gild(ctx: Ctx, path: PathFn, lw: number, tone: 'gold' | 'deep' = 'gold'): void {
  path();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = GOLD.edge;
  ctx.stroke();
  const top = tone === 'gold' ? GOLD.light : GOLD.base;
  const mid = tone === 'gold' ? GOLD.base : GOLD.dark;
  ctx.fillStyle = lin(ctx, -0.6, -1, 0.6, 1, [[0, mix(top, GOLD.highlight, 0.4)], [0.4, mid], [0.75, GOLD.dark], [1, mix(GOLD.base, GOLD.light, 0.3)]]);
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  path();
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = lin(ctx, -1, -1, 1, 1, [[0, rgba(GOLD.highlight, 0.9)], [0.5, rgba(GOLD.light, 0.2)], [1, rgba(GOLD.deep, 0.6)]]);
  ctx.stroke();
  ctx.restore();
}

/** A small round cabochon jewel. */
export function jewel(ctx: Ctx, x: number, y: number, r: number, color: number, lw: number): void {
  const t = GEM[color] as GemTone;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = lw * 1.4;
  ctx.strokeStyle = t.edge;
  ctx.stroke();
  ctx.fillStyle = rad(ctx, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.1, [[0, t.highlight], [0.3, t.light], [0.75, t.base], [1, t.dark]]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.38, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

function circle(ctx: Ctx, x: number, y: number, r: number): PathFn {
  return () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
}

function coin(ctx: Ctx, lw: number): void {
  gild(ctx, circle(ctx, 0, 0, 0.74), lw);
  // recessed inner field
  ctx.beginPath();
  ctx.arc(0, 0, 0.56, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, 0, -0.56, 0, 0.56, [[0, GOLD.dark], [1, GOLD.light]]);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = GOLD.deep;
  ctx.stroke();
  // dotted ring
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0.028, 0, Math.PI * 2);
    ctx.fillStyle = GOLD.deep;
    ctx.fill();
  }
  // sun emblem
  const sun = star(ctx, 0, 0, 8, 0.44, 0.2);
  gild(ctx, () => poly(ctx, sun), lw * 0.7);
  jewel(ctx, 0, 0, 0.13, 0, lw * 0.7);
}

function chalice(ctx: Ctx, lw: number): void {
  const bowl: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.62);
    ctx.lineTo(0.6, -0.62);
    ctx.bezierCurveTo(0.6, -0.05, 0.3, 0.12, 0, 0.12);
    ctx.bezierCurveTo(-0.3, 0.12, -0.6, -0.05, -0.6, -0.62);
    ctx.closePath();
  };
  const stem: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.1, 0.08);
    ctx.lineTo(0.1, 0.08);
    ctx.lineTo(0.08, 0.5);
    ctx.bezierCurveTo(0.12, 0.56, 0.42, 0.6, 0.46, 0.76);
    ctx.lineTo(-0.46, 0.76);
    ctx.bezierCurveTo(-0.42, 0.6, -0.12, 0.56, -0.08, 0.5);
    ctx.closePath();
  };
  gild(ctx, stem, lw, 'deep');
  // knot
  gild(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 0.3, 0.14, 0.08, 0, 0, Math.PI * 2); }, lw * 0.8);
  gild(ctx, bowl, lw);
  // rim lip
  gild(ctx, () => roundRect(ctx, -0.68, -0.74, 1.36, 0.16, 0.08), lw * 0.8);
  // dark interior hint
  ctx.beginPath();
  ctx.ellipse(0, -0.67, 0.56, 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(GOLD.deep, 0.8);
  ctx.fill();
  jewel(ctx, 0, -0.28, 0.15, 0, lw * 0.7);
  jewel(ctx, -0.36, -0.36, 0.07, 2, lw * 0.5);
  jewel(ctx, 0.36, -0.36, 0.07, 1, lw * 0.5);
}

function compass(ctx: Ctx, lw: number): void {
  // hanging loop
  ctx.beginPath();
  ctx.arc(0, -0.78, 0.12, 0, Math.PI * 2);
  ctx.lineWidth = lw * 2.6;
  ctx.strokeStyle = GOLD.edge;
  ctx.stroke();
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = GOLD.light;
  ctx.stroke();
  gild(ctx, circle(ctx, 0, 0.06, 0.7), lw);
  // face
  ctx.beginPath();
  ctx.arc(0, 0.06, 0.53, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, -0.15, -0.1, 0.05, 0.6, [[0, '#fffaf0'], [1, '#e9d2a6']]);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = GOLD.deep;
  ctx.stroke();
  // ticks
  ctx.strokeStyle = rgba('#6b4320', 0.8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r0 = i % 2 ? 0.42 : 0.36;
    ctx.lineWidth = i % 2 ? lw * 0.5 : lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, 0.06 + Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * 0.49, 0.06 + Math.sin(a) * 0.49);
    ctx.stroke();
  }
  // needle (ruby north, sapphire south), slightly rotated
  ctx.save();
  ctx.translate(0, 0.06);
  ctx.rotate(0.5);
  const north: Pt[] = [[0, -0.44], [0.11, 0], [-0.11, 0]];
  const south: Pt[] = [[0, 0.44], [0.11, 0], [-0.11, 0]];
  const red = GEM[0] as GemTone;
  const blue = GEM[1] as GemTone;
  poly(ctx, north);
  ctx.fillStyle = lin(ctx, -0.1, 0, 0.1, 0, [[0, red.light], [0.5, red.base], [0.51, red.dark], [1, red.dark]]);
  ctx.fill();
  ctx.lineWidth = lw * 0.6; ctx.strokeStyle = red.edge; ctx.stroke();
  poly(ctx, south);
  ctx.fillStyle = lin(ctx, -0.1, 0, 0.1, 0, [[0, blue.light], [0.5, blue.base], [0.51, blue.dark], [1, blue.dark]]);
  ctx.fill();
  ctx.strokeStyle = blue.edge; ctx.stroke();
  ctx.restore();
  gild(ctx, circle(ctx, 0, 0.06, 0.07), lw * 0.5);
  // glass glare
  ctx.beginPath();
  ctx.ellipse(-0.2, -0.18, 0.26, 0.11, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function amulet(ctx: Ctx, lw: number): void {
  // chain arc
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.12 + (i / 6) * 0.76);
    const x = Math.cos(a) * 0.62;
    const y = -0.18 + Math.sin(a) * 0.62;
    ctx.beginPath();
    ctx.ellipse(x, y, 0.07, 0.045, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.lineWidth = lw * 1.6;
    ctx.strokeStyle = GOLD.edge;
    ctx.stroke();
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = GOLD.light;
    ctx.stroke();
  }
  const pts = star(ctx, 0, 0.16, 5, 0.66, 0.3);
  gild(ctx, () => poly(ctx, pts), lw);
  // inner bevel star
  const inner = star(ctx, 0, 0.16, 5, 0.44, 0.2);
  poly(ctx, inner);
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = rgba(GOLD.deep, 0.7);
  ctx.stroke();
  jewel(ctx, 0, 0.18, 0.18, 2, lw * 0.8);
  // bail
  gild(ctx, () => roundRect(ctx, -0.09, -0.6, 0.18, 0.18, 0.06), lw * 0.7);
}

function key(ctx: Ctx, lw: number): void {
  ctx.save();
  ctx.rotate(-Math.PI / 4);
  // shaft + bit
  const shaft: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.25);
    ctx.lineTo(0.08, -0.25);
    ctx.lineTo(0.08, 0.66);
    ctx.lineTo(0.36, 0.66);
    ctx.lineTo(0.36, 0.78);
    ctx.lineTo(0.24, 0.78);
    ctx.lineTo(0.24, 0.9);
    ctx.lineTo(0.36, 0.9);
    ctx.lineTo(0.36, 1.02);
    ctx.lineTo(0.08, 1.02);
    ctx.lineTo(-0.08, 1.04);
    ctx.closePath();
  };
  ctx.translate(0, -0.12);
  gild(ctx, shaft, lw, 'deep');
  // collar
  gild(ctx, () => roundRect(ctx, -0.16, -0.24, 0.32, 0.12, 0.05), lw * 0.7);
  // ornate bow: quatrefoil
  const bow: PathFn = () => {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * 0.2 + 0.2, -0.55 + Math.sin(a) * 0.2);
      ctx.arc(Math.cos(a) * 0.2, -0.55 + Math.sin(a) * 0.2, 0.2, 0, Math.PI * 2);
    }
  };
  gild(ctx, bow, lw);
  ctx.beginPath();
  ctx.arc(0, -0.55, 0.16, 0, Math.PI * 2);
  ctx.fillStyle = GOLD.base;
  ctx.fill();
  jewel(ctx, 0, -0.55, 0.12, 4, lw * 0.6);
  ctx.restore();
}

function ring(ctx: Ctx, lw: number): void {
  // band (thick ellipse ring)
  const band: PathFn = () => {
    ctx.beginPath();
    ctx.ellipse(0, 0.3, 0.58, 0.48, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0.33, 0.42, 0.33, 0, 0, Math.PI * 2, true);
  };
  band();
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = GOLD.edge;
  ctx.stroke();
  ctx.fillStyle = lin(ctx, -0.6, 0, 0.6, 0.6, [[0, GOLD.light], [0.5, GOLD.base], [1, GOLD.dark]]);
  ctx.fill('evenodd');
  // crown setting
  const crown: Pt[] = [[-0.36, -0.06], [-0.42, -0.5], [-0.2, -0.32], [0, -0.62], [0.2, -0.32], [0.42, -0.5], [0.36, -0.06]];
  gild(ctx, () => poly(ctx, crown), lw);
  for (const [x, y] of [[-0.42, -0.5], [0, -0.62], [0.42, -0.5]] as Pt[]) gild(ctx, circle(ctx, x, y, 0.06), lw * 0.5);
  // big faceted jewel (sapphire)
  const t = GEM[1] as GemTone;
  const g: Pt[] = [[0, -0.42], [0.22, -0.24], [0.16, 0.0], [-0.16, 0.0], [-0.22, -0.24]];
  poly(ctx, g);
  ctx.lineWidth = lw * 1.4;
  ctx.strokeStyle = t.edge;
  ctx.stroke();
  ctx.fillStyle = lin(ctx, -0.2, -0.4, 0.2, 0, [[0, t.highlight], [0.35, t.light], [1, t.dark]]);
  ctx.fill();
  poly(ctx, [[0, -0.42], [0.08, -0.22], [0, -0.06], [-0.08, -0.22]]);
  ctx.fillStyle = rgba(t.highlight, 0.7);
  ctx.fill();
}

const RELICS = [coin, chalice, compass, amulet, key, ring];

/** Paint relic `variant` filling a size×size canvas (works for 1x1 and 2x2). */
export function paintRelic(ctx: Ctx, size: number, variant: number): void {
  const half = size / 2;
  // warm aura so relics pop against earth and under the crust holes
  ctx.fillStyle = rad(ctx, half, half, 0, half * 0.98, [[0, 'rgba(255,236,160,0.95)'], [0.45, 'rgba(255,200,90,0.55)'], [1, 'rgba(255,170,60,0)']]);
  ctx.fillRect(0, 0, size, size);
  // draw the item on a scratch canvas, then composite once with a soft drop shadow
  const tmp = scratch(size);
  const t = tmp.getContext('2d') as Ctx;
  t.save();
  t.translate(half, half);
  const k = half * 0.86;
  t.scale(k, k);
  const lw = Math.max(1.2, size * 0.022) / k;
  (RELICS[variant % RELICS.length] as (c: Ctx, l: number) => void)(t, lw);
  t.restore();
  ctx.save();
  ctx.shadowColor = 'rgba(60,25,0,0.55)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.035;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
  sparkle(ctx, size * 0.78, size * 0.22, size * 0.1, 'rgba(255,255,255,0.95)');
  sparkle(ctx, size * 0.22, size * 0.8, size * 0.06, 'rgba(255,250,220,0.8)');
}

/**
 * Paint just the relic item (no aura, no shadow, no sparkles) centred at (cx, cy) with half-size `half`.
 * Used by the small HUD boon badges, where the aura would turn to mush.
 */
export function paintRelicGlyph(ctx: Ctx, cx: number, cy: number, half: number, variant: number, lwPx: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(half, half);
  (RELICS[((variant % RELICS.length) + RELICS.length) % RELICS.length] as (c: Ctx, l: number) => void)(ctx, lwPx / half);
  ctx.restore();
}
