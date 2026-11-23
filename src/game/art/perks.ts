// v2 perks screen art: 8 perk icons (path-coloured badges), node frames (owned / available / locked),
// perk point and reforge token counters, plus level badges (boss, hard), the boss banner and boss level tile.
import type { PerkIconId } from './keys';
import { GOLD, GEM, PATH, UI, STEEL, type GemTone } from './palette';
import { type Ctx, type Pt, mix, rgba, poly, roundPoly, roundRect, lin, rad, star, sparkle } from './draw';
import { unit, inked, goldGrad, steelGrad, badge, lock, type PathFn } from './ui';

type Path = { primary: string; secondary: string; deep: string };

function dot(ctx: Ctx, x: number, y: number, r: number): PathFn {
  return () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
}

/** Gem in profile (crown + pavilion), centred at (x, y), half-width w. */
function profileGem(ctx: Ctx, x: number, y: number, w: number, body: string, lw: number, deep: string): void {
  const h = w * 1.05;
  const outline: Pt[] = [[x - w, y - h * 0.18], [x - w * 0.52, y - h * 0.62], [x + w * 0.52, y - h * 0.62], [x + w, y - h * 0.18], [x, y + h * 0.92]];
  inked(ctx, () => poly(ctx, outline), body, lw, false);
  poly(ctx, [[x - w, y - h * 0.18], [x - w * 0.52, y - h * 0.62], [x + w * 0.52, y - h * 0.62], [x + w, y - h * 0.18]]);
  ctx.fillStyle = lin(ctx, 0, y - h * 0.62, 0, y - h * 0.18, [[0, '#ffffff'], [1, mix(body, '#ffffff', 0.45)]]);
  ctx.fill();
  poly(ctx, [[x - w, y - h * 0.18], [x - w * 0.3, y - h * 0.18], [x, y + h * 0.92]]);
  ctx.fillStyle = mix(body, '#ffffff', 0.25);
  ctx.fill();
  poly(ctx, [[x + w * 0.3, y - h * 0.18], [x + w, y - h * 0.18], [x, y + h * 0.92]]);
  ctx.fillStyle = mix(body, deep, 0.35);
  ctx.fill();
  poly(ctx, outline);
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = deep;
  ctx.stroke();
}

function brilliant(ctx: Ctx, lw: number, p: Path): void {
  // light rays
  ctx.save();
  ctx.translate(0, -0.02);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.12) * 0.2, Math.sin(a - 0.12) * 0.2);
    ctx.lineTo(Math.cos(a) * 0.74, Math.sin(a) * 0.74);
    ctx.lineTo(Math.cos(a + 0.12) * 0.2, Math.sin(a + 0.12) * 0.2);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(255,250,200,0.7)';
    ctx.fill();
  }
  ctx.restore();
  profileGem(ctx, 0, 0.0, 0.42, p.secondary, lw, '#5a0a2a');
  sparkle(ctx, 0.44, -0.42, 0.24, '#ffffff');
  sparkle(ctx, -0.46, 0.34, 0.14, '#ffffff');
}

function flawless(ctx: Ctx, lw: number, p: Path): void {
  // halo
  ctx.beginPath();
  ctx.ellipse(0, -0.5, 0.34, 0.1, 0, 0, Math.PI * 2);
  ctx.lineWidth = 0.09 + lw * 2;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = goldGrad(ctx, -0.62, -0.38);
  ctx.stroke();
  // clear white diamond
  profileGem(ctx, 0, 0.08, 0.46, '#dff6ff', lw, p.deep);
  // inner facet lines
  ctx.beginPath();
  ctx.moveTo(-0.24, -0.11); ctx.lineTo(0, 0.55); ctx.lineTo(0.24, -0.11);
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = rgba(p.deep, 0.5);
  ctx.stroke();
  sparkle(ctx, -0.18, -0.2, 0.18, '#ffffff');
  sparkle(ctx, 0.5, -0.2, 0.14, '#ffffff');
}

function softBrush(ctx: Ctx, lw: number, p: Path): void {
  // crust slab with a crack at the bottom
  const slab: PathFn = () => roundRect(ctx, -0.6, 0.18, 1.2, 0.42, 0.1);
  inked(ctx, slab, lin(ctx, 0, 0.18, 0, 0.6, [[0, '#f1c48a'], [1, '#a8683a']]), lw, false);
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.2); ctx.lineTo(-0.18, 0.36); ctx.lineTo(-0.28, 0.5); ctx.lineTo(-0.16, 0.6);
  ctx.moveTo(0.3, 0.2); ctx.lineTo(0.2, 0.34); ctx.lineTo(0.32, 0.46);
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = '#4a2510';
  ctx.stroke();
  // dust puffs
  for (const [x, y, r] of [[-0.46, 0.04, 0.1], [-0.3, -0.04, 0.08], [0.46, 0.06, 0.09]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,215,0.85)';
    ctx.fill();
  }
  // big brush, tilted
  ctx.save();
  ctx.translate(0.06, -0.12);
  ctx.rotate(-0.55);
  inked(ctx, () => roundRect(ctx, -0.08, -0.7, 0.16, 0.5, 0.07), lin(ctx, 0, -0.7, 0, -0.2, [[0, mix(p.secondary, '#ffffff', 0.35)], [1, p.secondary]]), lw * 0.9, false);
  inked(ctx, () => roundRect(ctx, -0.15, -0.24, 0.3, 0.14, 0.03), goldGrad(ctx, -0.24, -0.1), lw * 0.8, false);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-0.15, -0.1);
    ctx.lineTo(-0.22, 0.26);
    ctx.quadraticCurveTo(0, 0.34, 0.22, 0.26);
    ctx.lineTo(0.15, -0.1);
    ctx.closePath();
  }, lin(ctx, 0, -0.1, 0, 0.3, [[0, '#d9a866'], [1, '#fff0d0']]), lw * 0.8, false);
  ctx.beginPath();
  for (const x of [-0.1, 0, 0.1]) { ctx.moveTo(x, -0.04); ctx.lineTo(x * 1.3, 0.24); }
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = 'rgba(122,80,40,0.7)';
  ctx.stroke();
  ctx.restore();
}

function treasureSense(ctx: Ctx, lw: number): void {
  // parchment map
  const map: Pt[] = [[-0.62, -0.42], [-0.2, -0.5], [0.2, -0.42], [0.62, -0.5], [0.62, 0.42], [0.2, 0.5], [-0.2, 0.42], [-0.62, 0.5]];
  inked(ctx, () => roundPoly(ctx, map, 0.04), lin(ctx, 0, -0.5, 0, 0.5, [[0, '#fff3d6'], [1, '#e8c98e']]), lw, false);
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.5); ctx.lineTo(-0.2, 0.42);
  ctx.moveTo(0.2, -0.42); ctx.lineTo(0.2, 0.5);
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = 'rgba(122,80,40,0.45)';
  ctx.stroke();
  // dashed trail + X
  ctx.beginPath();
  ctx.moveTo(-0.5, 0.3);
  ctx.bezierCurveTo(-0.3, -0.1, 0.0, 0.3, 0.12, -0.04);
  ctx.setLineDash([0.07, 0.06]);
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = '#8a4f24';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0.1, -0.26); ctx.lineTo(0.3, -0.06);
  ctx.moveTo(0.3, -0.26); ctx.lineTo(0.1, -0.06);
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = (GEM[0] as GemTone).base;
  ctx.stroke();
  // magnifier
  ctx.save();
  ctx.translate(0.1, 0.06);
  ctx.beginPath();
  ctx.moveTo(0.22, 0.22); ctx.lineTo(0.52, 0.52);
  ctx.lineWidth = 0.16 + lw * 2;
  ctx.strokeStyle = UI.iconInk;
  ctx.stroke();
  ctx.lineWidth = 0.16;
  ctx.strokeStyle = lin(ctx, 0.2, 0.2, 0.5, 0.5, [[0, '#c27a3e'], [1, '#6b3a18']]);
  ctx.stroke();
  inked(ctx, dot(ctx, 0, 0, 0.32), goldGrad(ctx, -0.32, 0.32), lw, false);
  ctx.beginPath();
  ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
  ctx.fillStyle = rgba('#bff4ee', 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.08, -0.09, 0.1, 0.05, -0.7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.restore();
}

function roundFlask(ctx: Ctx, cx: number, cy: number, r: number): PathFn {
  return () => {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy - r * 1.7);
    ctx.lineTo(cx - r * 0.3, cy - r * 0.9);
    ctx.arc(cx, cy, r, -Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3 + Math.PI * 2, true);
    ctx.lineTo(cx + r * 0.3, cy - r * 1.7);
    ctx.closePath();
  };
}

function liquid(ctx: Ctx, flask: PathFn, level: number, top: string, bottom: string, lw: number, rim: string): void {
  inked(ctx, flask, rgba('#f4ecff', 0.95), lw, false);
  ctx.save();
  flask();
  ctx.clip();
  ctx.fillStyle = lin(ctx, 0, level, 0, 0.7, [[0, top], [1, bottom]]);
  ctx.beginPath();
  ctx.moveTo(-1, level + 0.03);
  ctx.quadraticCurveTo(0, level - 0.05, 1, level + 0.03);
  ctx.lineTo(1, 1);
  ctx.lineTo(-1, 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.16, 0.0, 0.06, 0.16, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.restore();
  flask();
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = rim;
  ctx.stroke();
}

function arrowArc(ctx: Ctx, r: number, a0: number, a1: number, color: string, lw: number): void {
  const head = (a: number, dir: number): void => {
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const tx = -Math.sin(a) * dir;
    const ty = Math.cos(a) * dir;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    poly(ctx, [[x + tx * 0.18, y + ty * 0.18], [x + nx * 0.12, y + ny * 0.12], [x - nx * 0.12, y - ny * 0.12]]);
  };
  for (const pass of [0, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.lineCap = 'round';
    ctx.lineWidth = pass ? 0.09 : 0.09 + lw * 2;
    ctx.strokeStyle = pass ? color : UI.iconInk;
    ctx.stroke();
    head(a1, 1);
    ctx.lineJoin = 'round';
    if (!pass) { ctx.lineWidth = lw * 2; ctx.stroke(); }
    ctx.fillStyle = pass ? color : UI.iconInk;
    ctx.fill();
  }
}

function transmute(ctx: Ctx, lw: number, p: Path): void {
  const ruby = GEM[0] as GemTone;
  const sap = GEM[1] as GemTone;
  arrowArc(ctx, 0.64, -Math.PI * 0.95, -Math.PI * 0.2, ruby.light, lw);
  arrowArc(ctx, 0.64, Math.PI * 0.05, Math.PI * 0.8, sap.light, lw);
  liquid(ctx, roundFlask(ctx, 0, 0.14, 0.34), 0.02, ruby.light, sap.base, lw, mix(p.primary, '#000000', 0.4));
  inked(ctx, () => roundRect(ctx, -0.13, -0.52, 0.26, 0.12, 0.04), lin(ctx, 0, -0.52, 0, -0.4, [[0, '#e0b07a'], [1, '#9a6234']]), lw * 0.6, false);
}

function volatile(ctx: Ctx, lw: number, p: Path): void {
  // conical flask, bubbling over
  const flask: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.4);
    ctx.lineTo(-0.12, -0.12);
    ctx.lineTo(-0.48, 0.5);
    ctx.quadraticCurveTo(-0.52, 0.62, -0.38, 0.62);
    ctx.lineTo(0.38, 0.62);
    ctx.quadraticCurveTo(0.52, 0.62, 0.48, 0.5);
    ctx.lineTo(0.12, -0.12);
    ctx.lineTo(0.12, -0.4);
    ctx.closePath();
  };
  liquid(ctx, flask, 0.12, mix(p.secondary, '#ffffff', 0.35), mix(p.secondary, '#0a5a1a', 0.3), lw, mix(p.primary, '#000000', 0.4));
  // bubbles inside
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [x, y, r] of [[-0.12, 0.4, 0.06], [0.14, 0.3, 0.05], [0.0, 0.5, 0.04]] as [number, number, number][]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // foam + bubbles escaping
  for (const [x, y, r] of [[0, -0.46, 0.13], [-0.16, -0.6, 0.09], [0.2, -0.64, 0.11], [0.02, -0.78, 0.07]] as [number, number, number][]) {
    inked(ctx, dot(ctx, x, y, r), rad(ctx, x - r * 0.3, y - r * 0.3, r * 0.1, r, [[0, '#ffffff'], [1, mix(p.secondary, '#ffffff', 0.4)]]), lw * 0.7, false);
  }
  // little power spark
  const sp = star(ctx, 0.5, -0.4, 4, 0.2, 0.07);
  inked(ctx, () => poly(ctx, sp), goldGrad(ctx, -0.6, -0.2), lw * 0.6, false);
  sparkle(ctx, -0.5, -0.3, 0.12, '#ffffff');
}

function toolBelt(ctx: Ctx, lw: number, p: Path): void {
  const leather = lin(ctx, 0, -0.3, 0, 0.6, [[0, '#c27a3e'], [1, '#6b3a18']]);
  // tool handles sticking out of the pouches
  ctx.save();
  ctx.translate(-0.36, -0.08);
  ctx.rotate(-0.25);
  inked(ctx, () => roundRect(ctx, -0.05, -0.5, 0.1, 0.5, 0.04), lin(ctx, 0, -0.5, 0, 0, [[0, '#d08a4c'], [1, '#8a4f24']]), lw * 0.7, false);
  inked(ctx, () => roundRect(ctx, -0.18, -0.62, 0.36, 0.14, 0.04), steelGrad(ctx, -0.62, -0.48), lw * 0.7, false);
  ctx.restore();
  ctx.save();
  ctx.translate(0.36, -0.08);
  ctx.rotate(0.25);
  inked(ctx, () => roundRect(ctx, -0.05, -0.56, 0.1, 0.56, 0.04), steelGrad(ctx, -0.56, 0), lw * 0.7, false);
  inked(ctx, () => { ctx.beginPath(); ctx.arc(0, -0.58, 0.12, 0, Math.PI * 2); ctx.moveTo(0.05, -0.58); ctx.arc(0, -0.58, 0.05, 0, Math.PI * 2, true); }, steelGrad(ctx, -0.7, -0.46), lw * 0.7, false);
  ctx.restore();
  // belt strap
  inked(ctx, () => roundRect(ctx, -0.74, -0.2, 1.48, 0.22, 0.06), leather, lw, false);
  ctx.beginPath();
  ctx.moveTo(-0.7, -0.15); ctx.lineTo(0.7, -0.15);
  ctx.moveTo(-0.7, -0.03); ctx.lineTo(0.7, -0.03);
  ctx.setLineDash([0.05, 0.04]);
  ctx.lineWidth = lw * 0.4;
  ctx.strokeStyle = 'rgba(255,220,170,0.6)';
  ctx.stroke();
  ctx.setLineDash([]);
  // two pouches
  for (const x of [-0.36, 0.36]) {
    inked(ctx, () => roundRect(ctx, x - 0.2, -0.02, 0.4, 0.5, 0.1), lin(ctx, 0, 0, 0, 0.5, [[0, '#b06a34'], [1, '#5a3014']]), lw, false);
    inked(ctx, () => roundRect(ctx, x - 0.2, -0.02, 0.4, 0.16, 0.06), mix(p.primary, '#6b3a18', 0.4), lw * 0.6, false);
  }
  // buckle
  inked(ctx, () => { roundRect(ctx, -0.16, -0.26, 0.32, 0.34, 0.06); ctx.moveTo(0.08, -0.18); roundRect(ctx, -0.08, -0.18, 0.16, 0.18, 0.03); }, goldGrad(ctx, -0.26, 0.08), lw * 0.8, false);
  ctx.beginPath();
  roundRect(ctx, -0.08, -0.18, 0.16, 0.18, 0.03);
  ctx.fillStyle = '#6b3a18';
  ctx.fill();
}

function tempered(ctx: Ctx, lw: number, p: Path): void {
  // glowing ingot
  ctx.save();
  ctx.shadowColor = 'rgba(255,140,30,0.9)';
  ctx.shadowBlur = 0.25;
  const ingot: Pt[] = [[-0.56, 0.58], [-0.42, 0.24], [0.42, 0.24], [0.56, 0.58]];
  inked(ctx, () => roundPoly(ctx, ingot, 0.04), lin(ctx, 0, 0.24, 0, 0.58, [[0, '#fff3a8'], [0.4, '#ffb12a'], [1, '#e2541a']]), lw, false);
  ctx.restore();
  poly(ctx, [[-0.42, 0.24], [0.42, 0.24], [0.36, 0.32], [-0.36, 0.32]]);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  // hammer striking
  ctx.save();
  ctx.translate(0.12, -0.18);
  ctx.rotate(-0.5);
  inked(ctx, () => roundRect(ctx, -0.06, -0.12, 0.12, 0.7, 0.05), lin(ctx, 0, 0, 0, 0.6, [[0, '#c27a3e'], [1, '#6b3a18']]), lw * 0.8, false);
  inked(ctx, () => roundRect(ctx, -0.34, -0.34, 0.68, 0.24, 0.06), steelGrad(ctx, -0.34, -0.1), lw * 0.8);
  ctx.restore();
  // sparks
  for (const [x, y, r] of [[-0.38, 0.06, 0.16], [-0.56, -0.16, 0.1], [0.5, 0.04, 0.12], [-0.18, -0.12, 0.08]] as [number, number, number][]) {
    sparkle(ctx, x, y, r, '#fff1a8');
  }
  void p;
}

const ICONS: Record<PerkIconId, [keyof typeof PATH, (ctx: Ctx, lw: number, p: Path) => void]> = {
  jeweler_brilliant: ['jeweler', brilliant],
  jeweler_flawless: ['jeweler', flawless],
  arch_softcrust: ['archaeologist', softBrush],
  arch_treasure: ['archaeologist', (c, l) => treasureSense(c, l)],
  alch_transmute: ['alchemist', transmute],
  alch_volatile: ['alchemist', volatile],
  smith_toolbelt: ['blacksmith', toolBelt],
  smith_tempered: ['blacksmith', tempered],
};

export function paintPerkIcon(ctx: Ctx, s: number, id: PerkIconId): void {
  const [path, fn] = ICONS[id];
  const p = PATH[path];
  unit(ctx, s, s, (lw) => {
    badge(ctx, lw, p);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
    ctx.clip();
    fn(ctx, lw * 0.85, p);
    ctx.restore();
  }, 0.95);
}

// ---------- perk nodes ----------

export type NodeState = 'owned' | 'available' | 'locked';

/** Perk node socket: a ring + dark well that frames a perk icon drawn on top at ~0.74 of the node size. */
export function paintPerkNode(ctx: Ctx, s: number, state: NodeState): void {
  unit(ctx, s, s, (lw) => {
    const R = 0.8;
    if (state === 'owned') {
      ctx.fillStyle = rad(ctx, 0, 0, 0.5, 1, [[0, 'rgba(255,214,90,0.9)'], [0.5, 'rgba(255,190,60,0.35)'], [1, 'rgba(255,190,60,0)']]);
      ctx.fillRect(-1, -1, 2, 2);
    } else if (state === 'available') {
      ctx.fillStyle = rad(ctx, 0, 0, 0.5, 1, [[0, 'rgba(255,255,255,0.85)'], [0.5, 'rgba(160,240,255,0.35)'], [1, 'rgba(160,240,255,0)']]);
      ctx.fillRect(-1, -1, 2, 2);
    }
    // ring body
    ctx.save();
    ctx.shadowColor = 'rgba(20,8,0,0.5)';
    ctx.shadowBlur = s * 0.04;
    ctx.shadowOffsetY = s * 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, R - lw * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = state === 'owned' ? goldGrad(ctx, -R, R)
      : state === 'available' ? lin(ctx, 0, -R, 0, R, [[0, '#ffffff'], [0.4, '#c8f6ff'], [1, '#4fb8d6']])
      : lin(ctx, 0, -R, 0, R, [[0, '#8a8580'], [0.5, '#5c5854'], [1, '#34302c']]);
    ctx.fill();
    // decorative studs around the ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * (R - 0.08);
      const y = Math.sin(a) * (R - 0.08);
      ctx.beginPath();
      ctx.arc(x, y, 0.035, 0, Math.PI * 2);
      ctx.fillStyle = state === 'owned' ? GOLD.highlight : state === 'available' ? '#ffffff' : '#a29c96';
      ctx.fill();
    }
    // inner well
    ctx.beginPath();
    ctx.arc(0, 0, 0.66, 0, Math.PI * 2);
    ctx.fillStyle = state === 'locked' ? lin(ctx, 0, -0.66, 0, 0.66, [[0, '#1a1410'], [1, '#3a3028']])
      : lin(ctx, 0, -0.66, 0, 0.66, [[0, '#2a160a'], [1, '#5a3420']]);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = state === 'owned' ? GOLD.edge : state === 'available' ? '#0b5a73' : '#1a1612';
    ctx.stroke();
    if (state === 'owned') {
      // green check medal bottom-right
      ctx.save();
      ctx.translate(0.64, 0.64);
      inked(ctx, dot(ctx, 0, 0, 0.22), lin(ctx, 0, -0.22, 0, 0.22, [[0, UI.buttonLight], [1, UI.buttonDark]]), lw * 0.8, false);
      ctx.beginPath();
      ctx.moveTo(-0.1, 0.0); ctx.lineTo(-0.02, 0.08); ctx.lineTo(0.11, -0.08);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
      sparkle(ctx, -0.6, -0.6, 0.18, '#ffffff');
    } else if (state === 'available') {
      // "+" medal bottom-right: ready to buy
      ctx.save();
      ctx.translate(0.64, 0.64);
      inked(ctx, dot(ctx, 0, 0, 0.22), goldGrad(ctx, -0.22, 0.22), lw * 0.8, false);
      ctx.beginPath();
      ctx.moveTo(-0.1, 0); ctx.lineTo(0.1, 0);
      ctx.moveTo(0, -0.1); ctx.lineTo(0, 0.1);
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = GOLD.edge;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(0.64, 0.64);
      ctx.scale(0.3, 0.3);
      lock(ctx, lw / 0.3);
      ctx.restore();
    }
  }, 1);
}

// ---------- counters ----------

/** Perk point: four-path quadrant orb in a gold ring with a white star (spend on any path). */
export function paintPerkPoint(ctx: Ctx, s: number): void {
  unit(ctx, s, s, (lw) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.96, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.96 - lw * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = goldGrad(ctx);
    ctx.fill();
    const cols = [PATH.jeweler.primary, PATH.archaeologist.primary, PATH.blacksmith.primary, PATH.alchemist.primary];
    cols.forEach((c, i) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 0.74, -Math.PI / 2 + (i * Math.PI) / 2, -Math.PI / 2 + ((i + 1) * Math.PI) / 2);
      ctx.closePath();
      ctx.fillStyle = rad(ctx, -0.2, -0.3, 0.05, 0.9, [[0, mix(c, '#ffffff', 0.45)], [1, mix(c, '#000000', 0.2)]]);
      ctx.fill();
    });
    ctx.beginPath();
    ctx.arc(0, 0, 0.74, 0, Math.PI * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = GOLD.edge;
    ctx.stroke();
    const pts = star(ctx, 0, 0.03, 5, 0.52, 0.24);
    inked(ctx, () => roundPoly(ctx, pts, 0.04), lin(ctx, 0, -0.5, 0, 0.5, [[0, '#ffffff'], [1, '#fff0c0']]), lw * 0.9, false);
    ctx.beginPath();
    ctx.ellipse(-0.25, -0.45, 0.4, 0.18, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }, 0.94);
}

/** Reforge token: copper coin, iron face, silver anvil with a hot spark burst. */
export function paintReforgeToken(ctx: Ctx, s: number): void {
  const copper = lin(ctx, 0, -1, 0, 1, [[0, '#ffd2a0'], [0.3, '#e88a4a'], [0.7, '#b0521f'], [1, '#6e2c0c']]);
  unit(ctx, s, s, (lw) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.96, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.96 - lw * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = copper;
    ctx.fill();
    // reeded edge
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78);
      ctx.lineTo(Math.cos(a) * 0.88, Math.sin(a) * 0.88);
      ctx.lineWidth = lw * 0.5;
      ctx.strokeStyle = 'rgba(80,30,5,0.5)';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.74, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, -0.2, -0.3, 0.05, 0.9, [[0, '#5a5f6a'], [1, '#22252c']]);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#4a1d08';
    ctx.stroke();
    // anvil
    const anvil: Pt[] = [[-0.56, 0.0], [0.42, 0.0], [0.58, -0.08], [0.38, 0.17], [0.16, 0.19], [0.22, 0.38], [0.38, 0.48], [-0.38, 0.48], [-0.22, 0.38], [-0.16, 0.19], [-0.36, 0.17]];
    ctx.save();
    ctx.translate(0, 0.04);
    inked(ctx, () => roundPoly(ctx, anvil, 0.03), lin(ctx, 0, 0, 0, 0.48, [[0, STEEL.faceLight], [0.35, STEEL.face], [1, STEEL.faceDark]]), lw * 0.8, false);
    ctx.restore();
    // spark burst
    const burst = star(ctx, -0.02, -0.3, 8, 0.32, 0.12);
    ctx.save();
    ctx.shadowColor = 'rgba(255,160,40,0.9)';
    ctx.shadowBlur = s * 0.06;
    poly(ctx, burst);
    ctx.fillStyle = rad(ctx, -0.02, -0.3, 0, 0.32, [[0, '#ffffff'], [0.4, '#ffe27a'], [1, '#ff8a1c']]);
    ctx.fill();
    ctx.restore();
    for (const [x, y, r] of [[-0.4, -0.38, 0.09], [0.38, -0.44, 0.1], [0.26, -0.12, 0.07]] as [number, number, number][]) sparkle(ctx, x, y, r, '#fff1a8');
    ctx.beginPath();
    ctx.ellipse(-0.3, -0.62, 0.36, 0.12, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }, 0.94);
}

// ---------- level badges, boss banner, boss tile ----------

const BOSS = { stone: '#c9a77a', stoneLight: '#f4dcb0', stoneDark: '#6e4a2a', crest: '#5a1f8a', crestLight: '#9a4fe0', horn: '#fff0d0', hornDark: '#c9a06a' };

function horn(ctx: Ctx, side: number, lw: number, k = 1): void {
  const hp: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(side * 0.34 * k, -0.28 * k);
    ctx.bezierCurveTo(side * 0.64 * k, -0.3 * k, side * 0.82 * k, -0.5 * k, side * 0.8 * k, -0.86 * k);
    ctx.bezierCurveTo(side * 0.66 * k, -0.62 * k, side * 0.5 * k, -0.56 * k, side * 0.3 * k, -0.52 * k);
    ctx.closePath();
  };
  inked(ctx, hp, lin(ctx, side * 0.3, -0.3, side * 0.8, -0.86, [[0, BOSS.hornDark], [0.5, BOSS.horn], [1, '#ffffff']]), lw, false);
}

/** Friendly horned stone idol face with a crown gem, on a violet crest. */
function bossFace(ctx: Ctx, lw: number): void {
  // crest backdrop (shield with points)
  const crest: Pt[] = [[0, -0.92], [0.62, -0.62], [0.86, -0.1], [0.66, 0.5], [0, 0.94], [-0.66, 0.5], [-0.86, -0.1], [-0.62, -0.62]];
  inked(ctx, () => roundPoly(ctx, crest, 0.12), rad(ctx, -0.2, -0.3, 0.05, 1.1, [[0, BOSS.crestLight], [0.6, BOSS.crest], [1, '#2a0a4a']]), lw);
  roundPoly(ctx, crest.map(([x, y]) => [x * 0.86, y * 0.86] as Pt), 0.1);
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = goldGrad(ctx);
  ctx.stroke();
  horn(ctx, -1, lw);
  horn(ctx, 1, lw);
  // stone head
  const head: PathFn = () => {
    ctx.beginPath();
    ctx.moveTo(-0.44, -0.36);
    ctx.quadraticCurveTo(0, -0.56, 0.44, -0.36);
    ctx.lineTo(0.48, 0.24);
    ctx.quadraticCurveTo(0.44, 0.6, 0, 0.64);
    ctx.quadraticCurveTo(-0.44, 0.6, -0.48, 0.24);
    ctx.closePath();
  };
  inked(ctx, head, lin(ctx, -0.4, -0.5, 0.4, 0.6, [[0, BOSS.stoneLight], [0.5, BOSS.stone], [1, BOSS.stoneDark]]), lw);
  // stone cracks / carved brow band
  ctx.beginPath();
  ctx.moveTo(-0.42, -0.14); ctx.quadraticCurveTo(0, -0.24, 0.42, -0.14);
  ctx.lineWidth = lw * 0.8;
  ctx.strokeStyle = rgba(BOSS.stoneDark, 0.8);
  ctx.stroke();
  // eyes: glowing, round and friendly with brows
  for (const sd of [-1, 1]) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,220,80,0.9)';
    ctx.shadowBlur = 0.12;
    ctx.beginPath();
    ctx.ellipse(sd * 0.2, 0.06, 0.14, 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1a3a';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(sd * 0.2, 0.07, 0.1, 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, sd * 0.2, 0.04, 0, 0.13, [[0, '#ffffff'], [0.4, '#fff4a0'], [1, '#ffb12a']]);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sd * 0.36, -0.12);
    ctx.lineTo(sd * 0.08, -0.07);
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = BOSS.stoneDark;
    ctx.stroke();
  }
  // grin with two little tusks
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.32);
  ctx.quadraticCurveTo(0, 0.46, 0.2, 0.32);
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = BOSS.stoneDark;
  ctx.lineCap = 'round';
  ctx.stroke();
  for (const sd of [-1, 1]) {
    inked(ctx, () => poly(ctx, [[sd * 0.16, 0.34], [sd * 0.08, 0.36], [sd * 0.13, 0.24]]), '#ffffff', lw * 0.5, false);
  }
  // crown gem on the forehead
  const t = GEM[0] as GemTone;
  const g: Pt[] = [[0, -0.5], [0.13, -0.38], [0, -0.22], [-0.13, -0.38]];
  inked(ctx, () => poly(ctx, g), lin(ctx, -0.1, -0.5, 0.1, -0.22, [[0, t.highlight], [0.4, t.light], [1, t.dark]]), lw * 0.8, false);
  sparkle(ctx, 0.48, -0.66, 0.16, '#ffffff');
}

export function paintBossBadge(ctx: Ctx, s: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(30,8,40,0.5)';
  ctx.shadowBlur = s * 0.04;
  ctx.shadowOffsetY = s * 0.03;
  unit(ctx, s, s, (lw) => bossFace(ctx, lw), 0.94);
  ctx.restore();
}

/** Hard level: red shield with a bold white "!". */
export function paintHardBadge(ctx: Ctx, s: number): void {
  const t = GEM[0] as GemTone;
  unit(ctx, s, s, (lw) => {
    const shield: PathFn = () => {
      ctx.beginPath();
      ctx.moveTo(0, -0.92);
      ctx.quadraticCurveTo(0.4, -0.7, 0.78, -0.72);
      ctx.quadraticCurveTo(0.82, 0.3, 0, 0.94);
      ctx.quadraticCurveTo(-0.82, 0.3, -0.78, -0.72);
      ctx.quadraticCurveTo(-0.4, -0.7, 0, -0.92);
      ctx.closePath();
    };
    inked(ctx, shield, lin(ctx, 0, -0.9, 0, 0.9, [[0, t.light], [0.5, t.base], [1, t.dark]]), lw);
    ctx.save();
    ctx.scale(0.82, 0.82);
    shield();
    ctx.restore();
    ctx.lineWidth = lw * 1.2;
    ctx.strokeStyle = goldGrad(ctx);
    ctx.stroke();
    inked(ctx, () => roundPoly(ctx, [[-0.12, -0.5], [0.12, -0.5], [0.08, 0.16], [-0.08, 0.16]], 0.05), '#ffffff', lw * 0.8, false);
    inked(ctx, dot(ctx, 0, 0.4, 0.1), '#ffffff', lw * 0.8, false);
  }, 0.94);
}

/**
 * "BOSS LEVEL" banner ribbon, w x h. Nine-slice horizontally with inset = `inset` px: the notched tails
 * and the small horns live inside the insets; the middle is uniform left-to-right.
 */
export function paintBossBanner(ctx: Ctx, w: number, h: number, inset: number): void {
  const bandTop = h * 0.26;
  const bandBot = h * 0.9;
  const lw = Math.max(1.5, h * 0.04);
  const tail = inset * 0.72;
  // tails (behind)
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? 0 : w;
    const pts: Pt[] = [[x0, bandTop + h * 0.1], [x0 - sd * tail, bandTop + h * 0.1], [x0 - sd * tail, bandBot + h * 0.06], [x0, bandBot + h * 0.06], [x0 - sd * tail * 0.4, (bandTop + bandBot) / 2 + h * 0.08]];
    poly(ctx, pts);
    ctx.fillStyle = BOSS.crest;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#1a0630';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  // main band
  const x0 = tail * 0.8;
  const x1 = w - tail * 0.8;
  ctx.save();
  ctx.shadowColor = 'rgba(20,4,30,0.5)';
  ctx.shadowBlur = h * 0.08;
  ctx.shadowOffsetY = h * 0.05;
  roundRect(ctx, x0, bandTop, x1 - x0, bandBot - bandTop, h * 0.1);
  ctx.fillStyle = '#1a0630';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x0 + lw, bandTop + lw, x1 - x0 - 2 * lw, bandBot - bandTop - 2 * lw, h * 0.08);
  ctx.fillStyle = lin(ctx, 0, bandTop, 0, bandBot, [[0, BOSS.crestLight], [0.45, BOSS.crest], [1, '#2a0a4a']]);
  ctx.fill();
  // gold trims
  for (const y of [bandTop + h * 0.08, bandBot - h * 0.08]) {
    ctx.beginPath();
    ctx.moveTo(x0 + h * 0.08, y);
    ctx.lineTo(x1 - h * 0.08, y);
    ctx.lineWidth = Math.max(1.5, h * 0.045);
    ctx.strokeStyle = GOLD.light;
    ctx.stroke();
  }
  // gloss
  ctx.fillStyle = lin(ctx, 0, bandTop, 0, (bandTop + bandBot) / 2, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(x0 + lw * 2, bandTop + lw * 2, x1 - x0 - lw * 4, (bandBot - bandTop) * 0.38);
  for (const sd of [-1, 1]) {
    // gem stud on the band end
    const sx = sd < 0 ? inset * 0.62 : w - inset * 0.62;
    const sy = (bandTop + bandBot) / 2;
    const r = h * 0.11;
    const t = GEM[0] as GemTone;
    ctx.beginPath();
    ctx.arc(sx, sy, r + lw, 0, Math.PI * 2);
    ctx.fillStyle = GOLD.base;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, sx - r * 0.3, sy - r * 0.3, 0, r, [[0, t.highlight], [0.4, t.light], [1, t.dark]]);
    ctx.fill();
  }
}

/** Boss level tile (nine-slice like PANEL: square s, inset = panelInset). Violet face in a gold rim; put badge_boss on its corner. */
export function paintBossTile(ctx: Ctx, s: number, u: number): void {
  const r = u * 0.42;
  const lw = Math.max(2, u * 0.07);
  const top = u * 0.12;
  ctx.save();
  ctx.shadowColor = 'rgba(20,4,30,0.5)';
  ctx.shadowBlur = u * 0.12;
  ctx.shadowOffsetY = u * 0.06;
  roundRect(ctx, lw, top + lw, s - 2 * lw, s - top - 2 * lw - u * 0.06, r);
  ctx.fillStyle = '#1a0630';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, lw, top + lw, s - 2 * lw, s - top - 2 * lw - u * 0.1, r);
  ctx.fillStyle = goldGrad(ctx, top, s);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, u * 0.04);
  ctx.strokeStyle = '#1a0630';
  ctx.stroke();
  const e = lw * 2.2;
  roundRect(ctx, e, top + e, s - 2 * e, s - top - 2 * e - u * 0.1, r * 0.75);
  ctx.fillStyle = lin(ctx, 0, top + e, 0, s - e, [[0, BOSS.crestLight], [0.5, BOSS.crest], [1, '#2a0a4a']]);
  ctx.fill();
  ctx.lineWidth = Math.max(1, u * 0.03);
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.stroke();
}
