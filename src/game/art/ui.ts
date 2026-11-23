// UI art: panels, buttons, stars, HUD icons, perk badges, tutorial hand, particles.
import type { PathId } from './keys';
import { UI, GOLD, STEEL, PATH, FX, GEM, EARTH, type GemTone } from './palette';
import { type Ctx, type Pt, mix, rgba, poly, roundPoly, roundRect, lin, rad, star, sparkle } from './draw';

export type PathFn = () => void;

/** Ink outline + fill + top gloss, the shared icon "sticker" style (unit space). */
export function inked(ctx: Ctx, path: PathFn, fill: string | CanvasGradient, lw: number, gloss = true): void {
  path();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  if (gloss) {
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = lin(ctx, 0, -1, 0, 0.2, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(-1.5, -1.5, 3, 1.4);
    ctx.restore();
  }
}

export function goldGrad(ctx: Ctx, y0 = -1, y1 = 1): CanvasGradient {
  return lin(ctx, 0, y0, 0, y1, [[0, GOLD.highlight], [0.3, GOLD.light], [0.6, GOLD.base], [1, GOLD.dark]]);
}

export function steelGrad(ctx: Ctx, y0 = -1, y1 = 1): CanvasGradient {
  return lin(ctx, 0, y0, 0, y1, [[0, STEEL.faceLight], [0.55, STEEL.face], [1, STEEL.faceDark]]);
}

/** Run `fn` in unit space ([-1,1] maps to the canvas with margin). */
export function unit(ctx: Ctx, w: number, h: number, fn: (lw: number) => void, margin = 0.9): void {
  const k = (Math.min(w, h) / 2) * margin;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(k, k);
  fn(Math.max(1.2, Math.min(w, h) * 0.035) / k);
  ctx.restore();
}

// ---------- panels & buttons (nine-slice friendly) ----------

export function paintPanel(ctx: Ctx, s: number, u: number, dark: boolean): void {
  const r = u * 0.42;
  const lw = Math.max(2, u * 0.07);
  ctx.save();
  ctx.shadowColor = 'rgba(20,8,0,0.45)';
  ctx.shadowBlur = u * 0.12;
  ctx.shadowOffsetY = u * 0.06;
  roundRect(ctx, lw, lw, s - 2 * lw, s - 2 * lw - u * 0.06, r);
  ctx.fillStyle = dark ? UI.panelDarkEdge : UI.panelEdgeDark;
  ctx.fill();
  ctx.restore();
  // edge band
  roundRect(ctx, lw, lw, s - 2 * lw, s - 2 * lw - u * 0.1, r);
  ctx.fillStyle = dark ? UI.panelDarkEdge : lin(ctx, 0, 0, 0, s, [[0, UI.panelEdgeLight], [0.3, UI.panelEdge], [1, UI.panelEdgeDark]]);
  ctx.fill();
  // face
  const e = lw * 2.2;
  roundRect(ctx, e, e, s - 2 * e, s - 2 * e - u * 0.1, r * 0.75);
  ctx.fillStyle = dark
    ? lin(ctx, 0, e, 0, s - e, [[0, mix(UI.panelDark, '#7a4a2c', 0.4)], [1, UI.panelDark]])
    : lin(ctx, 0, e, 0, s - e, [[0, '#fffaf0'], [0.5, UI.panel], [1, UI.panelLow]]);
  ctx.fill();
  ctx.lineWidth = Math.max(1, u * 0.03);
  ctx.strokeStyle = dark ? rgba('#ffd9a8', 0.18) : rgba('#ffffff', 0.9);
  ctx.stroke();
  // outer ink line
  roundRect(ctx, lw, lw, s - 2 * lw, s - 2 * lw - u * 0.1, r);
  ctx.lineWidth = Math.max(1.5, u * 0.04);
  ctx.strokeStyle = dark ? '#140a04' : UI.panelEdgeDark;
  ctx.stroke();
}

/** Glossy 3D button. pressed = pushed down (no lip, darker). */
export function paintButton(ctx: Ctx, w: number, h: number, u: number, pressed: boolean): void {
  const r = h * 0.38;
  const lip = pressed ? u * 0.03 : u * 0.12;
  const top = pressed ? u * 0.09 : 0;
  const lw = Math.max(1.5, u * 0.05);
  // lip / base
  roundRect(ctx, lw, top + lw, w - 2 * lw, h - top - 2 * lw, r);
  ctx.fillStyle = UI.buttonEdge;
  ctx.fill();
  roundRect(ctx, lw * 1.8, top + lw * 1.8, w - lw * 3.6, h - top - lip - lw * 3.2, r * 0.9);
  ctx.fillStyle = lin(ctx, 0, top, 0, h - lip, pressed
    ? [[0, UI.buttonPressed], [1, UI.buttonDark]]
    : [[0, UI.buttonLight], [0.45, UI.button], [1, UI.buttonDark]]);
  ctx.fill();
  // gloss band
  ctx.save();
  ctx.clip();
  roundRect(ctx, lw * 3.2, top + lw * 2.6, w - lw * 6.4, (h - top - lip) * 0.42, r * 0.7);
  ctx.fillStyle = lin(ctx, 0, top, 0, top + (h - lip) * 0.5, [[0, `rgba(255,255,255,${pressed ? 0.25 : 0.6})`], [1, 'rgba(255,255,255,0.05)']]);
  ctx.fill();
  ctx.restore();
}

// ---------- stars ----------

export function paintStar(ctx: Ctx, s: number, full: boolean): void {
  unit(ctx, s, s, (lw) => {
    const pts = star(ctx, 0, 0.06, 5, 0.98, 0.46);
    const path: PathFn = () => roundPoly(ctx, pts, 0.1);
    if (full) {
      ctx.save();
      ctx.shadowColor = 'rgba(40,15,0,0.5)';
      ctx.shadowBlur = s * 0.06;
      ctx.shadowOffsetY = s * 0.04;
      path();
      ctx.fillStyle = GOLD.edge;
      ctx.fill();
      ctx.restore();
      inked(ctx, path, goldGrad(ctx), lw);
      const inner = star(ctx, 0, 0.1, 5, 0.55, 0.26);
      roundPoly(ctx, inner, 0.05);
      ctx.fillStyle = rgba(GOLD.highlight, 0.45);
      ctx.fill();
      sparkle(ctx, -0.32, -0.3, 0.26, 'rgba(255,255,255,0.95)');
    } else {
      path();
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw * 2;
      ctx.strokeStyle = UI.starEmptyDark;
      ctx.stroke();
      ctx.fillStyle = lin(ctx, 0, -1, 0, 1, [[0, UI.starEmptyDark], [1, UI.starEmpty]]);
      ctx.fill();
      ctx.save();
      path();
      ctx.clip();
      ctx.lineWidth = lw * 1.4;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.translate(0.04, 0.06);
      path();
      ctx.stroke();
      ctx.restore();
    }
  }, 0.92);
}

// ---------- HUD icons ----------

function pickaxe(ctx: Ctx, lw: number): void {
  // handle
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.66, 0.76);
  ctx.lineTo(0.3, -0.24);
  ctx.lineWidth = lw * 2 + 0.26;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.lineWidth = 0.26;
  ctx.strokeStyle = lin(ctx, -0.6, 0.7, 0.3, -0.2, [[0, '#8a4f24'], [1, '#d08a4c']]);
  ctx.stroke();
  // head: curved steel blade
  const head: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.62, -0.5);
    ctx.quadraticCurveTo(0.2, -1.02, 0.9, -0.18);
    ctx.quadraticCurveTo(0.34, -0.42, 0.2, -0.3);
    ctx.quadraticCurveTo(0.12, -0.5, -0.62, -0.5);
    ctx.closePath();
  };
  inked(ctx, head, steelGrad(ctx, -0.9, -0.3), lw);
  // gold collar
  inked(ctx, () => { ctx.beginPath(); ctx.arc(0.26, -0.42, 0.17, 0, Math.PI * 2); }, goldGrad(ctx, -0.6, -0.25), lw * 0.7);
}

function depth(ctx: Ctx, lw: number): void {
  const box: PathFn = () => roundRect(ctx, -0.82, -0.82, 1.64, 1.64, 0.3);
  box();
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.save();
  box();
  ctx.clip();
  const bands = [EARTH[0], EARTH[2], EARTH[3], EARTH[5]];
  bands.forEach((b, i) => {
    if (!b) return;
    ctx.fillStyle = b.top;
    ctx.beginPath();
    ctx.moveTo(-1, -1 + i * 0.45);
    ctx.quadraticCurveTo(0, -1.12 + i * 0.45, 1, -0.98 + i * 0.45);
    ctx.lineTo(1, 1);
    ctx.lineTo(-1, 1);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
  // down arrow
  const arrow: Pt[] = [[-0.16, -0.62], [0.16, -0.62], [0.16, 0.04], [0.44, 0.04], [0, 0.62], [-0.44, 0.04], [-0.16, 0.04]];
  inked(ctx, () => roundPoly(ctx, arrow, 0.06), '#ffffff', lw * 0.8, false);
}

function chest(ctx: Ctx, lw: number): void {
  const wood = lin(ctx, 0, -0.6, 0, 0.8, [[0, '#c27a3e'], [1, '#7a4220']]);
  const lid: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.86, -0.06);
    ctx.lineTo(-0.86, -0.3);
    ctx.quadraticCurveTo(-0.86, -0.76, 0, -0.76);
    ctx.quadraticCurveTo(0.86, -0.76, 0.86, -0.3);
    ctx.lineTo(0.86, -0.06);
    ctx.closePath();
  };
  const body: PathFn = () => roundRect(ctx, -0.86, -0.06, 1.72, 0.84, 0.1);
  inked(ctx, body, wood, lw);
  inked(ctx, lid, wood, lw);
  // gold bands
  for (const x of [-0.5, 0.5]) {
    inked(ctx, () => roundRect(ctx, x - 0.08, -0.72, 0.16, 1.48, 0.04), goldGrad(ctx), lw * 0.6, false);
  }
  inked(ctx, () => roundRect(ctx, -0.9, -0.12, 1.8, 0.14, 0.04), goldGrad(ctx, -0.12, 0.02), lw * 0.6, false);
  // lock plate with gem
  inked(ctx, () => roundRect(ctx, -0.17, -0.2, 0.34, 0.36, 0.08), goldGrad(ctx, -0.2, 0.2), lw * 0.7);
  const g = GEM[0] as GemTone;
  ctx.beginPath();
  ctx.arc(0, -0.02, 0.08, 0, Math.PI * 2);
  ctx.fillStyle = g.base;
  ctx.fill();
  // glow + sparkle peeking out of the lid
  sparkle(ctx, 0.56, -0.72, 0.26, '#fff6c8');
}

function speaker(ctx: Ctx, lw: number, on: boolean): void {
  const body: Pt[] = [[-0.82, -0.26], [-0.44, -0.26], [0.02, -0.66], [0.02, 0.66], [-0.44, 0.26], [-0.82, 0.26]];
  inked(ctx, () => roundPoly(ctx, body, 0.08), lin(ctx, 0, -0.7, 0, 0.7, [[0, '#ffffff'], [1, '#e6d6bf']]), lw);
  ctx.lineCap = 'round';
  if (on) {
    for (const [r, a] of [[0.36, 0.7], [0.66, 0.75]] as Pt[]) {
      ctx.beginPath();
      ctx.arc(0.06, 0, r, -a, a);
      ctx.lineWidth = lw * 2 + 0.14;
      ctx.strokeStyle = UI.iconInk;
      ctx.stroke();
      ctx.lineWidth = 0.14;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  } else {
    for (const pass of [0, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.3, -0.3); ctx.lineTo(0.84, 0.3);
      ctx.moveTo(0.84, -0.3); ctx.lineTo(0.3, 0.3);
      ctx.lineWidth = pass ? 0.15 : lw * 2 + 0.15;
      ctx.strokeStyle = pass ? UI.danger : UI.iconInk;
      ctx.stroke();
    }
  }
}

function gear(ctx: Ctx, lw: number): void {
  const pts: Pt[] = [];
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [da, r] of [[0.0, 0.62], [0.12, 0.9], [0.38, 0.9], [0.5, 0.62]] as Pt[]) {
      const a = a0 + da * step;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  const path: PathFn = () => {
    roundPoly(ctx, pts, 0.06);
    ctx.moveTo(0.3, 0);
    ctx.arc(0, 0, 0.3, 0, Math.PI * 2, true);
  };
  path();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.fillStyle = steelGrad(ctx);
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(0, 0, 0.5, Math.PI * 1.1, Math.PI * 1.7);
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
}

function backArrow(ctx: Ctx, lw: number): void {
  const pts: Pt[] = [[-0.86, 0], [-0.1, -0.74], [-0.1, -0.32], [0.82, -0.32], [0.82, 0.32], [-0.1, 0.32], [-0.1, 0.74]];
  inked(ctx, () => roundPoly(ctx, pts, 0.1), lin(ctx, 0, -0.7, 0, 0.7, [[0, '#ffffff'], [1, '#e6d6bf']]), lw);
}

/** Circular arrow (restart level). */
function restart(ctx: Ctx, lw: number): void {
  const R = 0.74, r = 0.4, m = (R + r) / 2;
  const s = -Math.PI / 2 + 0.55, e = s + Math.PI * 1.55;
  const cs = Math.cos(e), sn = Math.sin(e);
  const path = () => {
    ctx.beginPath();
    ctx.arc(0, 0, R, s, e, false);
    ctx.lineTo((R + 0.2) * cs, (R + 0.2) * sn);
    ctx.lineTo(m * cs - 0.5 * sn, m * sn + 0.5 * cs);
    ctx.lineTo((r - 0.2) * cs, (r - 0.2) * sn);
    ctx.arc(0, 0, r, e, s, true);
    ctx.closePath();
  };
  inked(ctx, path, lin(ctx, 0, -0.7, 0, 0.7, [[0, '#ffffff'], [1, '#e6d6bf']]), lw);
}

/** Waste bin (reset progress). */
function bin(ctx: Ctx, lw: number): void {
  const red = lin(ctx, 0, -0.8, 0, 0.9, [[0, '#ffb4a8'], [1, UI.danger]]);
  inked(ctx, () => roundRect(ctx, -0.22, -0.86, 0.44, 0.24, 0.07), red, lw, false);
  inked(ctx, () => roundPoly(ctx, [[-0.56, -0.38], [0.56, -0.38], [0.44, 0.86], [-0.44, 0.86]], 0.1), red, lw);
  inked(ctx, () => roundRect(ctx, -0.74, -0.66, 1.48, 0.26, 0.1), red, lw);
  ctx.beginPath();
  for (const x of [-0.2, 0, 0.2]) {
    ctx.moveTo(x * 1.1, -0.18);
    ctx.lineTo(x, 0.66);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = lw * 1.6;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
}

function levels(ctx: Ctx, lw: number): void {
  const cols = [GEM[0], GEM[1], GEM[2], GEM[3]];
  let i = 0;
  for (const y of [-0.82, 0.08]) {
    for (const x of [-0.82, 0.08]) {
      const t = cols[i++] as GemTone;
      inked(ctx, () => roundRect(ctx, x, y, 0.74, 0.74, 0.18), lin(ctx, 0, y, 0, y + 0.74, [[0, t.light], [1, t.base]]), lw * 0.9);
    }
  }
}

export function lock(ctx: Ctx, lw: number): void {
  // shackle
  ctx.beginPath();
  ctx.arc(0, -0.28, 0.42, Math.PI, 0);
  ctx.lineTo(0.42, 0);
  ctx.moveTo(-0.42, 0);
  ctx.lineTo(-0.42, -0.28);
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.2 + lw * 2;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.lineWidth = 0.2;
  ctx.strokeStyle = steelGrad(ctx, -0.8, 0);
  ctx.stroke();
  inked(ctx, () => roundRect(ctx, -0.7, -0.12, 1.4, 1.0, 0.2), goldGrad(ctx, -0.12, 0.9), lw);
  // keyhole
  ctx.beginPath();
  ctx.arc(0, 0.26, 0.12, 0, Math.PI * 2);
  ctx.moveTo(-0.06, 0.3);
  ctx.lineTo(-0.1, 0.62);
  ctx.lineTo(0.1, 0.62);
  ctx.lineTo(0.06, 0.3);
  ctx.fillStyle = GOLD.edge;
  ctx.fill();
}

// ---------- perk badges ----------

export function badge(ctx: Ctx, lw: number, p: { primary: string; secondary: string; deep: string }): void {
  ctx.beginPath();
  ctx.arc(0, 0, 0.94, 0, Math.PI * 2);
  ctx.fillStyle = UI.iconInk;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 0.94 - lw * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = goldGrad(ctx);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 0.78, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, -0.25, -0.35, 0.05, 0.95, [[0, mix(p.primary, '#ffffff', 0.35)], [0.6, p.primary], [1, p.deep]]);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = GOLD.edge;
  ctx.stroke();
}

function perkJeweler(ctx: Ctx, lw: number): void {
  const p = PATH.jeweler;
  badge(ctx, lw, p);
  // brilliant gem in profile: crown + pavilion
  const crown: Pt[] = [[-0.5, -0.12], [-0.26, -0.42], [0.26, -0.42], [0.5, -0.12]];
  const outline: Pt[] = [[-0.5, -0.12], [-0.26, -0.42], [0.26, -0.42], [0.5, -0.12], [0, 0.56]];
  inked(ctx, () => poly(ctx, outline), p.secondary, lw, false);
  poly(ctx, crown);
  ctx.fillStyle = lin(ctx, 0, -0.42, 0, -0.12, [[0, '#ffe0ee'], [1, mix(p.secondary, '#ffffff', 0.3)]]);
  ctx.fill();
  for (const [pts, c] of [
    [[[-0.5, -0.12], [-0.16, -0.12], [0, 0.56]], mix(p.secondary, '#ffffff', 0.15)],
    [[[0.16, -0.12], [0.5, -0.12], [0, 0.56]], mix(p.secondary, '#7a0a3a', 0.3)],
  ] as [Pt[], string][]) {
    poly(ctx, pts);
    ctx.fillStyle = c;
    ctx.fill();
  }
  poly(ctx, outline);
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = '#5a0a2a';
  ctx.stroke();
  sparkle(ctx, 0.42, -0.44, 0.22, '#ffffff');
}

function perkArchaeologist(ctx: Ctx, lw: number): void {
  const p = PATH.archaeologist;
  badge(ctx, lw, p);
  // trowel (diagonal)
  ctx.save();
  ctx.rotate(0.7);
  inked(ctx, () => roundRect(ctx, -0.06, 0.06, 0.12, 0.5, 0.05), lin(ctx, 0, 0, 0, 0.6, [[0, '#6b4320'], [1, '#3a200e']]), lw * 0.8, false);
  inked(ctx, () => poly(ctx, [[0, -0.66], [0.26, -0.12], [0, 0.04], [-0.26, -0.12]]), steelGrad(ctx, -0.6, 0), lw * 0.8);
  ctx.restore();
  // brush (other diagonal)
  ctx.save();
  ctx.rotate(-0.7);
  inked(ctx, () => roundRect(ctx, -0.07, -0.08, 0.14, 0.66, 0.06), lin(ctx, 0, 0, 0, 0.6, [[0, mix(p.secondary, '#ffffff', 0.3)], [1, p.secondary]]), lw * 0.8, false);
  inked(ctx, () => roundRect(ctx, -0.12, -0.2, 0.24, 0.14, 0.03), goldGrad(ctx, -0.2, -0.06), lw * 0.6, false);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.2);
    ctx.lineTo(-0.2, -0.62);
    ctx.quadraticCurveTo(0, -0.7, 0.2, -0.62);
    ctx.lineTo(0.14, -0.2);
    ctx.closePath();
  }, lin(ctx, 0, -0.7, 0, -0.2, [[0, '#fff0d0'], [1, '#d9a866']]), lw * 0.7, false);
  ctx.restore();
}

function perkAlchemist(ctx: Ctx, lw: number): void {
  const p = PATH.alchemist;
  badge(ctx, lw, p);
  const flask: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.56);
    ctx.lineTo(-0.12, -0.2);
    ctx.arc(0, 0.2, 0.42, -Math.PI / 2 - 0.29, -Math.PI / 2 + 0.29 + Math.PI * 2, true);
    ctx.lineTo(0.12, -0.56);
    ctx.closePath();
  };
  inked(ctx, flask, rgba('#f2e8ff', 0.95), lw, false);
  // potion liquid
  ctx.save();
  flask();
  ctx.clip();
  ctx.fillStyle = lin(ctx, 0, 0, 0, 0.62, [[0, mix(p.secondary, '#ffffff', 0.3)], [1, mix(p.secondary, '#0a5a1a', 0.35)]]);
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.08);
  ctx.quadraticCurveTo(0, -0.02, 0.6, 0.08);
  ctx.lineTo(0.6, 0.7);
  ctx.lineTo(-0.6, 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [x, y, r] of [[-0.12, 0.3, 0.06], [0.1, 0.42, 0.045], [0.02, 0.18, 0.035]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(-0.2, 0.06, 0.08, 0.2, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  ctx.restore();
  flask();
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = mix(p.primary, '#000000', 0.4);
  ctx.stroke();
  // cork
  inked(ctx, () => roundRect(ctx, -0.16, -0.7, 0.32, 0.16, 0.05), lin(ctx, 0, -0.7, 0, -0.54, [[0, '#e0b07a'], [1, '#9a6234']]), lw * 0.6, false);
}

function perkBlacksmith(ctx: Ctx, lw: number): void {
  const p = PATH.blacksmith;
  badge(ctx, lw, p);
  // anvil
  const anvil: Pt[] = [[-0.62, 0.02], [0.5, 0.02], [0.66, -0.06], [0.44, 0.2], [0.2, 0.22], [0.26, 0.44], [0.44, 0.56], [-0.44, 0.56], [-0.26, 0.44], [-0.2, 0.22], [-0.4, 0.2]];
  inked(ctx, () => roundPoly(ctx, anvil, 0.04), lin(ctx, 0, 0, 0, 0.56, [[0, '#a7b0be'], [0.3, p.secondary], [1, '#2a2f38']]), lw * 0.8);
  // hammer
  ctx.save();
  ctx.translate(0.06, -0.26);
  ctx.rotate(-0.6);
  inked(ctx, () => roundRect(ctx, -0.05, -0.1, 0.1, 0.62, 0.04), lin(ctx, 0, 0, 0, 0.6, [[0, '#c27a3e'], [1, '#6b3a18']]), lw * 0.7, false);
  inked(ctx, () => roundRect(ctx, -0.3, -0.28, 0.6, 0.2, 0.05), steelGrad(ctx, -0.28, -0.08), lw * 0.7);
  ctx.restore();
  // sparks
  for (const [x, y, r] of [[-0.36, -0.2, 0.14], [-0.5, -0.42, 0.09], [-0.14, -0.5, 0.08]] as [number, number, number][]) {
    sparkle(ctx, x, y, r, '#fff1a8');
  }
}

const PERKS: Record<PathId, (ctx: Ctx, lw: number) => void> = {
  jeweler: perkJeweler,
  archaeologist: perkArchaeologist,
  alchemist: perkAlchemist,
  blacksmith: perkBlacksmith,
};

// ---------- tutorial hand ----------

function hand(ctx: Ctx, lw: number): void {
  ctx.rotate(-0.35);
  const glove = lin(ctx, -0.5, -1, 0.5, 1, [[0, '#ffffff'], [1, '#e9dccb']]);
  const parts: PathFn[] = [
    () => roundRect(ctx, -0.46, -0.98, 0.3, 1.0, 0.15), // index finger
    () => roundRect(ctx, -0.12, -0.3, 0.24, 0.42, 0.12), // curled fingers (knuckles)
    () => roundRect(ctx, 0.1, -0.24, 0.24, 0.42, 0.12),
    () => roundRect(ctx, 0.3, -0.14, 0.22, 0.38, 0.11),
    () => roundRect(ctx, -0.46, -0.12, 0.98, 0.78, 0.3), // palm
    () => { ctx.beginPath(); ctx.ellipse(-0.42, 0.22, 0.14, 0.27, 0.5, 0, Math.PI * 2); }, // thumb
  ];
  // outline pass for every part, then fill pass: reads as one inked silhouette
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 2.4;
  ctx.strokeStyle = UI.iconInk;
  for (const p of parts) { p(); ctx.stroke(); }
  ctx.fillStyle = glove;
  for (const p of parts) { p(); ctx.fill(); }
  // inner separation lines for the fingers
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = rgba(UI.iconInk, 0.6);
  for (const p of parts.slice(5)) { p(); ctx.stroke(); }
  // cuff
  inked(ctx, () => roundRect(ctx, -0.42, 0.56, 0.9, 0.3, 0.1), lin(ctx, 0, 0.56, 0, 0.86, [[0, GOLD.light], [1, GOLD.dark]]), lw);
  // fingertip shine
  ctx.beginPath();
  ctx.ellipse(-0.36, -0.8, 0.05, 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
}

export type IconId = 'moves' | 'depth' | 'relic' | 'sound_on' | 'sound_off' | 'settings' | 'back' | 'levels' | 'lock' | 'hand' | 'restart' | 'bin';

const ICONS: Record<IconId, (ctx: Ctx, lw: number) => void> = {
  moves: pickaxe,
  depth,
  relic: chest,
  sound_on: (c, l) => speaker(c, l, true),
  sound_off: (c, l) => speaker(c, l, false),
  settings: gear,
  back: backArrow,
  levels,
  lock,
  hand,
  restart,
  bin,
};

export function paintIcon(ctx: Ctx, s: number, id: IconId): void {
  ctx.save();
  ctx.shadowColor = 'rgba(30,12,0,0.45)';
  ctx.shadowBlur = s * 0.04;
  ctx.shadowOffsetY = s * 0.04;
  unit(ctx, s, s, (lw) => ICONS[id](ctx, lw), 0.86);
  ctx.restore();
}

export function paintPerk(ctx: Ctx, s: number, path: PathId): void {
  unit(ctx, s, s, (lw) => PERKS[path](ctx, lw), 0.95);
}

// ---------- particles ----------

export function paintSpark(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h, [[0, FX.sparkCore], [0.25, FX.spark], [0.6, FX.sparkGlow], [1, 'rgba(255,170,40,0)']]);
  ctx.fillRect(0, 0, s, s);
}

export function paintDust(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h, [[0, rgba(FX.dust, 0.9)], [0.5, rgba(FX.dust, 0.5)], [1, rgba(FX.dust, 0)]]);
  ctx.fillRect(0, 0, s, s);
}

export function paintGlint(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h * 0.6, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(0, 0, s, s);
  sparkle(ctx, h, h, h * 0.98, FX.glint, 0.12);
  ctx.save();
  ctx.translate(h, h);
  ctx.rotate(Math.PI / 4);
  sparkle(ctx, 0, 0, h * 0.5, 'rgba(255,255,255,0.8)', 0.15);
  ctx.restore();
}

export function paintGlow(ctx: Ctx, s: number): void {
  const h = s / 2;
  ctx.fillStyle = rad(ctx, h, h, 0, h, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(0, 0, s, s);
}
