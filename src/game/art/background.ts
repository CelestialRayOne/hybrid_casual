// Warm layered-earth backdrop: wavy sediment bands that deepen with depth, pebbles and faint fossils.
import { EARTH, type EarthBand } from './palette';
import { type Ctx, rng, mix, rgba } from './draw';

function bandAt(i: number): EarthBand {
  return EARTH[Math.max(0, Math.min(EARTH.length - 1, i))] as EarthBand;
}

/** Blend between strata for a fractional band index. */
function bandColor(f: number, which: 'top' | 'bottom' | 'line' | 'fleck'): string {
  const i = Math.floor(f);
  return mix(bandAt(i)[which], bandAt(i + 1)[which], f - i);
}

function ammonite(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  for (let t = 0; t < Math.PI * 5; t += 0.2) {
    const rr = r * Math.exp(-t * 0.2);
    const px = x + Math.cos(t) * rr;
    const py = y + Math.sin(t) * rr;
    if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  // ribs
  for (let t = 0; t < Math.PI * 2; t += 0.5) {
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(t) * r * 0.55, y + Math.sin(t) * r * 0.55);
    ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.stroke();
  }
}

function shell(ctx: Ctx, x: number, y: number, r: number, a: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();
  for (let i = 1; i < 5; i++) {
    const t = Math.PI + (i / 5) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Paint the backdrop into a w×h canvas. `depthRows` = how deep the board is (rows scrolled);
 * the whole palette shifts one stratum per ~12 rows, so deeper levels look deeper.
 * `unit` = cell size, used to scale details.
 */
export function paintBackground(ctx: Ctx, w: number, h: number, depthRows: number, unit: number): void {
  const r = rng(4242);
  const shift = Math.max(0, depthRows) / 12;
  const bands = 7;
  const bh = h / (bands - 1.5);
  // base fill
  ctx.fillStyle = bandColor(shift, 'top');
  ctx.fillRect(0, 0, w, h);

  for (let b = 0; b < bands; b++) {
    const f = shift + b * 0.6;
    const y0 = b * bh - bh * 0.4;
    const amp = bh * (0.08 + r() * 0.08);
    const freq = (Math.PI * 2) / (w * (0.6 + r() * 0.8));
    const phase = r() * 10;
    const edge = (x: number): number => y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 2) * amp * 0.3;
    // band body
    ctx.beginPath();
    ctx.moveTo(0, edge(0));
    for (let x = 0; x <= w; x += Math.max(8, w / 60)) ctx.lineTo(x, edge(x));
    ctx.lineTo(w, edge(w));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0, 0, y0 + bh * 1.2);
    g.addColorStop(0, bandColor(f, 'top'));
    g.addColorStop(1, bandColor(f, 'bottom'));
    ctx.fillStyle = g;
    ctx.fill();
    // dark contact line + light lip at the top of the band
    ctx.beginPath();
    ctx.moveTo(0, edge(0));
    for (let x = 0; x <= w; x += Math.max(8, w / 60)) ctx.lineTo(x, edge(x));
    ctx.strokeStyle = rgba(bandColor(f, 'line'), 0.85);
    ctx.lineWidth = Math.max(2, unit * 0.06);
    ctx.stroke();
    ctx.translate(0, unit * 0.06);
    ctx.strokeStyle = rgba(bandColor(f, 'fleck'), 0.45);
    ctx.lineWidth = Math.max(1, unit * 0.03);
    ctx.stroke();
    ctx.translate(0, -unit * 0.06);
    // thin sediment lines inside the band
    for (let l = 1; l <= 3; l++) {
      const off = (bh * l) / 4 + (r() - 0.5) * bh * 0.1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += Math.max(8, w / 50)) {
        const y = edge(x) + off + Math.sin(x * freq * 1.6 + l) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(bandColor(f, 'line'), 0.22);
      ctx.lineWidth = Math.max(1, unit * (0.02 + r() * 0.03));
      ctx.stroke();
    }
    // pebbles
    const pcount = Math.round((w / unit) * 1.4);
    for (let i = 0; i < pcount; i++) {
      const x = r() * w;
      const y = edge(x) + r() * bh;
      const pr = unit * (0.04 + r() * r() * 0.14);
      ctx.beginPath();
      ctx.ellipse(x, y + pr * 0.3, pr * 1.2, pr, r() * 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(bandColor(f, 'line'), 0.45);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, pr * 1.2, pr, r() * 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(bandColor(f, 'fleck'), 0.6);
      ctx.fill();
    }
    // fossils (faint)
    if (r() < 0.75) {
      const x = r() * w;
      const y = edge(x) + bh * (0.35 + r() * 0.4);
      const col = rgba(bandColor(f, 'line'), 0.4);
      if (r() < 0.5) ammonite(ctx, x, y, unit * (0.3 + r() * 0.25), col);
      else shell(ctx, x, y, unit * (0.25 + r() * 0.2), r() * 6, col);
    }
  }
  // fine grain
  const grains = Math.round((w * h) / (unit * unit) * 6);
  for (let i = 0; i < grains; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.12)' : 'rgba(40,15,0,0.12)';
    const gs = Math.max(1, unit * 0.03 * (0.5 + r()));
    ctx.fillRect(r() * w, r() * h, gs, gs);
  }
  // soft vignette for focus on the board column
  const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(30,10,0,0)');
  v.addColorStop(1, 'rgba(30,10,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
