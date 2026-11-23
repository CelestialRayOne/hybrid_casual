// Dev-only art preview: http://localhost:5173/dev/art-preview.html
// Query params: view=board|sheet|perks, cell=fit|32|<px>, depth=<rows> (background strata shift), bench=1,
// from=<cell> (generate at that size first, then regenerate in place).
//   board: v2 play mock (HUD with goal slots, boons + stack bubbles, boss badge; board with geodes, odd bedrock
//          slabs, armed reticle and a lightning bolt; power tray with level pips, an armed ring and an empty slot)
//   perks: perks-screen mock (4 paths x 2 nodes, owned/available/locked, counters) + boss banner + level tiles
//   sheet: every atlas frame with its name
import Phaser from 'phaser';
import { registerTextures, drawStrataBackground, artMetrics, genStats } from '../src/game/art/textures';
import { drawLightningBolt } from '../src/game/art/fx';
import * as K from '../src/game/art/keys';
import { UI, GEM, PATH, hexToInt } from '../src/game/art/palette';

const A = K.ART_ATLAS;
type PathId = K.PathId;

const params = new URLSearchParams(location.search);
const viewParam = params.get('view');
const view = viewParam === 'sheet' || viewParam === 'perks' ? viewParam : 'board';
const cellParam = params.get('cell') ?? 'fit';
const depth = Number(params.get('depth') ?? '0');

// Sample board 8x10. 0-4 gems, 5-9 geodes (colour 0-4), a/b/c dirt hp1/2/3, R = 2x2 relic (crust 2),
// r = 1x1 relic (crust 1), . = empty. Bedrock slabs (any letter in SLABS, same letter = same slab):
// Q = 2x2, L = 3-cell L, B = 2-cell bar (L and B touch on purpose: two slabs must not merge).
const MAP = [
  '00112334',
  '01122344',
  '21332904',
  '22344011',
  'c204RR1.',
  'cb00RR3.',
  'QQ3LBBc2',
  'QQ1LLa20',
  'r6b44c10',
  'cc34c112',
];
const SLABS = 'QLB';
const GLOW_CELLS = new Set(['0,0', '1,0', '0,1']);
const RETICLE: [number, number] = [6, 3];
const BOLT: [number, number][] = [[6, 0], [7, 1], [4, 3]];

function fitCell(w: number, h: number): number {
  if (cellParam === 'fit') return Math.max(32, Math.floor(Math.min((w - 24) / 8.4, (h - 16) / 16.6)));
  return Math.max(16, Number(cellParam) || 32);
}

function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string = UI.textLight): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, {
    fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif', fontSize: `${Math.round(size)}px`, fontStyle: 'bold',
    color, stroke: UI.textShadow, strokeThickness: Math.max(2, Math.round(size / 6)),
  });
}

class Preview extends Phaser.Scene {
  private genMs = 0;
  private bgMs = 0;

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const c = fitCell(W, H);
    // ?from=<cell>: generate at another size first, so the view shows an in-place regeneration
    // (exercises frames moving between atlas pages when the page count changes).
    const from = Number(params.get('from') ?? '0');
    if (from) registerTextures(this, from);
    this.genMs = registerTextures(this, c);
    const stats = { ...genStats };
    // ?bench=1: regenerate several times (alternating sizes) to measure warm generation cost
    const bench: number[] = [];
    const benchStats: string[] = [];
    if (params.get('bench')) {
      for (let i = 0; i < 6; i++) {
        bench.push(Math.round(registerTextures(this, c + (i % 2 ? 0 : 1))));
        benchStats.push(`p${genStats.paintMs.toFixed(0)}/u${genStats.uploadMs.toFixed(0)}`);
      }
      registerTextures(this, c);
    }
    if (view === 'board') this.board(W, H, c);
    else if (view === 'perks') this.perks(W, H, c);
    else this.sheet(W, c);
    const bar = document.getElementById('bar');
    if (bar) {
      const link = (label: string, q: Record<string, string>, on: boolean): string => {
        const p = new URLSearchParams(location.search);
        for (const [k, v] of Object.entries(q)) p.set(k, v);
        return `<a class="${on ? 'on' : ''}" href="?${p.toString()}">${label}</a>`;
      };
      bar.innerHTML = [
        link('board', { view: 'board' }, view === 'board'),
        link('perks', { view: 'perks' }, view === 'perks'),
        link('sheet', { view: 'sheet' }, view === 'sheet'),
        link('32px', { cell: '32' }, cellParam === '32'),
        link('fit', { cell: 'fit' }, cellParam === 'fit'),
        link('120px', { cell: '120' }, cellParam === '120'),
        `<span>cell ${c}px · gen ${this.genMs.toFixed(1)} ms · ${stats.atlas}</span>`,
      ].join('');
    }
    (window as unknown as { __art: unknown }).__art = { genMs: this.genMs, bgMs: this.bgMs, cell: c, stats, bench, benchStats };
  }

  private board(W: number, H: number, c: number): void {
    document.body.classList.add('board');
    const m = artMetrics(c);
    this.bgMs = drawStrataBackground(this, W, H, depth, c);
    this.add.image(0, 0, K.BACKGROUND).setOrigin(0);

    const bw = c * 8;
    const bh = c * 10;
    const hudH = c * 1.25;
    const boonH = c * 0.95;
    const trayH = c * 2.3;
    const total = hudH + boonH + bh + trayH + c * 0.6;
    const ox = Math.round((W - bw) / 2);
    const top = Math.max(8, Math.round((H - total) / 2));

    // HUD: moves, depth, goal slots (2 required + 1 bonus), settings
    const hud = this.add.nineslice(W / 2, top + hudH / 2, A, K.PANEL_DARK, bw + c * 0.4, hudH, m.panelInset, m.panelInset, m.panelInset, m.panelInset);
    hud.setOrigin(0.5);
    const iy = top + hudH / 2 - c * 0.04;
    this.add.image(ox + c * 0.45, iy, A, K.ICON_MOVES).setDisplaySize(c * 0.75, c * 0.75);
    text(this, ox + c * 0.9, iy, '23', c * 0.5).setOrigin(0, 0.5);
    this.add.image(ox + c * 2.1, iy, A, K.ICON_DEPTH).setDisplaySize(c * 0.7, c * 0.7);
    text(this, ox + c * 2.55, iy, '12', c * 0.5).setOrigin(0, 0.5);
    const slots = [K.RELIC_SLOT_EMPTY, K.RELIC_SLOT_EMPTY, K.RELIC_SLOT_BONUS];
    slots.forEach((k, i) => {
      const x = ox + c * (4.0 + i * 0.88);
      this.add.image(x, iy, A, k).setDisplaySize(c * 0.84, c * 0.84);
      if (i === 0) this.add.image(x, iy, A, K.relicKey(2)).setDisplaySize(c * 0.78, c * 0.78);
    });
    this.add.image(ox + bw - c * 0.4, iy, A, K.ICON_SETTINGS).setDisplaySize(c * 0.72, c * 0.72);

    // Boon row: boss badge on the left, boons with stack bubbles
    const by0 = top + hudH + boonH / 2;
    this.add.image(ox + c * 0.42, by0, A, K.BADGE_BOSS).setDisplaySize(c * 0.86, c * 0.86);
    const boons: [number, number][] = [[0, 2], [1, 1], [3, 3], [5, 1], [4, 1], [2, 2]];
    const bs = Math.round(c * 0.72); // ~32 px at c=44: the readability target
    boons.forEach(([v, n], i) => {
      const x = ox + c * 1.5 + i * c * 0.98;
      this.add.image(x, by0, A, K.boonKey(v)).setDisplaySize(bs, bs);
      if (n > 1) {
        const bx = x + bs * 0.38;
        const byy = by0 - bs * 0.34;
        this.add.image(bx, byy, A, K.BOON_STACK_BUBBLE).setDisplaySize(c * 0.4, c * 0.4);
        text(this, bx, byy, `${n}`, c * 0.26).setOrigin(0.5, 0.52);
      }
    });

    // Board frame + cells
    const by = top + hudH + boonH + c * 0.2;
    const pad = c * 0.22;
    this.add.nineslice(ox - pad, by - pad, A, K.BOARD_FRAME, bw + pad * 2, bh + pad * 2, m.boardFrameInset, m.boardFrameInset, m.boardFrameInset, m.boardFrameInset).setOrigin(0);
    const at = (x: number, y: number): [number, number] => [ox + x * c + c / 2, by + y * c + c / 2];
    const slabOf = (x: number, y: number): string => {
      const ch = MAP[y]?.[x] ?? '.';
      return SLABS.includes(ch) ? ch : '';
    };
    MAP.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const [px, py] = at(x, y);
        this.add.image(px, py, A, K.CELL_SLOT);
        if (ch >= '0' && ch <= '4') {
          const g = Number(ch);
          this.add.image(px, py, A, GLOW_CELLS.has(`${x},${y}`) ? K.gemGlowKey(g) : K.gemKey(g));
        } else if (ch >= '5' && ch <= '9') {
          this.add.image(px, py, A, K.geodeKey(Number(ch) - 5));
          this.add.image(px + c * 0.3, py - c * 0.32, A, K.GEODE_GLINT).setScale(0.7);
        } else if (ch === 'a' || ch === 'b' || ch === 'c') {
          this.add.image(px, py, A, K.dirtKey(ch.charCodeAt(0) - 96));
        } else if (ch === 'r') {
          this.add.image(px, py, A, K.relicKey(4));
          this.add.image(px, py, A, K.crustKey(1));
        } else if (SLABS.includes(ch)) {
          const same = (dx: number, dy: number): boolean => slabOf(x + dx, y + dy) === ch;
          const mask = (same(0, -1) ? K.BEDROCK_N : 0) | (same(1, 0) ? K.BEDROCK_E : 0) | (same(0, 1) ? K.BEDROCK_S : 0) | (same(-1, 0) ? K.BEDROCK_W : 0);
          this.add.image(px, py, A, K.bedrockTile(mask));
        }
      });
    });
    // 2x2 relic at (4,4)
    const [rx, ry] = at(4, 4);
    this.add.image(rx + c / 2, ry + c / 2, A, K.relicKey(1, true));
    this.add.image(rx + c / 2, ry + c / 2, A, K.crustKey(2, true));

    // Armed power: reticle on the board (tinted with the armed power's glow colour)
    const armed = 3;
    const [tx, ty0] = at(...RETICLE);
    this.add.image(tx, ty0, A, K.POWER_RETICLE).setTint(hexToInt((GEM[armed] as { glow: string }).glow));
    // Chain lightning in flight: procedural bolt + segment sprite + sparks
    const g = this.add.graphics();
    for (let i = 0; i < BOLT.length - 1; i++) {
      const [a0, a1] = BOLT[i] as [number, number];
      const [b0, b1] = BOLT[i + 1] as [number, number];
      const [x1, y1] = at(a0, a1);
      const [x2, y2] = at(b0, b1);
      drawLightningBolt(g, x1, y1, x2, y2, 11 + i * 7, { width: Math.max(1.5, c * 0.05) });
      this.add.image(x2, y2, A, K.SPARK).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD);
    }
    // a few particles near the glowing group
    const [sx, sy] = at(1, 1);
    this.add.image(sx + c * 0.3, sy - c * 0.2, A, K.GLINT);
    this.add.image(sx + c * 0.6, sy + c * 0.1, A, K.shardKey(0)).setRotation(0.6);

    // Power tray: 3 powers (Lv1, Lv3, Lv5; the topaz one armed) + 1 empty slot (Tool Belt)
    const ty = by + bh + c * 0.35;
    this.add.nineslice(W / 2, ty + trayH / 2, A, K.PANEL, bw + c * 0.4, trayH, m.panelInset, m.panelInset, m.panelInset, m.panelInset).setOrigin(0.5);
    const tray: [number, number][] = [[0, 1], [3, 3], [4, 5]];
    const cy = ty + trayH / 2 - c * 0.18;
    const slotX = (i: number): number => ox + bw * (0.125 + i * 0.25);
    tray.forEach(([col, lvl], i) => {
      const x = slotX(i);
      this.add.image(x, cy, A, K.TRAY_SLOT);
      if (col === armed) {
        const ring = this.add.image(x, cy, A, K.POWER_ARMED_RING).setTint(hexToInt((GEM[col] as { glow: string }).glow));
        this.tweens.add({ targets: ring, alpha: 0.55, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      this.add.image(x, cy, A, K.powerKey(col));
      K.pipOffsets(m.power, m.pip).forEach(([dx, dy], p) => {
        this.add.image(x + dx, cy + dy, A, p < lvl ? K.POWER_PIP_ON : K.POWER_PIP_OFF);
      });
    });
    this.add.image(slotX(3), cy, A, K.TRAY_SLOT);
  }

  private perks(W: number, H: number, c: number): void {
    document.body.classList.add('board');
    const m = artMetrics(c);
    this.bgMs = drawStrataBackground(this, W, H, depth, c);
    this.add.image(0, 0, K.BACKGROUND).setOrigin(0);
    const colW = Math.min(W - 24, c * 9) / 4;
    const pw = colW * 4 + c * 0.4;
    const ox = (W - colW * 4) / 2;
    let y = Math.max(10, c * 0.3);
    text(this, W / 2, y, 'Perks', c * 0.7).setOrigin(0.5, 0);
    y += c * 1.0;
    // counters
    const cs = c * 0.8;
    this.add.image(W / 2 - c * 2.2, y + cs / 2, A, K.PERK_POINT).setDisplaySize(cs, cs);
    text(this, W / 2 - c * 1.7, y + cs / 2, '2', c * 0.5).setOrigin(0, 0.5);
    this.add.image(W / 2 + c * 0.6, y + cs / 2, A, K.REFORGE_TOKEN).setDisplaySize(cs, cs);
    text(this, W / 2 + c * 1.1, y + cs / 2, '1', c * 0.5).setOrigin(0, 0.5);
    y += cs + c * 0.3;
    // panel with 4 path columns x 2 nodes
    const node = Math.min(m.perkNode, colW * 0.92);
    const panelH = c * 1.4 + node * 2 + c * 1.2;
    this.add.nineslice(W / 2, y + panelH / 2, A, K.PANEL_DARK, pw, panelH, m.panelInset, m.panelInset, m.panelInset, m.panelInset).setOrigin(0.5);
    const cols: [PathId, string, [K.PerkIconId, string][]][] = [
      ['jeweler', 'Jeweler', [['jeweler_brilliant', 'owned'], ['jeweler_flawless', 'available']]],
      ['archaeologist', 'Archaeol.', [['arch_softcrust', 'owned'], ['arch_treasure', 'owned']]],
      ['alchemist', 'Alchemist', [['alch_transmute', 'available'], ['alch_volatile', 'locked']]],
      ['blacksmith', 'Smith', [['smith_toolbelt', 'locked'], ['smith_tempered', 'available']]],
    ];
    cols.forEach(([path, label, nodes], i) => {
      const x = ox + colW * (i + 0.5);
      const hy = y + c * 0.62;
      this.add.image(x, hy, A, K.perkKey(path)).setDisplaySize(c * 0.95, c * 0.95);
      text(this, x, hy + c * 0.52, label, Math.max(10, c * 0.26), PATH[path].primary).setOrigin(0.5, 0);
      nodes.forEach(([id, state], k) => {
        const ny = y + c * 1.55 + node * (k + 0.5) + k * c * 0.15;
        const frame = state === 'owned' ? K.PERK_NODE_OWNED : state === 'available' ? K.PERK_NODE_AVAILABLE : K.PERK_NODE_LOCKED;
        const nf = this.add.image(x, ny, A, frame).setDisplaySize(node, node);
        if (state === 'available') this.tweens.add({ targets: nf, scale: nf.scale * 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const icon = this.add.image(x, ny, A, K.perkIconKey(id)).setDisplaySize(node * 0.7, node * 0.7);
        if (state === 'locked') icon.setTint(0x8a8a8a).setAlpha(0.55);
      });
    });
    y += panelH + c * 0.45;
    // boss banner + badge
    const bh = m.bossBannerH;
    const bwid = Math.min(W - 20, c * 7.5);
    this.add.nineslice(W / 2, y + bh / 2 + c * 0.3, A, K.BOSS_BANNER, bwid, bh, m.bossBannerInset, m.bossBannerInset, 0, 0).setOrigin(0.5);
    this.add.image(W / 2, y + c * 0.2, A, K.BADGE_BOSS).setDisplaySize(c * 1.1, c * 1.1);
    text(this, W / 2, y + bh * 0.58 + c * 0.32, 'BOSS LEVEL', c * 0.5, '#fff3c4').setOrigin(0.5);
    y += bh + c * 0.75;
    // level-select tiles: normal, hard, boss
    const tile = c * 1.36;
    const tiles: [string, string | null, string][] = [['8', null, K.PANEL], ['9', null, K.PANEL], ['10', K.BADGE_HARD, K.PANEL], ['11', null, K.PANEL], ['12', K.BADGE_BOSS, K.LEVEL_TILE_BOSS]];
    tiles.forEach(([n, badge, frame], i) => {
      const x = W / 2 + (i - 2) * (tile + c * 0.2);
      const ty = y + tile / 2;
      this.add.nineslice(x, ty, A, frame, tile, tile, m.panelInset, m.panelInset, m.panelInset, m.panelInset).setOrigin(0.5);
      text(this, x, ty - c * 0.04, n, c * 0.48, frame === K.PANEL ? UI.text : '#fff3c4').setOrigin(0.5).setStroke(frame === K.PANEL ? '#00000000' : UI.textShadow, frame === K.PANEL ? 0 : 4);
      if (badge) this.add.image(x + tile * 0.36, ty - tile * 0.36, A, badge).setDisplaySize(c * 0.6, c * 0.6);
    });
  }

  private sheet(W: number, c: number): void {
    const m = artMetrics(c);
    const items: [string, string][] = [];
    const add = (k: string): void => { items.push([k, k]); };
    for (let g = 0; g < 5; g++) add(K.gemKey(g));
    for (let g = 0; g < 5; g++) add(K.geodeKey(g));
    for (let g = 0; g < 5; g++) add(K.gemGlowKey(g));
    for (let g = 0; g < 5; g++) add(K.powerKey(g));
    for (const k of [K.POWER_PIP_ON, K.POWER_PIP_OFF, K.TRAY_SLOT, K.POWER_ARMED_RING, K.POWER_RETICLE]) add(k);
    for (let v = 0; v < 6; v++) add(K.boonKey(v));
    for (const k of [K.BOON_STACK_BUBBLE, K.RELIC_SLOT_EMPTY, K.RELIC_SLOT_BONUS]) add(k);
    for (const id of K.PERK_IDS) add(K.perkIconKey(id));
    for (const k of [K.PERK_NODE_OWNED, K.PERK_NODE_AVAILABLE, K.PERK_NODE_LOCKED, K.PERK_POINT, K.REFORGE_TOKEN, K.BADGE_BOSS, K.BADGE_HARD, K.LEVEL_TILE_BOSS, K.BOSS_BANNER]) add(k);
    for (const k of [...K.FX_FLAME_FRAMES, K.FX_EMBER, K.FX_WATER_DROP, K.FX_WAVE_STREAK, ...K.FX_ROCK_FRAMES, K.FX_SHOCK_RING, K.FX_BOLT_SEGMENT, K.FX_DRILL_BIT, K.FX_SPARK_BLUE, K.FX_SPARK_GREEN, K.GEODE_GLINT]) add(k);
    for (const hp of [3, 2, 1]) add(K.dirtKey(hp));
    add(K.CELL_SLOT);
    for (let v = 0; v < 6; v++) add(K.relicKey(v));
    for (const hp of [2, 1]) items.push([`relic+crust_${hp}`, `crust_${hp}`]);
    for (let mask = 0; mask < 16; mask++) add(K.bedrockTile(mask));
    for (let g = 0; g < 5; g++) add(K.shardKey(g));
    for (const k of [K.SPARK, K.DUST, K.GLINT, K.GLOW, K.STAR_FULL, K.STAR_EMPTY]) add(k);
    for (const k of [K.ICON_MOVES, K.ICON_DEPTH, K.ICON_RELIC, K.ICON_SOUND_ON, K.ICON_SOUND_OFF, K.ICON_SETTINGS, K.ICON_BACK, K.ICON_LEVELS, K.LOCK, K.HAND]) add(k);
    for (const p of ['jeweler', 'archaeologist', 'alchemist', 'blacksmith'] as PathId[]) add(K.perkKey(p));
    items.push([K.PANEL, 'panel'], [K.PANEL_DARK, 'panel_dark'], [K.BUTTON, 'button'], [K.BUTTON_PRESSED, 'button_pressed'], [K.BOARD_FRAME, 'board_frame']);
    items.push([K.relicKey(0, true), 'relic_big_0'], ['bigcrust_2', 'crust_big_2'], ['bigcrust_1', 'crust_big_1']);
    const dark = new Set<string>([K.SPARK, K.GLOW, K.DUST, K.FX_SHOCK_RING, K.POWER_ARMED_RING, K.POWER_RETICLE, K.FX_EMBER, K.FX_SPARK_BLUE, K.FX_SPARK_GREEN, K.GEODE_GLINT, K.FX_BOLT_SEGMENT, K.FX_WAVE_STREAK, ...K.FX_FLAME_FRAMES]);

    const gap = Math.max(10, c * 0.3);
    const label = Math.max(10, Math.min(13, c * 0.2));
    let x = gap;
    let y = gap;
    let rowH = 0;
    const placed: (() => void)[] = [];
    for (const [key, name] of items) {
      let w = c;
      let h = c;
      if (key.startsWith('bigcrust')) { w = m.big; h = m.big; }
      else if (this.textures.get(A).has(key)) { const f = this.textures.getFrame(A, key); w = f.width; h = f.height; }
      const cw = Math.max(w, c * 1.3);
      if (x + cw > W - gap) { x = gap; y += rowH + label + gap; rowH = 0; }
      const px = x;
      const py = y;
      placed.push(() => {
        const cx = px + cw / 2;
        const cy = py + h / 2;
        if (key.startsWith('relic+crust')) {
          this.add.image(cx, cy, A, K.relicKey(3));
          this.add.image(cx, cy, A, K.crustKey(Number(key.slice(-1))));
        } else if (key.startsWith('bigcrust')) {
          this.add.image(cx, cy, A, K.relicKey(5, true));
          this.add.image(cx, cy, A, K.crustKey(Number(key.slice(-1)), true));
        } else {
          if (dark.has(key)) this.add.rectangle(cx, cy, w, h, 0x241208);
          this.add.image(cx, cy, A, key);
        }
        this.add.text(px, py + h + 2, name, { fontFamily: 'system-ui, sans-serif', fontSize: `${label}px`, color: '#ffe9c2' });
      });
      x += cw + gap;
      rowH = Math.max(rowH, h);
    }
    const H = Math.ceil(y + rowH + label + gap * 2);
    this.scale.resize(W, H);
    this.bgMs = drawStrataBackground(this, W, H, depth, c);
    this.add.image(0, 0, K.BACKGROUND).setOrigin(0);
    for (const p of placed) p();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#3a2418',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: { mode: Phaser.Scale.NONE },
  scene: Preview,
  banner: false,
});
