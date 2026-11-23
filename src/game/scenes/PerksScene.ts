// The perks screen (from the HUD and from level select): the four paths with their two perks each, marked owned /
// available / locked; unspent perk points, reforge tokens, and the next level that grants a point. Tap a glowing
// (available) perk, then "Learn" to spend a point on it. "Reforge" spends 1 token to refund every perk as points
// (with a confirm step).
import Phaser from 'phaser';
import {
  PATHS, PERKS, PERK_IDS, canReforge, nextPerkPointLevel, perkStatus, reforge, spendPerkPoint,
} from '../../core';
import type { PathId, PerkId } from '../../core';
import { TELEMETRY_EVENTS as EV } from '../../telemetry';
import * as K from '../art/keys';
import { ctx, getServices } from '../services';
import { STRINGS } from '../strings';
import { Button, addPanel, addText } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';

export interface PerksData extends OverlayData {
  /** Opened mid-level after the first move: perk changes apply from the next attempt (say so). */
  nextTryNote?: boolean;
}

const A = K.ART_ATLAS;
const PATH_ORDER: PathId[] = ['jeweler', 'archaeologist', 'alchemist', 'blacksmith'];
/** Ink colours for path names on the dark panel. */
const PATH_LABEL: Record<PathId, string> = {
  jeweler: '#5fe6f5',
  archaeologist: '#f0c890',
  alchemist: '#c49bff',
  blacksmith: '#ff9c5a',
};

const nodeHandlers = new Map<PerkId, () => void>();
const nodeObjs = new Map<PerkId, Phaser.GameObjects.Image>();

/** Test hook: centre of a perk node in game px. */
export function perkNodeCenter(id: PerkId): { x: number; y: number } | null {
  const o = nodeObjs.get(id);
  if (!o || !o.active) return null;
  const r = o.getBounds();
  return { x: r.centerX, y: r.centerY };
}

/** Test hook: tap a perk node. */
export function pickPerkNode(id: PerkId): boolean {
  const fn = nodeHandlers.get(id);
  if (!fn) return false;
  fn();
  return true;
}

export class PerksScene extends Overlay<PerksData> {
  static readonly KEY = 'Perks';
  private selected: PerkId | null = null;
  private confirming = false;
  private celebrate: PerkId | 'reforge' | null = null;

  constructor() {
    super(PerksScene.KEY);
  }

  override init(data: PerksData): void {
    super.init(data);
    this.selected = null;
    this.confirming = false;
    this.celebrate = null;
    this.dim = 0.7;
  }

  override create(): void {
    getServices().audio.play('ui_open');
    super.create();
  }

  protected override onBackdrop(): void {
    if (this.confirming) return;
    this.leave();
  }

  private leave(): void {
    getServices().audio.play('ui_close');
    this.close();
  }

  protected buildContent(): void {
    nodeHandlers.clear();
    nodeObjs.clear();
    if (this.confirming) this.buildConfirm();
    else this.buildMain();
  }

  private buildMain(): void {
    const p = ctx().progress;
    const u = this.unitFor(8.8, 14.2);
    const a = this.area();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const w = u * 8.6;
    const h = u * 13.9;
    const top = cy - h / 2;
    const panel = this.panel(cx, cy, w, h, K.PANEL_DARK);
    panel.setInteractive(); // swallow taps on the panel itself
    this.titlePlate(cx, top, w * 0.55, STRINGS.perksTitle, u);
    this.root.add(new Button(this, this.m, { x: cx - w / 2 + u * 0.75, y: top + u * 0.95, w: u * 0.95, h: u * 0.95, icon: K.ICON_BACK, kind: 'icon', onClick: () => this.leave(), id: 'perks.close' }));

    // Counters: perk points and reforge tokens.
    let y = top + u * 1.35;
    const cs = u * 0.8;
    const counter = (x: number, frame: string, n: number, id: string) => {
      const img = this.add.image(x, y, A, frame).setDisplaySize(cs, cs);
      const t = addText(this, x + cs * 0.65, y, String(n), u * 0.55).setOrigin(0, 0.5);
      t.setName(id);
      this.root.add([img, t]);
      return img;
    };
    const pointsIcon = counter(cx - u * 1.6, K.PERK_POINT, p.perkPoints, 'points');
    counter(cx + u * 0.9, K.REFORGE_TOKEN, p.reforgeTokens, 'tokens');
    if (p.perkPoints > 0) this.tweens.add({ targets: pointsIcon, angle: { from: -10, to: 10 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    y += u * 0.75;
    const next = nextPerkPointLevel(p);
    this.text(cx, y, next === null ? STRINGS.perksAllPoints : STRINGS.perksNext(next), this.f.small, '#ffe9c2');

    // Four path columns with two perk nodes each.
    y += u * 0.55;
    const colW = (w - u * 0.5) / 4;
    const node = Math.min(colW * 0.86, u * 1.75);
    PATH_ORDER.forEach((path, i) => {
      const x = cx - w / 2 + u * 0.25 + colW * (i + 0.5);
      const badge = this.add.image(x, y + u * 0.5, A, K.perkKey(path)).setDisplaySize(u * 0.9, u * 0.9);
      const name = addText(this, x, y + u * 1.12, PATHS[path].name, Math.max(10, u * 0.28), { color: PATH_LABEL[path] }).setOrigin(0.5, 0);
      if (name.width > colW * 0.96) name.setScale((colW * 0.96) / name.width);
      this.root.add([badge, name]);
      const perks = PERK_IDS.filter((id) => PERKS[id].path === path);
      perks.forEach((id, k) => {
        const ny = y + u * 1.6 + node / 2 + k * (node + u * 0.85);
        this.node(id, x, ny, node, colW, u);
      });
    });

    // Detail of the selected perk (or a hint).
    const dy = y + u * 1.6 + node * 2 + u * 0.85 * 2 + u * 0.05;
    this.detail(cx, dy, w - u * 0.6, u);

    // Reforge + notes.
    const ry = top + h - u * 1.5;
    const can = canReforge(p);
    const rb = new Button(this, this.m, {
      x: cx, y: ry, w: u * 4.2, h: u * 1.0, label: STRINGS.reforge, icon: K.REFORGE_TOKEN, kind: 'secondary',
      onClick: () => {
        if (!canReforge(ctx().progress)) return;
        this.confirming = true;
        this.build();
      },
      id: 'perks.reforge',
    });
    rb.setEnabled(can);
    this.root.add(rb);
    this.text(cx, ry + u * 0.82, this.d.nextTryNote ? STRINGS.perksNextTry : STRINGS.reforgeHint, this.f.small, this.d.nextTryNote ? '#ffd27a' : '#c9a882', w * 0.92);

    if (this.celebrate === 'reforge') {
      for (const id of PERK_IDS) {
        const o = nodeObjs.get(id);
        if (o) this.burst(o.x, o.y, u, 0xffb35a, 6);
      }
    }
    this.celebrate = null;
  }

  private node(id: PerkId, x: number, y: number, size: number, colW: number, u: number): void {
    const p = ctx().progress;
    const status = perkStatus(p, id);
    const frame = status === 'owned' ? K.PERK_NODE_OWNED : status === 'available' ? K.PERK_NODE_AVAILABLE : K.PERK_NODE_LOCKED;
    const nf = this.add.image(x, y, A, frame).setDisplaySize(size, size);
    const icon = this.add.image(x, y, A, K.perkIconKey(id)).setDisplaySize(size * 0.7, size * 0.7);
    if (status === 'locked') icon.setTint(0x8a8a8a).setAlpha(0.55);
    const label = addText(this, x, y + size / 2 + u * 0.08, PERKS[id].name, Math.max(10, u * 0.26), {
      color: status === 'owned' ? '#fff3c4' : status === 'available' ? '#ffffff' : '#a08a74', wrap: colW * 0.95, lineSpacing: -2,
    }).setOrigin(0.5, 0);
    if (label.width > colW * 0.98) label.setScale((colW * 0.98) / label.width);
    this.root.add([nf, icon, label]);
    if (this.selected === id) {
      const ring = this.add.graphics();
      ring.lineStyle(Math.max(2, u * 0.07), 0xffe27a, 1).strokeCircle(x, y, size * 0.53);
      this.root.add(ring);
      this.tweens.add({ targets: ring, alpha: 0.4, duration: 520, yoyo: true, repeat: -1 });
    }
    if (status === 'available') {
      const base = nf.scale;
      this.tweens.add({ targets: [nf], scale: base * 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (this.celebrate === id) {
      this.burst(x, y, u, 0xffe07a, 18);
      const s = icon.scale;
      icon.setScale(s * 1.5);
      this.tweens.add({ targets: icon, scale: s, duration: 420, ease: 'Back.easeOut' });
    }
    const pick = () => {
      getServices().audio.play('ui_click');
      this.selected = id;
      this.build();
    };
    nodeHandlers.set(id, pick);
    nodeObjs.set(id, nf);
    nf.setInteractive({ useHandCursor: true });
    nf.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.wasCanceled) pick();
    });
  }

  private detail(cx: number, y: number, w: number, u: number): void {
    const p = ctx().progress;
    const id = this.selected;
    const h = u * 2.05;
    const bg = addPanel(this, cx, y + h / 2, w, h, this.m, K.PANEL);
    this.root.add(bg);
    if (!id) {
      this.text(cx, y + h / 2, p.perkPoints > 0 ? STRINGS.perksTapToLearn : STRINGS.perksNoPoints, this.f.body, '#6b3d1c', w * 0.9);
      return;
    }
    const info = PERKS[id];
    const status = perkStatus(p, id);
    const iconS = u * 1.15;
    const ix = cx - w / 2 + u * 0.3 + iconS / 2;
    this.root.add(this.add.image(ix, y + h / 2, A, K.perkIconKey(id)).setDisplaySize(iconS, iconS));
    const tx = ix + iconS / 2 + u * 0.25;
    const btnW = status === 'available' ? u * 2.2 : 0;
    const tw = cx + w / 2 - tx - u * 0.3 - btnW;
    const name = addText(this, tx, y + u * 0.22, `${info.name}  ·  ${PATHS[info.path].name}`, this.f.body, { color: '#3a200e', align: 'left' }).setOrigin(0, 0);
    if (name.width > tw) name.setScale(tw / name.width);
    const desc = addText(this, tx, y + u * 0.72, info.description, this.f.small, { color: '#6b3d1c', align: 'left', wrap: tw, weight: 'normal' }).setOrigin(0, 0);
    if (desc.height > h - u * 0.85) desc.setScale((h - u * 0.85) / desc.height);
    this.root.add([name, desc]);
    if (status === 'available') {
      const b = new Button(this, this.m, { x: cx + w / 2 - u * 0.25 - btnW / 2, y: y + h / 2, w: btnW, h: u * 1.0, label: STRINGS.perkLearn, onClick: () => this.learn(id), id: 'perks.learn' });
      this.root.add(b);
      this.tweens.add({ targets: b, scale: 1.05, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      const s = addText(this, cx + w / 2 - u * 0.3, y + h - u * 0.28, status === 'owned' ? STRINGS.perkOwned : STRINGS.perkLocked, this.f.small, { color: status === 'owned' ? '#2f8a3a' : '#9a6a48' }).setOrigin(1, 0.5);
      this.root.add(s);
    }
  }

  private learn(id: PerkId): void {
    const c = ctx();
    const sv = getServices();
    const next = spendPerkPoint(c.progress, id);
    if (next === c.progress) return;
    c.setProgress(next);
    sv.audio.play('perk_pick');
    sv.telemetry.log(EV.perkPointSpent, { perk: id, from: 'screen' });
    this.celebrate = id;
    this.build();
  }

  private buildConfirm(): void {
    const p = ctx().progress;
    const u = this.unitFor(8, 7);
    const a = this.area();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const w = u * 7.0;
    const h = u * 5.2;
    const top = cy - h / 2;
    const panel = this.panel(cx, cy, w, h);
    panel.setInteractive();
    const tok = this.add.image(cx, top + u * 0.15, A, K.REFORGE_TOKEN).setDisplaySize(u * 1.2, u * 1.2);
    this.root.add(tok);
    this.text(cx, top + u * 1.3, STRINGS.reforgeTitle, u * 0.55, '#4a2a14', w * 0.9);
    this.text(cx, top + u * 2.35, STRINGS.reforgeBody(p.perks.length), this.f.body, '#6b3d1c', w * 0.86);
    const bw = u * 2.8;
    const bh = u * 1.1;
    const yes = new Button(this, this.m, {
      x: cx - bw / 2 - u * 0.15, y: top + u * 4.0, w: bw, h: bh, label: STRINGS.reforgeYes, icon: K.REFORGE_TOKEN,
      onClick: () => this.doReforge(),
      id: 'perks.reforgeYes',
    });
    const no = new Button(this, this.m, {
      x: cx + bw / 2 + u * 0.15, y: top + u * 4.0, w: bw, h: bh, label: STRINGS.cancel, kind: 'secondary',
      onClick: () => {
        this.confirming = false;
        this.build();
      },
      id: 'perks.reforgeNo',
    });
    this.root.add([yes, no]);
  }

  private doReforge(): void {
    const c = ctx();
    const sv = getServices();
    const refunded = c.progress.perks.length;
    const next = reforge(c.progress);
    this.confirming = false;
    if (next !== c.progress) {
      c.setProgress(next);
      sv.audio.play('reforge_token');
      sv.audio.play('perk_pick', { pitch: -5 });
      sv.telemetry.log(EV.reforgeUsed, { refunded });
      this.celebrate = 'reforge';
      this.selected = null;
    }
    this.build();
  }

  private burst(x: number, y: number, u: number, tint: number, n: number): void {
    const e = this.add.particles(x, y, A, {
      frame: K.SPARK,
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      speed: { min: u * 1.5, max: u * 4.5 },
      lifespan: { min: 300, max: 650 },
      scale: { start: (u * 0.4) / this.m.spark, end: 0 },
      tint,
    });
    this.root.add(e);
    e.explode(n);
    const glow = this.add.image(x, y, A, K.GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale((u * 1.2) / this.m.glow);
    this.root.add(glow);
    this.tweens.add({ targets: glow, scale: (u * 4) / this.m.glow, alpha: 0, duration: 600, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
    this.time.delayedCall(900, () => e.destroy());
  }
}

