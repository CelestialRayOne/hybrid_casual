// Relic boons (v2): small HUD badges (relic icon on a coloured round plate), a stack-count bubble, and
// the HUD goal-slot sockets (empty / bonus).
import { GOLD, UI, BOARD, GEM, type GemTone } from './palette';
import { type Ctx, mix, rgba, roundRect, lin, rad, star, roundPoly, sparkle } from './draw';
import { unit, goldGrad } from './ui';
import { paintRelicGlyph } from './relics';

/** Plate colour per relic type (deep, muted, distinct): sun coin, chalice, compass, star amulet, key, crowned ring. */
const PLATE = ['#c0601a', '#a0183c', '#13707e', '#1a7d46', '#5e2aa0', '#1d4fb0'] as const;

export function paintBoon(ctx: Ctx, s: number, variant: number): void {
  const plate = PLATE[variant % PLATE.length] as string;
  unit(ctx, s, s, (lw) => {
    ctx.save();
    ctx.shadowColor = 'rgba(20,8,0,0.5)';
    ctx.shadowBlur = s * 0.05;
    ctx.shadowOffsetY = s * 0.04;
    ctx.beginPath();
    ctx.arc(0, 0, 0.97, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 0.97 - lw * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = goldGrad(ctx);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.82, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, -0.25, -0.35, 0.05, 1, [[0, mix(plate, '#ffffff', 0.35)], [0.55, plate], [1, mix(plate, '#000000', 0.45)]]);
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = GOLD.edge;
    ctx.stroke();
    // relic glyph, slightly larger than the plate so it reads at 28 px
    paintRelicGlyph(ctx, 0, 0.02, 0.8, variant, lw * 0.8);
    // top gloss
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 0.82, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-0.2, -0.6, 0.7, 0.32, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.restore();
  }, 0.96);
}

/** Red count bubble (draw "2", "x3" etc. on it in white bold text). */
export function paintStackBubble(ctx: Ctx, s: number): void {
  const t = GEM[0] as GemTone;
  unit(ctx, s, s, (lw) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.96, 0, Math.PI * 2);
    ctx.fillStyle = UI.iconInk;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.96 - lw * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff7e6';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.72, 0, Math.PI * 2);
    ctx.fillStyle = lin(ctx, 0, -0.72, 0, 0.72, [[0, t.light], [0.5, t.base], [1, t.dark]]);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -0.38, 0.5, 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }, 0.98);
}

/** HUD goal socket. bonus = teal dashed ring + small gold star with a plus. */
export function paintRelicSlot(ctx: Ctx, s: number, bonus: boolean): void {
  const m = s * 0.06;
  roundRect(ctx, m, m, s - 2 * m, s - 2 * m, s * 0.22);
  ctx.fillStyle = lin(ctx, 0, 0, 0, s, [[0, BOARD.slotEdge], [0.4, BOARD.slot], [1, mix(BOARD.slot, BOARD.slotLight, 0.45)]]);
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.strokeStyle = rgba('#120800', 0.8);
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = lin(ctx, 0, m, 0, m + s * 0.25, [[0, 'rgba(10,4,0,0.5)'], [1, 'rgba(10,4,0,0)']]);
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
  // dashed relic ring
  const ring = bonus ? '#5fe0d0' : GOLD.base;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2);
  ctx.setLineDash([s * 0.07, s * 0.05]);
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  ctx.strokeStyle = rgba(ring, 0.75);
  ctx.stroke();
  ctx.setLineDash([]);
  // faint gem silhouette inside
  ctx.beginPath();
  const d = s * 0.13;
  ctx.moveTo(s / 2, s / 2 - d);
  ctx.lineTo(s / 2 + d, s / 2);
  ctx.lineTo(s / 2, s / 2 + d);
  ctx.lineTo(s / 2 - d, s / 2);
  ctx.closePath();
  ctx.fillStyle = rgba(ring, 0.3);
  ctx.fill();
  if (bonus) {
    unit(ctx, s, s, (lw) => {
      const pts = star(ctx, 0.56, -0.56, 5, 0.42, 0.2);
      roundPoly(ctx, pts, 0.04);
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw * 2;
      ctx.strokeStyle = UI.iconInk;
      ctx.stroke();
      ctx.fillStyle = goldGrad(ctx, -1, -0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.46, -0.54); ctx.lineTo(0.66, -0.54);
      ctx.moveTo(0.56, -0.64); ctx.lineTo(0.56, -0.44);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(lw * 1.1, 0.07);
      ctx.strokeStyle = GOLD.edge;
      ctx.stroke();
    }, 1);
    sparkle(ctx, s * 0.24, s * 0.78, s * 0.07, 'rgba(255,255,255,0.7)');
  }
}
