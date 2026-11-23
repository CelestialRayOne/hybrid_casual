// Gem powers (v2): tray tokens with the power symbol, level pips, armed ring, board reticle, empty slot.
// Symbols: ruby Wildfire = flame, sapphire Tidal Wave = curling wave, emerald Earthshaker = split ground
// with rumble arcs, topaz Chain Lightning = bolt, amethyst Drill = drill bit pointing down.
import { GEM, GOLD, STEEL, UI, BOARD, type GemTone } from './palette';
import { type Ctx, type Pt, mix, rgba, poly, roundPoly, roundRect, lin, rad, sparkle } from './draw';
import { unit, goldGrad, type PathFn } from './ui';

/** Ink-outlined fill in the gem's own edge colour (keeps the symbol crisp on the badge). */
function ink(ctx: Ctx, path: PathFn, fill: string | CanvasGradient, lw: number, edge: string): void {
  path();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = lw * 2.2;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

// ---------- symbols (unit space, fit in radius ~0.66) ----------

function flamePath(ctx: Ctx, k = 1, lean = 0): PathFn {
  return () => {
    ctx.beginPath();
    ctx.moveTo(0.06 * k + lean, -0.7 * k);
    ctx.bezierCurveTo(0.2 * k + lean, -0.42 * k, 0.52 * k, -0.22 * k, 0.5 * k, 0.14 * k);
    ctx.bezierCurveTo(0.49 * k, 0.46 * k, 0.26 * k, 0.64 * k, 0, 0.64 * k);
    ctx.bezierCurveTo(-0.27 * k, 0.64 * k, -0.5 * k, 0.45 * k, -0.5 * k, 0.16 * k);
    ctx.bezierCurveTo(-0.5 * k, -0.08 * k, -0.36 * k, -0.18 * k, -0.32 * k, -0.42 * k);
    ctx.bezierCurveTo(-0.18 * k, -0.3 * k, -0.12 * k, -0.18 * k, -0.1 * k, -0.08 * k);
    ctx.bezierCurveTo(-0.08 * k, -0.34 * k, -0.04 * k, -0.5 * k, 0.06 * k + lean, -0.7 * k);
    ctx.closePath();
  };
}

function symFlame(ctx: Ctx, lw: number, t: GemTone): void {
  ctx.translate(0, 0.02);
  ink(ctx, flamePath(ctx), lin(ctx, 0, -0.7, 0, 0.64, [[0, '#ff9a2a'], [0.45, '#ffc23a'], [1, '#ffe98a']]), lw, t.edge);
  // inner core
  const core: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(0.02, -0.18);
    ctx.bezierCurveTo(0.14, 0.0, 0.28, 0.12, 0.26, 0.3);
    ctx.bezierCurveTo(0.25, 0.48, 0.12, 0.54, 0, 0.54);
    ctx.bezierCurveTo(-0.14, 0.54, -0.26, 0.46, -0.26, 0.3);
    ctx.bezierCurveTo(-0.26, 0.12, -0.1, 0.06, 0.02, -0.18);
    ctx.closePath();
  };
  core();
  ctx.fillStyle = lin(ctx, 0, -0.2, 0, 0.54, [[0, '#fff3b0'], [1, '#ffffff']]);
  ctx.fill();
  // tongue highlight
  ctx.beginPath();
  ctx.ellipse(-0.24, 0.02, 0.06, 0.16, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function symWave(ctx: Ctx, lw: number, t: GemTone): void {
  const body: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.7, 0.58);
    ctx.lineTo(0.7, 0.58);
    ctx.lineTo(0.7, 0.18);
    ctx.bezierCurveTo(0.7, -0.36, 0.36, -0.68, -0.06, -0.66);
    ctx.bezierCurveTo(-0.46, -0.64, -0.7, -0.38, -0.62, -0.08);
    ctx.bezierCurveTo(-0.56, 0.12, -0.32, 0.18, -0.2, 0.02);
    ctx.bezierCurveTo(-0.34, 0.0, -0.38, -0.14, -0.3, -0.26);
    ctx.bezierCurveTo(-0.2, -0.4, 0.06, -0.4, 0.18, -0.2);
    ctx.bezierCurveTo(0.3, 0.0, 0.2, 0.28, -0.12, 0.36);
    ctx.bezierCurveTo(-0.38, 0.42, -0.56, 0.38, -0.7, 0.3);
    ctx.closePath();
  };
  ink(ctx, body, lin(ctx, 0, -0.66, 0, 0.58, [[0, '#ffffff'], [0.3, '#c9ecff'], [0.75, '#6cc4ff'], [1, '#3f9cf0']]), lw, t.edge);
  // foam crest line along the top of the curl
  ctx.beginPath();
  ctx.moveTo(0.56, -0.18);
  ctx.bezierCurveTo(0.42, -0.5, 0.12, -0.6, -0.12, -0.56);
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.stroke();
  // trough lines in the body
  ctx.strokeStyle = rgba(t.dark, 0.55);
  ctx.lineWidth = 0.05;
  for (const y of [0.42]) {
    ctx.beginPath();
    ctx.moveTo(-0.3, y);
    ctx.quadraticCurveTo(0.1, y - 0.1, 0.5, y - 0.02);
    ctx.stroke();
  }
  // spray dots
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [[0.52, -0.6, 0.06], [0.66, -0.44, 0.045], [0.34, -0.74, 0.04]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(x, y, r + lw * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = t.edge;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

function symQuake(ctx: Ctx, lw: number, t: GemTone): void {
  const earth = (x0: number): CanvasGradient => lin(ctx, x0, -0.1, x0, 0.62, [[0, '#d9a066'], [0.35, '#a8673a'], [1, '#6a3a1c']]);
  // two halves of a ground slab, pushed apart and tilted
  const left: Pt[] = [[-0.66, 0.0], [-0.12, -0.08], [-0.02, 0.06], [-0.14, 0.2], [-0.04, 0.36], [-0.16, 0.6], [-0.62, 0.6]];
  const right: Pt[] = [[0.1, -0.16], [0.68, -0.02], [0.64, 0.6], [0.06, 0.6], [0.16, 0.38], [0.06, 0.22], [0.18, 0.06]];
  for (const [pts, x0] of [[left, -0.4], [right, 0.4]] as [Pt[], number][]) {
    ink(ctx, () => roundPoly(ctx, pts, 0.04), earth(x0), lw, t.edge);
    // grass lip
    ctx.save();
    roundPoly(ctx, pts, 0.04);
    ctx.clip();
    ctx.fillStyle = lin(ctx, 0, -0.2, 0, 0.12, [[0, t.light], [1, t.base]]);
    ctx.beginPath();
    const a = pts[0] as Pt;
    const b = pts[1] as Pt;
    ctx.moveTo(a[0] - 0.1, a[1] - 0.2);
    ctx.lineTo(b[0] + 0.1, b[1] - 0.2);
    ctx.lineTo(b[0] + 0.1, b[1] + 0.11);
    ctx.lineTo(a[0] - 0.1, a[1] + 0.11);
    ctx.fill();
    ctx.restore();
  }
  // glowing crack between the halves
  ctx.beginPath();
  ctx.moveTo(-0.02, -0.06);
  ctx.lineTo(0.08, 0.08);
  ctx.lineTo(-0.04, 0.22);
  ctx.lineTo(0.06, 0.38);
  ctx.lineTo(-0.06, 0.58);
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = '#fff6b8';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // rumble arcs + flying pebbles
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (const [r, w] of [[0.3, 0.1], [0.5, 0.08]] as Pt[]) {
      ctx.beginPath();
      ctx.arc(0.02, -0.12, r, -Math.PI / 2 + s * 0.5 - 0.35, -Math.PI / 2 + s * 0.5 + 0.35);
      ctx.lineWidth = w + lw * 2;
      ctx.strokeStyle = t.edge;
      ctx.stroke();
      ctx.lineWidth = w;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }
  for (const [x, y, r] of [[-0.08, -0.6, 0.07], [0.16, -0.7, 0.05]] as [number, number, number][]) {
    ink(ctx, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, '#c98a52', lw * 0.7, t.edge);
  }
}

const BOLT: Pt[] = [[0.2, -0.74], [-0.38, 0.08], [-0.03, 0.08], [-0.2, 0.74], [0.42, -0.14], [0.06, -0.14], [0.3, -0.74]];

function symBolt(ctx: Ctx, lw: number, t: GemTone): void {
  ink(ctx, () => roundPoly(ctx, BOLT, 0.03), lin(ctx, -0.3, -0.7, 0.3, 0.7, [[0, '#ffffff'], [0.45, '#fff6c0'], [1, '#ffe14a']]), lw * 1.1, t.edge);
  // bevel: lit left half
  poly(ctx, [[0.2, -0.74], [-0.38, 0.08], [-0.03, 0.08], [0.0, 0.0], [-0.2, 0.0], [0.27, -0.7]]);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  sparkle(ctx, 0.46, 0.38, 0.16, '#ffffff');
  sparkle(ctx, -0.46, -0.36, 0.12, '#ffffff');
}

/** Drill bit pointing down. Unit space: housing at top, tip at y=+0.74. */
export function drillShape(ctx: Ctx, lw: number, edge: string, accent: GemTone, spin = 0): void {
  // housing (gem-coloured motor)
  ink(ctx, () => roundRect(ctx, -0.34, -0.76, 0.68, 0.32, 0.1), lin(ctx, 0, -0.76, 0, -0.44, [[0, accent.light], [0.5, accent.base], [1, accent.dark]]), lw, edge);
  ctx.beginPath();
  ctx.moveTo(-0.24, -0.7);
  ctx.lineTo(0.24, -0.7);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = rgba(accent.highlight, 0.8);
  ctx.stroke();
  // collar
  ink(ctx, () => roundRect(ctx, -0.26, -0.46, 0.52, 0.14, 0.04), goldGrad(ctx, -0.46, -0.32), lw * 0.8, edge);
  // cone bit
  const cone: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.33);
    ctx.lineTo(0.3, -0.33);
    ctx.lineTo(0.02, 0.74);
    ctx.lineTo(-0.02, 0.74);
    ctx.closePath();
  };
  ink(ctx, cone, lin(ctx, -0.3, 0, 0.3, 0, [[0, STEEL.faceDark], [0.3, STEEL.faceLight], [0.55, STEEL.face], [1, STEEL.faceDark]]), lw, edge);
  // spiral flutes
  ctx.save();
  cone();
  ctx.clip();
  ctx.lineWidth = 0.075;
  for (let i = -1; i < 6; i++) {
    const y = -0.38 + i * 0.2 + spin * 0.2;
    ctx.beginPath();
    ctx.moveTo(-0.34, y);
    ctx.quadraticCurveTo(0, y + 0.06, 0.34, y + 0.2);
    ctx.strokeStyle = rgba(edge, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.34, y - 0.05);
    ctx.quadraticCurveTo(0, y + 0.01, 0.34, y + 0.15);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.035;
    ctx.stroke();
    ctx.lineWidth = 0.075;
  }
  ctx.restore();
}

function symDrill(ctx: Ctx, lw: number, t: GemTone): void {
  drillShape(ctx, lw, t.edge, { ...t, light: mix(t.light, '#ffffff', 0.35), base: t.light, dark: t.base });
  // dirt chips flying from the tip
  for (const [x, y, r] of [[-0.36, 0.52, 0.06], [0.38, 0.5, 0.07], [-0.46, 0.3, 0.045]] as [number, number, number][]) {
    ink(ctx, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, '#d9a066', lw * 0.6, t.edge);
  }
}

const SYMBOLS = [symFlame, symWave, symQuake, symBolt, symDrill];

/** Unit-space power symbol for gem colour `c` (no badge). */
export function powerSymbol(ctx: Ctx, c: number, lw: number): void {
  ctx.save();
  (SYMBOLS[c] as (x: Ctx, l: number, t: GemTone) => void)(ctx, lw, GEM[c] as GemTone);
  ctx.restore();
}

// ---------- token / pips / ring / reticle / slot ----------

function jewelDisc(ctx: Ctx, t: GemTone, r: number, lw: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, -0.3, -0.35, 0.05, r * 1.25, [[0, t.light], [0.5, t.base], [1, t.dark]]);
  ctx.fill();
  // faceted wedges (subtle) for the jewel look
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * r * 0.62, Math.sin(a0) * r * 0.62);
    ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.arc(0, 0, r, a0, a1);
    ctx.lineTo(Math.cos(a1) * r * 0.62, Math.sin(a1) * r * 0.62);
    ctx.closePath();
    const lit = Math.cos((a0 + a1) / 2 + 2.2);
    ctx.fillStyle = lit > 0 ? rgba(t.highlight, 0.18 * lit) : rgba(t.edge, -0.22 * lit);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = rgba(t.highlight, 0.22);
  ctx.stroke();
}

/** Power tray token: gold-rimmed round jewel badge with the power symbol. */
export function paintPowerToken(ctx: Ctx, s: number, c: number): void {
  const t = GEM[c] as GemTone;
  unit(ctx, s, s, (lw) => {
    ctx.save();
    ctx.shadowColor = 'rgba(30,10,0,0.5)';
    ctx.shadowBlur = s * 0.05;
    ctx.shadowOffsetY = s * 0.035;
    ctx.beginPath();
    ctx.arc(0, 0, 0.96, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 0.96 - lw * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = goldGrad(ctx);
    ctx.fill();
    jewelDisc(ctx, t, 0.8, lw);
    ctx.beginPath();
    ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = GOLD.edge;
    ctx.stroke();
    // symbol
    ctx.save();
    ctx.scale(0.86, 0.86);
    powerSymbol(ctx, c, lw / 0.86);
    ctx.restore();
    // gloss over everything
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-0.28, -0.5, 0.6, 0.3, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, -0.3, -0.55, 0, 0.6, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fill();
    ctx.restore();
    sparkle(ctx, -0.6, -0.56, 0.2, 'rgba(255,255,255,0.95)');
  }, 0.94);
}

/** Level pip: on = glowing gold gem dot, off = dark empty socket. */
export function paintPip(ctx: Ctx, s: number, on: boolean): void {
  unit(ctx, s, s, (lw) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.92, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    if (on) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.92 - lw * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = rad(ctx, -0.3, -0.35, 0.05, 1, [[0, GOLD.highlight], [0.35, GOLD.light], [0.75, GOLD.base], [1, GOLD.dark]]);
      ctx.fill();
      sparkle(ctx, -0.22, -0.26, 0.42, 'rgba(255,255,255,0.95)', 0.22);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 0.92 - lw * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = lin(ctx, 0, -1, 0, 1, [[0, '#24130a'], [1, '#5a3a24']]);
      ctx.fill();
    }
  }, 0.96);
}

/** White glowing ring for an armed token (tint it). Inner radius matches the token's outer edge. */
export function paintArmedRing(ctx: Ctx, s: number): void {
  const h = s / 2;
  const rIn = h / 1.4; // token radius at s / 1.4
  ctx.fillStyle = rad(ctx, h, h, rIn * 0.9, h, [[0, 'rgba(255,255,255,0)'], [0.08, 'rgba(255,255,255,0.95)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(0, 0, s, s);
  ctx.beginPath();
  ctx.arc(h, h, rIn * 1.04, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, s * 0.028);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 4 + (i * Math.PI) / 2;
    sparkle(ctx, h + Math.cos(a) * rIn * 1.12, h + Math.sin(a) * rIn * 1.12, s * 0.07, '#ffffff', 0.2);
  }
}

/** Board reticle: four bracket corners and a centre dot ring (white with dark keyline; tint it). */
export function paintReticle(ctx: Ctx, s: number): void {
  const m = s * 0.06;
  const L = s * 0.26;
  const w = Math.max(3, s * 0.07);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const corners = (): void => {
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [s - m, m, -1, 1], [s - m, s - m, -1, -1], [m, s - m, 1, -1]] as [number, number, number, number][]) {
      ctx.moveTo(x + dx * L, y);
      ctx.arcTo(x, y, x, y + dy * L, s * 0.08);
      ctx.lineTo(x, y + dy * L);
    }
  };
  // soft inner glow
  roundRect(ctx, m, m, s - 2 * m, s - 2 * m, s * 0.1);
  ctx.fillStyle = rad(ctx, s / 2, s / 2, s * 0.2, s * 0.5, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.28)']]);
  ctx.fill();
  corners();
  ctx.lineWidth = w + Math.max(2, s * 0.03);
  ctx.strokeStyle = 'rgba(30,12,0,0.75)';
  ctx.stroke();
  corners();
  ctx.lineWidth = w;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // centre target ring + ticks
  const r = s * 0.13;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as Pt[]) {
    ctx.moveTo(s / 2 + dx * r * 1.5, s / 2 + dy * r * 1.5);
    ctx.lineTo(s / 2 + dx * r * 2.2, s / 2 + dy * r * 2.2);
  }
  ctx.lineWidth = w * 0.55 + Math.max(2, s * 0.025);
  ctx.strokeStyle = 'rgba(30,12,0,0.7)';
  ctx.stroke();
  ctx.lineWidth = w * 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

/** Empty power slot: recessed round socket for the cream tray panel. Same outer size as a token. */
export function paintTraySlot(ctx: Ctx, s: number): void {
  unit(ctx, s, s, (lw) => {
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.94, 0, Math.PI * 2);
    ctx.fillStyle = lin(ctx, 0, -1, 0, 1, [[0, UI.panelEdgeDark], [1, UI.panelEdgeLight]]);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.86, 0, Math.PI * 2);
    ctx.fillStyle = lin(ctx, 0, -0.86, 0, 0.86, [[0, BOARD.slotEdge], [0.4, BOARD.slot], [1, mix(BOARD.slot, BOARD.slotLight, 0.5)]]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = lin(ctx, 0, -0.86, 0, -0.4, [[0, 'rgba(10,4,0,0.55)'], [1, 'rgba(10,4,0,0)']]);
    ctx.fillRect(-1, -1, 2, 1);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 0.6, 0, Math.PI * 2);
    ctx.setLineDash([0.16, 0.12]);
    ctx.lineWidth = lw * 1.1;
    ctx.strokeStyle = rgba(BOARD.slotLight, 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    // faint plus
    ctx.beginPath();
    ctx.moveTo(-0.18, 0); ctx.lineTo(0.18, 0);
    ctx.moveTo(0, -0.18); ctx.lineTo(0, 0.18);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw * 1.6;
    ctx.strokeStyle = rgba(BOARD.slotLight, 0.9);
    ctx.stroke();
  }, 0.94);
}
