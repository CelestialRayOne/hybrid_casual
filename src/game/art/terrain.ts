// Board materials: empty slot, board frame, dirt (breakable soil), crust (relic shell), bedrock (basalt).
import { BOARD, DIRT, CRUST, BEDROCK } from './palette';
import { type Ctx, type Pt, rng, mix, rgba, roundRect, lin, rad, poly, crackLines, strokeLines } from './draw';
import { BEDROCK_N, BEDROCK_E, BEDROCK_S, BEDROCK_W } from './keys';

/** Recessed empty cell. */
export function paintSlot(ctx: Ctx, s: number): void {
  const m = s * 0.04;
  roundRect(ctx, m, m, s - 2 * m, s - 2 * m, s * 0.16);
  ctx.fillStyle = lin(ctx, 0, 0, 0, s, [[0, BOARD.slotEdge], [0.35, BOARD.slot], [1, mix(BOARD.slot, BOARD.slotLight, 0.35)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // inner shadow along the top
  ctx.fillStyle = lin(ctx, 0, m, 0, m + s * 0.22, [[0, 'rgba(15,6,0,0.5)'], [1, 'rgba(15,6,0,0)']]);
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
  // light lip at the bottom
  ctx.strokeStyle = rgba(BOARD.slotLight, 0.55);
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(m + s * 0.16, s - m - ctx.lineWidth / 2);
  ctx.lineTo(s - m - s * 0.16, s - m - ctx.lineWidth / 2);
  ctx.stroke();
}

/** Board frame (nine-slice): carved terracotta rim around a translucent dark well. size = 3u, inset = u. */
export function paintBoardFrame(ctx: Ctx, size: number, u: number): void {
  const lw = u * 0.22;
  const r = u * 0.55;
  // outer rim
  roundRect(ctx, lw * 0.5, lw * 0.5, size - lw, size - lw, r);
  ctx.fillStyle = rgba(BOARD.well, BOARD.wellAlpha);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = lin(ctx, 0, 0, 0, size, [[0, BOARD.frameLight], [0.12, BOARD.frame], [0.88, BOARD.frame], [1, BOARD.frameDark]]);
  ctx.stroke();
  // dark outer edge + light inner bevel
  roundRect(ctx, 1, 1, size - 2, size - 2, r + lw * 0.5);
  ctx.lineWidth = Math.max(1.5, u * 0.04);
  ctx.strokeStyle = BOARD.frameDark;
  ctx.stroke();
  roundRect(ctx, lw, lw, size - 2 * lw, size - 2 * lw, r - lw * 0.5);
  ctx.lineWidth = Math.max(1, u * 0.03);
  ctx.strokeStyle = rgba(BOARD.frameDark, 0.9);
  ctx.stroke();
  // inner top shadow of the well
  ctx.save();
  roundRect(ctx, lw, lw, size - 2 * lw, size - 2 * lw, r - lw * 0.5);
  ctx.clip();
  ctx.fillStyle = lin(ctx, 0, lw, 0, lw + u * 0.35, [[0, 'rgba(10,4,0,0.45)'], [1, 'rgba(10,4,0,0)']]);
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function speckle(ctx: Ctx, r: () => number, s: number, n: number, colors: readonly string[], maxR: number): void {
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(r() * s, r() * s, Math.max(0.5, r() * maxR), 0, Math.PI * 2);
    ctx.fillStyle = colors[i % colors.length] as string;
    ctx.fill();
  }
}

function pebble(ctx: Ctx, x: number, y: number, w: number, h: number, a: number, light: string, dark: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.ellipse(0, h * 0.25, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(dark, 0.7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, -w, -h, w, h, [[0, mix(light, '#fff4e0', 0.2)], [1, mix(light, dark, 0.55)]]);
  ctx.fill();
  ctx.restore();
}

/** Packed soil with pebbles. hp 3 intact, 2 cracked, 1 crumbling. */
export function paintDirt(ctx: Ctx, s: number, hp: number): void {
  const r = rng(1000 + hp * 17);
  const m = s * 0.035;
  const rad0 = s * 0.14;
  const body = DIRT.body[hp] as string;
  const light = DIRT.light[hp] as string;
  const dark = DIRT.dark[hp] as string;

  // body with soft drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(20,8,0,0.45)';
  ctx.shadowBlur = s * 0.04;
  ctx.shadowOffsetY = s * 0.03;
  roundRect(ctx, m, m, s - 2 * m, s - 2 * m, rad0);
  ctx.fillStyle = DIRT.edge;
  ctx.fill();
  ctx.restore();

  const inset = m + Math.max(1.2, s * 0.03);
  roundRect(ctx, inset, inset, s - 2 * inset, s - 2 * inset, rad0 * 0.85);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = lin(ctx, 0, 0, 0, s, [[0, light], [0.3, body], [1, dark]]);
  ctx.fillRect(0, 0, s, s);
  // soil grain
  speckle(ctx, r, s, Math.round(s * 0.9), [rgba(DIRT.dark[hp] as string, 0.55), rgba(DIRT.pebble, 0.35), rgba('#2a1608', 0.3)], s * 0.018);
  // a few clumps (darker blotches)
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(r() * s, r() * s, s * (0.08 + r() * 0.1), s * (0.05 + r() * 0.06), r() * 3, 0, Math.PI * 2);
    ctx.fillStyle = rgba(dark, 0.35);
    ctx.fill();
  }
  // pebbles
  const pebbles = 2 + (hp === 3 ? 1 : 0);
  for (let i = 0; i < pebbles; i++) {
    pebble(ctx, s * (0.22 + r() * 0.56), s * (0.24 + r() * 0.54), s * (0.06 + r() * 0.04), s * (0.045 + r() * 0.025), r() * 3,
      i % 2 ? DIRT.pebble : mix(DIRT.pebble, '#c9a27a', 0.5), DIRT.pebbleDark);
  }
  // top bevel highlight
  ctx.fillStyle = lin(ctx, 0, inset, 0, inset + s * 0.16, [[0, rgba('#ffe2b8', 0.45)], [1, rgba('#ffe2b8', 0)]]);
  ctx.fillRect(0, 0, s, s);
  // bottom inner shade
  ctx.fillStyle = lin(ctx, 0, s - inset - s * 0.18, 0, s - inset, [[0, 'rgba(30,12,0,0)'], [1, 'rgba(30,12,0,0.4)']]);
  ctx.fillRect(0, 0, s, s);

  // cracks
  if (hp < 3) {
    const lines: Pt[][] = [];
    const cr = rng(77 + hp);
    const count = hp === 2 ? 2 : 4;
    const starts: [number, number, number][] = [
      [0.5, 0.06, Math.PI / 2], [0.06, 0.55, 0], [0.94, 0.35, Math.PI], [0.4, 0.94, -Math.PI / 2],
    ];
    for (let i = 0; i < count; i++) {
      const st = starts[i] as [number, number, number];
      crackLines(cr, st[0] * s, st[1] * s, st[2] + (cr() - 0.5) * 0.6, s * (hp === 2 ? 0.48 : 0.6), 5, hp === 1 ? 2 : 1, lines);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(DIRT.crackLight, 0.55);
    ctx.lineWidth = Math.max(1, s * 0.03);
    strokeLines(ctx, lines, s * 0.012, s * 0.016);
    ctx.strokeStyle = DIRT.crack;
    ctx.lineWidth = Math.max(1.2, s * (hp === 1 ? 0.04 : 0.032));
    strokeLines(ctx, lines);
  }
  ctx.restore();

  // chipped corners at hp 1
  if (hp === 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    poly(ctx, [[s - m - s * 0.2, m - 1], [s - m + 1, m - 1], [s - m + 1, m + s * 0.16], [s - m - s * 0.07, m + s * 0.09]]);
    ctx.fill();
    poly(ctx, [[m - 1, s - m - s * 0.15], [m + s * 0.12, s - m - s * 0.05], [m + s * 0.18, s - m + 1], [m - 1, s - m + 1]]);
    ctx.fill();
    ctx.restore();
  }
}

/** Crust overlay (drawn over the relic): a clay/sandstone shell split into chunky plates.
 *  hp 2: thin seams with a faint golden glow, the relic glows through the centre a little.
 *  hp 1: wide glowing seams, broken holes show the relic. */
export function paintCrust(ctx: Ctx, s: number, hp: number, cells: 1 | 2): void {
  const r = rng(500 + hp * 31 + cells * 7);
  const unit = s / cells;
  const m = unit * 0.035;
  roundRect(ctx, m, m, s - 2 * m, s - 2 * m, unit * 0.22);
  ctx.save();
  ctx.shadowColor = 'rgba(20,8,0,0.45)';
  ctx.shadowBlur = unit * 0.05;
  ctx.shadowOffsetY = unit * 0.03;
  ctx.fillStyle = CRUST.edge;
  ctx.fill();
  ctx.restore();

  const inset = m + Math.max(1.2, unit * 0.03);
  const shell = (): void => roundRect(ctx, inset, inset, s - 2 * inset, s - 2 * inset, unit * 0.19);
  shell();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = rad(ctx, s * 0.35, s * 0.3, s * 0.05, s * 0.85, [[0, CRUST.light], [0.5, CRUST.body], [1, CRUST.dark]]);
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, r, s, Math.round(s * 0.5), [rgba(CRUST.dark, 0.45), rgba('#fff2d0', 0.35)], unit * 0.014);
  // strata stripes across the shell (sandstone)
  ctx.lineWidth = Math.max(1, unit * 0.025);
  for (let i = 1; i < 4 * cells; i++) {
    const y = (s * i) / (4 * cells) + (r() - 0.5) * unit * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s * 0.3, y - unit * 0.06, s * 0.7, y + unit * 0.06, s, y);
    ctx.strokeStyle = rgba(CRUST.dark, 0.22);
    ctx.stroke();
  }

  // plate seams: radial spokes from an off-centre point plus a ring
  const cx = s * (0.48 + (r() - 0.5) * 0.08);
  const cy = s * (0.5 + (r() - 0.5) * 0.08);
  const spokes = cells === 1 ? 5 : 7;
  const ringR = s * 0.24;
  const ring: Pt[] = [];
  const lines: Pt[][] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + r() * 0.5;
    const rr = ringR * (0.8 + r() * 0.4);
    const p0: Pt = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    ring.push(p0);
    const spoke: Pt[] = [p0];
    for (let k = 1; k <= 3; k++) {
      const d = rr + (s * 0.6 - rr) * (k / 3);
      const aa = a + (r() - 0.5) * 0.35;
      spoke.push([cx + Math.cos(aa) * d, cy + Math.sin(aa) * d]);
    }
    lines.push(spoke);
  }
  lines.push([...ring, ring[0] as Pt]);
  if (hp === 1) {
    // extra fractures
    for (let i = 0; i < 3 * cells; i++) {
      const p = ring[Math.floor(r() * ring.length)] as Pt;
      crackLines(r, p[0], p[1], Math.atan2(p[1] - cy, p[0] - cx) + (r() - 0.5) * 1.6, s * 0.22, 3, 0, lines);
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // carved seam: light lip below, dark groove
  ctx.strokeStyle = rgba(CRUST.light, 0.7);
  ctx.lineWidth = Math.max(1, unit * 0.04);
  strokeLines(ctx, lines, 0, unit * 0.025);
  ctx.strokeStyle = CRUST.crack;
  ctx.lineWidth = Math.max(1.5, unit * (hp === 1 ? 0.075 : 0.05));
  strokeLines(ctx, lines);
  // golden light leaking through the seams
  ctx.save();
  ctx.shadowColor = CRUST.leakGlow;
  ctx.shadowBlur = unit * (hp === 1 ? 0.14 : 0.06);
  ctx.strokeStyle = CRUST.leak;
  ctx.lineWidth = Math.max(0.8, unit * (hp === 1 ? 0.03 : 0.014));
  strokeLines(ctx, hp === 1 ? lines : lines.slice(-1));
  ctx.restore();
  // plate bevel highlight top edge
  ctx.fillStyle = lin(ctx, 0, inset, 0, inset + unit * 0.16, [[0, 'rgba(255,240,210,0.6)'], [1, 'rgba(255,240,210,0)']]);
  ctx.fillRect(0, 0, s, s);
  ctx.restore();

  // let the relic glow through the centre a little
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = rad(ctx, cx, cy, 0, ringR * 1.05, [[0, `rgba(0,0,0,${hp === 2 ? 0.4 : 0.6})`], [1, 'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, s, s);
  ctx.restore();

  if (hp === 1) {
    // broken-out chunks of the inner ring
    const holes: [number, number, number][] = [[cx / s, cy / s, 0.15], [cx / s + 0.14, cy / s - 0.12, 0.07]];
    for (const [hx, hy, hr] of holes) {
      const pts: Pt[] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rr = hr * s * (0.75 + r() * 0.4);
        pts.push([hx * s + Math.cos(a) * rr, hy * s + Math.sin(a) * rr]);
      }
      ctx.save();
      poly(ctx, pts);
      ctx.shadowColor = CRUST.leakGlow;
      ctx.shadowBlur = unit * 0.1;
      ctx.lineWidth = Math.max(1.5, unit * 0.05);
      ctx.strokeStyle = CRUST.leak;
      ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      poly(ctx, pts);
      ctx.fill();
      ctx.restore();
      poly(ctx, pts);
      ctx.lineWidth = Math.max(1, unit * 0.025);
      ctx.strokeStyle = rgba(CRUST.edge, 0.9);
      ctx.stroke();
    }
  }
}

/** Bedrock basalt tile. mask bits (N=1,E=2,S=4,W=8) mark sides joined to the same piece. */
export function paintBedrock(ctx: Ctx, s: number, mask: number): void {
  const r = rng(9000 + mask);
  const open = (bit: number): boolean => (mask & bit) === 0;
  const m = s * 0.035;
  const out = s * 0.2; // joined sides extend past the canvas so no seam is drawn
  const x0 = open(BEDROCK_W) ? m : -out;
  const y0 = open(BEDROCK_N) ? m : -out;
  const x1 = open(BEDROCK_E) ? s - m : s + out;
  const y1 = open(BEDROCK_S) ? s - m : s + out;
  const rc = s * 0.16;
  const cr = (a: number, b: number): number => (open(a) && open(b) ? rc : 0);
  const path = (dx0: number, dy0: number, dx1: number, dy1: number): void => {
    const ax = x0 + dx0, ay = y0 + dy0, bx = x1 - dx1, by = y1 - dy1;
    const nw = cr(BEDROCK_N, BEDROCK_W), ne = cr(BEDROCK_N, BEDROCK_E), se = cr(BEDROCK_S, BEDROCK_E), sw = cr(BEDROCK_S, BEDROCK_W);
    ctx.beginPath();
    ctx.moveTo(ax + nw, ay);
    ctx.arcTo(bx, ay, bx, by, ne);
    ctx.arcTo(bx, by, ax, by, se);
    ctx.arcTo(ax, by, ax, ay, sw);
    ctx.arcTo(ax, ay, bx, ay, nw);
    ctx.closePath();
  };

  // drop shadow under open bottom edges
  ctx.save();
  ctx.shadowColor = 'rgba(5,5,10,0.55)';
  ctx.shadowBlur = s * 0.05;
  ctx.shadowOffsetY = s * 0.035;
  path(0, 0, 0, 0);
  ctx.fillStyle = BEDROCK.edge;
  ctx.fill();
  ctx.restore();

  const e = Math.max(1.5, s * 0.035);
  path(open(BEDROCK_W) ? e : 0, open(BEDROCK_N) ? e : 0, open(BEDROCK_E) ? e : 0, open(BEDROCK_S) ? e : 0);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = BEDROCK.body;
  ctx.fillRect(0, 0, s, s);
  // crystalline flecks
  for (let i = 0; i < Math.round(s * 0.35); i++) {
    const fx = r() * s;
    const fy = r() * s;
    const fr = s * (0.01 + r() * 0.02);
    poly(ctx, [[fx, fy - fr], [fx + fr * 0.7, fy], [fx, fy + fr], [fx - fr * 0.7, fy]]);
    ctx.fillStyle = r() < 0.3 ? rgba(BEDROCK.sheen, 0.55) : rgba(BEDROCK.fleck, 0.6);
    ctx.fill();
  }
  // faint angular facets (basalt planes)
  for (let i = 0; i < 2; i++) {
    const ax = s * (0.15 + r() * 0.5);
    const ay = s * (0.15 + r() * 0.5);
    const w = s * (0.25 + r() * 0.2);
    poly(ctx, [[ax, ay], [ax + w, ay + w * 0.15], [ax + w * 0.8, ay + w * 0.7], [ax + w * 0.1, ay + w * 0.55]]);
    ctx.fillStyle = rgba(i ? BEDROCK.light : BEDROCK.dark, 0.14);
    ctx.fill();
  }
  // quartz vein
  ctx.strokeStyle = rgba(BEDROCK.vein, 0.35);
  ctx.lineWidth = Math.max(0.8, s * 0.012);
  const vl = crackLines(r, s * (0.2 + r() * 0.3), s * (0.2 + r() * 0.3), r() * Math.PI, s * 0.45, 4, 0);
  strokeLines(ctx, vl);

  // bevels on open sides
  const b = s * 0.13;
  if (open(BEDROCK_N)) {
    ctx.fillStyle = lin(ctx, 0, y0, 0, y0 + b, [[0, rgba(BEDROCK.sheen, 0.75)], [0.35, rgba(BEDROCK.light, 0.35)], [1, rgba(BEDROCK.light, 0)]]);
    ctx.fillRect(0, 0, s, s);
  }
  if (open(BEDROCK_W)) {
    ctx.fillStyle = lin(ctx, x0, 0, x0 + b, 0, [[0, rgba(BEDROCK.light, 0.55)], [1, rgba(BEDROCK.light, 0)]]);
    ctx.fillRect(0, 0, s, s);
  }
  if (open(BEDROCK_S)) {
    ctx.fillStyle = lin(ctx, 0, y1 - b, 0, y1, [[0, rgba(BEDROCK.dark, 0)], [1, rgba(BEDROCK.dark, 0.85)]]);
    ctx.fillRect(0, 0, s, s);
  }
  if (open(BEDROCK_E)) {
    ctx.fillStyle = lin(ctx, x1 - b, 0, x1, 0, [[0, rgba(BEDROCK.dark, 0)], [1, rgba(BEDROCK.dark, 0.7)]]);
    ctx.fillRect(0, 0, s, s);
  }
  ctx.restore();

  // glassy corner glare on an exposed top-left corner
  if (open(BEDROCK_N) && open(BEDROCK_W)) {
    ctx.save();
    path(e, e, open(BEDROCK_E) ? e : 0, open(BEDROCK_S) ? e : 0);
    ctx.clip();
    ctx.fillStyle = rad(ctx, x0 + s * 0.18, y0 + s * 0.16, 0, s * 0.4, [[0, rgba(BEDROCK.sheen, 0.4)], [1, rgba(BEDROCK.sheen, 0)]]);
    ctx.fillRect(0, 0, s, s);
    ctx.restore();
  }
  // crisp bright edge line on the lit open sides
  ctx.strokeStyle = rgba(BEDROCK.sheen, 0.6);
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.beginPath();
  if (open(BEDROCK_N)) { ctx.moveTo(x0 + cr(BEDROCK_N, BEDROCK_W) + e, y0 + e * 1.3); ctx.lineTo(x1 - cr(BEDROCK_N, BEDROCK_E) - e, y0 + e * 1.3); }
  if (open(BEDROCK_W)) { ctx.moveTo(x0 + e * 1.3, y0 + cr(BEDROCK_N, BEDROCK_W) + e); ctx.lineTo(x0 + e * 1.3, y1 - cr(BEDROCK_S, BEDROCK_W) - e); }
  ctx.stroke();
}
