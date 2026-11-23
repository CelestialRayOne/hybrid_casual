// Perk offer after a perk point is earned (levels 3, 7, 11, 15, 19): three cards (perk icon, path, name,
// description). Tap one to spend the point on it, or "Save for later" to keep the point for the perks screen.
import Phaser from 'phaser';
import { PATHS, PERKS, spendPerkPoint } from '../../core';
import type { PerkId } from '../../core';
import { TELEMETRY_EVENTS as EV } from '../../telemetry';
import * as K from '../art/keys';
import { PATH } from '../art/palette';
import { ctx, getServices } from '../services';
import { STRINGS } from '../strings';
import { Button, addPanel, addText } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';

export interface PerkPickData extends OverlayData {
  level: number;
  offer: PerkId[];
  onDone: () => void;
}

const A = K.ART_ATLAS;

/** Darker ink version of a path colour for text on the cream card. */
const PATH_INK: Record<string, string> = {
  jeweler: '#0b6f86',
  archaeologist: '#7a4a1c',
  alchemist: '#5a23a8',
  blacksmith: '#b4470b',
};

const pickHandlers = new Map<number, () => void>();
const cardObjs = new Map<number, Phaser.GameObjects.GameObject & { getBounds(): Phaser.Geom.Rectangle }>();

/** Test hook: centre of card `i` in game px (for a real pointer tap). */
export function perkCardCenter(i: number): { x: number; y: number } | null {
  const o = cardObjs.get(i);
  if (!o || !o.active) return null;
  const r = o.getBounds();
  return { x: r.centerX, y: r.centerY };
}

/** Test hook: choose card `i` of the open perk pick. */
export function pickPerkCard(i: number): boolean {
  const fn = pickHandlers.get(i);
  if (!fn) return false;
  fn();
  return true;
}

export class PerkPickScene extends Overlay<PerkPickData> {
  static readonly KEY = 'PerkPick';
  private chosen = false;

  constructor() {
    super(PerkPickScene.KEY);
  }

  override init(data: PerkPickData): void {
    super.init(data);
    this.chosen = false;
    this.dim = 0.65;
  }

  protected buildContent(): void {
    pickHandlers.clear();
    cardObjs.clear();
    const offer = this.d.offer;
    const n = offer.length;
    const horizontal = this.layout.mode === 'wide';
    const u = horizontal ? this.unitFor(4.6 * n + 0.6, 9.6) : this.unitFor(8, 3.25 * n + 4.0);
    const a = this.area();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const cardW = horizontal ? u * 4.3 : u * 7.6;
    const cardH = horizontal ? u * 5.7 : u * 2.95;
    const gap = u * 0.3;
    const totalH = horizontal ? cardH : n * cardH + (n - 1) * gap;
    const totalW = horizontal ? n * cardW + (n - 1) * gap : cardW;
    const headH = u * 2.0;
    const footH = u * 1.5;
    const top = cy - (totalH + headH + footH) / 2;

    const pt = this.add.image(cx, top + u * 0.1, A, K.PERK_POINT).setDisplaySize(u * 0.9, u * 0.9);
    this.root.add(pt);
    this.tweens.add({ targets: pt, angle: { from: -8, to: 8 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.text(cx, top + u * 0.95, STRINGS.perkPointTitle, u * 0.72);
    this.text(cx, top + u * 1.6, STRINGS.perkOfferSubtitle, this.f.body, '#ffe9c2');
    const save = new Button(this, this.m, {
      x: cx, y: top + headH + totalH + footH * 0.55, w: Math.min(u * 5, cardW), h: u * 1.0, label: STRINGS.saveForLater, kind: 'secondary',
      onClick: () => this.saveForLater(), id: 'perk.save',
    });
    this.root.add(save);

    const y0 = top + headH;
    offer.forEach((id, i) => {
      const x = horizontal ? cx - totalW / 2 + cardW / 2 + i * (cardW + gap) : cx;
      const y = horizontal ? y0 + cardH / 2 : y0 + cardH / 2 + i * (cardH + gap);
      this.card(id, i, x, y, cardW, cardH, u, horizontal);
    });
  }

  private card(id: PerkId, i: number, x: number, y: number, w: number, h: number, u: number, tall: boolean): void {
    const info = PERKS[id];
    const card = this.add.container(x, y);
    const bg = addPanel(this, 0, 0, w, h, this.m, K.PANEL);
    card.add(bg);
    const ink = PATH_INK[info.path] ?? '#4a2a14';
    const pathName = PATHS[info.path].name.toUpperCase();
    const iconS = u * (tall ? 1.9 : 1.75);
    if (tall) {
      const icon = this.add.image(0, -h / 2 + u * 1.35, A, K.perkIconKey(id)).setDisplaySize(iconS, iconS);
      const p = addText(this, 0, -h / 2 + u * 2.6, pathName, this.f.small, { color: ink }).setOrigin(0.5);
      const nm = addText(this, 0, -h / 2 + u * 3.15, info.name, u * 0.5, { color: '#3a200e' }).setOrigin(0.5);
      const ds = addText(this, 0, -h / 2 + u * 3.6, info.description, this.f.body, { color: '#6b3d1c', wrap: w - u * 0.6, weight: 'normal' }).setOrigin(0.5, 0);
      card.add([icon, p, nm, ds]);
      if (nm.width > w - u * 0.5) nm.setScale((w - u * 0.5) / nm.width);
      const room = h / 2 - u * 0.35 - ds.y;
      if (ds.height > room) ds.setScale(room / ds.height);
    } else {
      const ix = -w / 2 + u * 1.2;
      const icon = this.add.image(ix, 0, A, K.perkIconKey(id)).setDisplaySize(iconS, iconS);
      const tx = ix + iconS / 2 + u * 0.35;
      const tw = w / 2 - tx - u * 0.3;
      const p = addText(this, tx, -h / 2 + u * 0.32, pathName, this.f.small, { color: ink, align: 'left' }).setOrigin(0, 0);
      const nm = addText(this, tx, -h / 2 + u * 0.7, info.name, u * 0.5, { color: '#3a200e', align: 'left' }).setOrigin(0, 0);
      const ds = addText(this, tx, -h / 2 + u * 1.32, info.description, info.description.length > 60 ? this.f.small * 1.08 : this.f.body, { color: '#6b3d1c', wrap: tw, weight: 'normal', align: 'left' }).setOrigin(0, 0);
      card.add([icon, p, nm, ds]);
      const room = h - u * 1.6;
      if (ds.height > room) ds.setFontSize(Math.max(10, Math.floor(this.f.body * Math.sqrt(room / ds.height))));
      if (ds.height > room) ds.setScale(room / ds.height);
    }
    // Coloured edge glint in the path colour.
    const stripe = this.add.rectangle(0, h / 2 - u * 0.16, w * 0.6, u * 0.08, Phaser.Display.Color.HexStringToColor(PATH[info.path].primary).color, 0.9);
    card.add(stripe);
    this.root.add(card);

    const choose = () => this.choose(id, card);
    pickHandlers.set(i, choose);
    cardObjs.set(i, bg);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      if (this.chosen) return;
      this.tweens.add({ targets: card, scale: 0.96, duration: 70 });
    });
    bg.on('pointerout', () => {
      if (!this.chosen) this.tweens.add({ targets: card, scale: 1, duration: 120 });
    });
    bg.on('pointerup', () => choose());

    if (!this.chosen) {
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, delay: 120 + i * 110, duration: 320, ease: 'Back.easeOut' });
    }
  }

  private choose(id: PerkId, card: Phaser.GameObjects.Container): void {
    if (this.chosen) return;
    this.chosen = true;
    const c = ctx();
    const sv = getServices();
    sv.audio.play('perk_pick');
    c.setProgress(spendPerkPoint(c.progress, id));
    sv.telemetry.log(EV.perkPointSpent, { level: this.d.level, perk: id, from: 'offer' });
    this.root.each((o: Phaser.GameObjects.GameObject) => {
      if (o !== card && o instanceof Phaser.GameObjects.Container) this.tweens.add({ targets: o, alpha: 0.25, scale: 0.92, duration: 220 });
    });
    this.root.bringToTop(card);
    this.tweens.add({ targets: card, scale: 1.08, duration: 200, ease: 'Back.easeOut', yoyo: true, hold: 260 });
    const glow = this.add.image(card.x, card.y, A, K.GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe07a).setAlpha(0.9);
    glow.setScale((this.layout.cell * 1.5) / this.m.glow);
    this.root.addAt(glow, 0);
    this.tweens.add({ targets: glow, scale: (this.layout.cell * 6) / this.m.glow, alpha: 0, duration: 650, ease: 'Quad.easeOut' });
    this.time.delayedCall(820, () => this.d.onDone());
  }

  private saveForLater(): void {
    if (this.chosen) return;
    this.chosen = true;
    getServices().telemetry.log(EV.perkPointSaved, { level: this.d.level });
    this.d.onDone();
  }
}
