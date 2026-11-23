// Faceted, glossy gems. Each colour has its own cut/silhouette for colour-blind play:
//   ruby = cushion (rounded square), sapphire = pear (teardrop, point up),
//   emerald = tall octagon step cut, topaz = rhombus, amethyst = trillion (triangle).
import { GEM, GOLD, type GemTone } from './palette';
import { type Ctx, type Pt, mix, rgba, poly, roundPoly, roundRect, lin, rad, sparkle } from './draw';

const LIGHT: Pt = [-0.55, -0.83]; // light from top-left (unit vector)

interface Cut {
  /** Silhouette path in unit space (gem fits roughly in [-1,1]). */
  outline(ctx: Ctx): void;
  /** Outer key vertices for facets (clockwise from top). */
  ring: Pt[];
  /** Facet centre. */
  c: Pt;
  style: 'brilliant' | 'step';
  /** Table size relative to ring (0..1). */
  table: number;
  /** Unit-space scale tweak so every cut has similar visual weight. */
  scale: number;
}

function octagon(w: number, h: number, ch: number): Pt[] {
  return [
    [-w + ch, -h], [w - ch, -h], [w, -h + ch], [w, h - ch],
    [w - ch, h], [-w + ch, h], [-w, h - ch], [-w, -h + ch],
  ];
}

const tri: Pt[] = [[0, -0.98], [1.02, 0.8], [-1.02, 0.8]];
const triRing: Pt[] = [
  [0, -0.98], [0.56, -0.02], [1.02, 0.8], [0, 0.86], [-1.02, 0.8], [-0.56, -0.02],
];

const CUTS: Cut[] = [
  // ruby: cushion
  {
    outline: (ctx) => roundRect(ctx, -0.9, -0.9, 1.8, 1.8, 0.42),
    ring: [[0, -0.95], [0.78, -0.78], [0.95, 0], [0.78, 0.78], [0, 0.95], [-0.78, 0.78], [-0.95, 0], [-0.78, -0.78]],
    c: [0, 0], style: 'brilliant', table: 0.5, scale: 0.98,
  },
  // sapphire: pear, point up
  {
    outline: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, -1.02);
      ctx.bezierCurveTo(0.28, -0.66, 0.72, -0.3, 0.72, 0.26);
      ctx.arc(0, 0.26, 0.72, 0, Math.PI, false);
      ctx.bezierCurveTo(-0.72, -0.3, -0.28, -0.66, 0, -1.02);
      ctx.closePath();
    },
    ring: [[0, -1.02], [0.48, -0.42], [0.72, 0.26], [0.51, 0.77], [0, 0.98], [-0.51, 0.77], [-0.72, 0.26], [-0.48, -0.42]],
    c: [0, 0.2], style: 'brilliant', table: 0.5, scale: 1.04,
  },
  // emerald: tall octagon step cut
  {
    outline: (ctx) => poly(ctx, octagon(0.76, 0.98, 0.32)),
    ring: octagon(0.76, 0.98, 0.32),
    c: [0, 0], style: 'step', table: 0.5, scale: 1.0,
  },
  // topaz: rhombus
  {
    outline: (ctx) => roundPoly(ctx, [[0, -1.04], [0.9, 0], [0, 1.04], [-0.9, 0]], 0.14),
    ring: [[0, -1.0], [0.45, -0.52], [0.88, 0], [0.45, 0.52], [0, 1.0], [-0.45, 0.52], [-0.88, 0], [-0.45, -0.52]],
    c: [0, 0], style: 'brilliant', table: 0.46, scale: 1.04,
  },
  // amethyst: trillion
  {
    outline: (ctx) => roundPoly(ctx, tri, 0.2),
    ring: triRing,
    c: [0, 0.22], style: 'brilliant', table: 0.48, scale: 1.0,
  },
];

function shadeColor(tone: GemTone, s: number): string {
  // s in -1..1: -1 = facing away from light, 1 = facing light
  const t = 0.5 + 0.5 * s;
  return t < 0.5 ? mix(tone.dark, tone.base, t * 2) : mix(tone.base, tone.light, (t - 0.5) * 2);
}

function facetShade(c: Pt, pts: readonly Pt[], wobble: number): number {
  let x = 0;
  let y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  x = x / pts.length - c[0];
  y = y / pts.length - c[1];
  const l = Math.hypot(x, y) || 1;
  return Math.max(-1, Math.min(1, (x / l) * LIGHT[0] + (y / l) * LIGHT[1] + wobble));
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function brightTone(t: GemTone, k: number): GemTone {
  return {
    base: mix(t.base, t.light, k), light: mix(t.light, t.highlight, k * 0.8), dark: mix(t.dark, t.base, k),
    highlight: t.highlight, edge: t.edge, glow: t.glow,
  };
}

/** Paint gem `color` centred in a size×size canvas. */
export function paintGem(ctx: Ctx, size: number, color: number, glow: boolean): void {
  const cut = CUTS[color] as Cut;
  const tone0 = GEM[color] as GemTone;
  const tone = glow ? brightTone(tone0, 0.3) : tone0;
  const R = size * (glow ? 0.425 : 0.415) * cut.scale;
  const cx = size / 2;
  const cy = size / 2 - size * 0.015;
  const px = 1 / R; // one pixel in unit space

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(R, R);

  // Halo for highlight state.
  if (glow) {
    ctx.save();
    ctx.shadowColor = rgba(tone.glow, 0.95);
    ctx.shadowBlur = size * 0.1;
    cut.outline(ctx);
    ctx.fillStyle = tone.glow;
    for (let i = 0; i < 3; i++) ctx.fill();
    ctx.lineWidth = size * 0.05 / R;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }

  // Drop shadow + dark rim body.
  ctx.save();
  ctx.shadowColor = 'rgba(25,8,0,0.55)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.045;
  cut.outline(ctx);
  ctx.fillStyle = tone.edge;
  ctx.fill();
  ctx.restore();

  // Facets, clipped to a slightly inset silhouette (rim stays visible).
  ctx.save();
  cut.outline(ctx);
  ctx.clip();
  ctx.fillStyle = tone.base;
  ctx.fillRect(-1.2, -1.2, 2.4, 2.4);

  const ring = cut.ring;
  const n = ring.length;
  const c = cut.c;
  const facetEdge = rgba(tone.highlight, 0.28);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.6, size / 120) * px;

  const drawFacet = (pts: Pt[], shade: number): void => {
    poly(ctx, pts);
    ctx.fillStyle = shadeColor(tone, shade);
    ctx.fill();
    ctx.strokeStyle = facetEdge;
    ctx.stroke();
  };

  let table: Pt[];
  if (cut.style === 'brilliant') {
    // Extend ring a little so facets reach past the clipped silhouette.
    const A = ring.map((p) => lerpPt(c, p, 1.12));
    const B = ring.map((p, i) => {
      const q = ring[(i + 1) % n] as Pt;
      return lerpPt(c, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], cut.table * 1.12);
    });
    for (let i = 0; i < n; i++) {
      const a0 = A[i] as Pt;
      const a1 = A[(i + 1) % n] as Pt;
      const b0 = B[i] as Pt;
      const bPrev = B[(i + n - 1) % n] as Pt;
      // girdle facet (outer edge -> table vertex)
      const g: Pt[] = [a0, a1, b0];
      drawFacet(g, facetShade(c, g, i % 2 ? 0.12 : -0.08));
      // star facet (table edge -> outer vertex)
      const s: Pt[] = [bPrev, b0, a0];
      drawFacet(s, facetShade(c, s, 0.28) * 0.85 + 0.12);
    }
    table = B;
  } else {
    const rings = [1.08, 0.8, 0.6, cut.table].map((k) => ring.map((p) => lerpPt(c, p, k)));
    for (let r = 0; r < rings.length - 1; r++) {
      const o = rings[r] as Pt[];
      const ii = rings[r + 1] as Pt[];
      for (let i = 0; i < n; i++) {
        const q: Pt[] = [o[i] as Pt, o[(i + 1) % n] as Pt, ii[(i + 1) % n] as Pt, ii[i] as Pt];
        drawFacet(q, facetShade(c, q, 0) * (0.95 - r * 0.15) + (r === 1 ? 0.15 : 0));
      }
    }
    table = rings[rings.length - 1] as Pt[];
  }

  // Table: bright gradient top-left -> body.
  poly(ctx, table);
  ctx.fillStyle = lin(ctx, -0.5, -0.6, 0.4, 0.6, [[0, mix(tone.light, tone.highlight, 0.35)], [0.55, tone.light], [1, tone.base]]);
  ctx.fill();
  ctx.strokeStyle = rgba(tone.highlight, 0.5);
  ctx.stroke();
  if (cut.style === 'step') {
    // faint vertical mirror lines inside the table
    ctx.strokeStyle = rgba(tone.highlight, 0.3);
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.42); ctx.lineTo(-0.12, 0.42);
    ctx.moveTo(0.12, -0.42); ctx.lineTo(0.12, 0.42);
    ctx.stroke();
  }

  // Internal bounce light bottom-right (gives the "lit from within" jewel look).
  ctx.fillStyle = rad(ctx, 0.35, 0.55, 0, 0.75, [[0, rgba(tone.light, 0.55)], [1, rgba(tone.light, 0)]]);
  ctx.fillRect(-1.2, -1.2, 2.4, 2.4);

  // Gloss: soft white sweep across the top-left.
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.48, 0.62, 0.34, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, -0.36, -0.52, 0, 0.62, [[0, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fill();
  ctx.restore();

  // Rim: dark outline + thin inner light line.
  cut.outline(ctx);
  ctx.lineWidth = Math.max(1.5, size * 0.04) * px;
  ctx.strokeStyle = tone.edge;
  ctx.stroke();
  ctx.save();
  cut.outline(ctx);
  ctx.clip();
  ctx.translate(0, 0);
  cut.outline(ctx);
  ctx.lineWidth = Math.max(1, size * 0.035) * px * 1.6;
  ctx.strokeStyle = lin(ctx, -1, -1, 1, 1, [[0, rgba(tone.highlight, 0.85)], [0.5, rgba(tone.light, 0.25)], [1, rgba(tone.dark, 0.0)]]);
  ctx.stroke();
  ctx.restore();

  // Sparkle glint.
  ctx.restore();
  sparkle(ctx, cx - R * 0.42, cy - R * 0.5, size * 0.11, 'rgba(255,255,255,0.95)');
  ctx.beginPath();
  ctx.arc(cx - R * 0.42, cy - R * 0.5, size * 0.022, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** Small angular gem fragment for clear particles. */
export function paintShard(ctx: Ctx, size: number, color: number): void {
  const tone = GEM[color] as GemTone;
  const s = size;
  const pts: Pt[] = [[s * 0.5, s * 0.06], [s * 0.92, s * 0.48], [s * 0.6, s * 0.94], [s * 0.12, s * 0.62]];
  poly(ctx, pts);
  ctx.fillStyle = tone.edge;
  ctx.fill();
  const inner: Pt[] = [[s * 0.5, s * 0.16], [s * 0.82, s * 0.48], [s * 0.58, s * 0.84], [s * 0.22, s * 0.6]];
  poly(ctx, inner);
  ctx.fillStyle = tone.base;
  ctx.fill();
  poly(ctx, [inner[0] as Pt, inner[1] as Pt, [s * 0.5, s * 0.52]]);
  ctx.fillStyle = tone.light;
  ctx.fill();
  poly(ctx, [inner[0] as Pt, [s * 0.5, s * 0.52], inner[3] as Pt]);
  ctx.fillStyle = mix(tone.light, tone.highlight, 0.6);
  ctx.fill();
}

/**
 * Geode gem: the normal gem (same cut and colour) made unmistakably special: a gold rim instead of the dark
 * edge, an iridescent sheen, a small crystal cluster in the table and extra sparkles.
 */
export function paintGeode(ctx: Ctx, size: number, color: number): void {
  const cut = CUTS[color] as Cut;
  const tone = GEM[color] as GemTone;
  // warm gold halo behind the gem
  ctx.fillStyle = rad(ctx, size / 2, size / 2, size * 0.2, size * 0.5, [[0, 'rgba(255,230,140,0.7)'], [0.7, 'rgba(255,200,80,0.25)'], [1, 'rgba(255,200,80,0)']]);
  ctx.fillRect(0, 0, size, size);
  paintGem(ctx, size, color, false);
  const R = size * 0.415 * cut.scale;
  const cx = size / 2;
  const cy = size / 2 - size * 0.015;
  const px = 1 / R;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(R, R);
  // iridescent sheen (screen-blended rainbow diagonal), clipped to the silhouette
  ctx.save();
  cut.outline(ctx);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = lin(ctx, -1, -1, 1, 1, [
    [0, 'rgba(255,90,170,0.0)'], [0.22, 'rgba(255,120,200,0.5)'], [0.4, 'rgba(255,230,120,0.5)'],
    [0.58, 'rgba(110,255,190,0.45)'], [0.76, 'rgba(100,190,255,0.5)'], [1, 'rgba(180,120,255,0.0)'],
  ]);
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  ctx.globalCompositeOperation = 'source-over';
  // sparkling inner core: soft white light + a crisp 8-point star burst
  const [ccx, ccy] = cut.c;
  ctx.fillStyle = rad(ctx, ccx, ccy, 0, 0.62, [[0, 'rgba(255,255,255,0.95)'], [0.25, rgba(tone.highlight, 0.75)], [0.6, rgba(tone.light, 0.25)], [1, rgba(tone.light, 0)]]);
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  ctx.save();
  ctx.translate(ccx, ccy);
  ctx.rotate(Math.PI / 4);
  sparkle(ctx, 0, 0, 0.36, 'rgba(255,255,255,0.75)', 0.16);
  ctx.restore();
  sparkle(ctx, ccx, ccy, 0.58, '#ffffff', 0.12);
  ctx.restore();
  // gold rim (replaces the dark edge visually)
  cut.outline(ctx);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.2, size * 0.075) * px;
  ctx.strokeStyle = GOLD.edge;
  ctx.stroke();
  cut.outline(ctx);
  ctx.lineWidth = Math.max(1.4, size * 0.048) * px;
  ctx.strokeStyle = lin(ctx, -1, -1, 1, 1, [[0, GOLD.highlight], [0.35, GOLD.light], [0.7, GOLD.base], [1, GOLD.dark]]);
  ctx.stroke();
  ctx.restore();
  // sparkles
  sparkle(ctx, cx + R * 0.62, cy - R * 0.62, size * 0.13, '#ffffff');
  sparkle(ctx, cx - R * 0.66, cy + R * 0.58, size * 0.08, 'rgba(255,250,220,0.95)');
}
