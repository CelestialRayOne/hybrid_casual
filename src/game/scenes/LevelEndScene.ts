// Level end overlay. Win: stars chime in over a confetti of gem shards (a bigger storm for bosses), then relics
// found (x/goal + bonus), boons gained, reforge tokens / perk point earned, and "Next". Fail: a free "+5 moves"
// continue (once per level) or "Retry" (a fresh attempt: new gems). After the last level: "You've dug it all".
import Phaser from 'phaser';
import { BOON_IDS } from '../../core';
import type { BoonId } from '../../core';
import * as K from '../art/keys';
import { getServices } from '../services';
import { STRINGS } from '../strings';
import { Button, addText } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';

export interface LevelEndData extends OverlayData {
  result: 'win' | 'lose';
  level: number;
  stars?: 1 | 2 | 3;
  movesLeft?: number | null;
  hard?: boolean;
  boss?: boolean;
  final?: boolean;
  relics?: number;
  goal?: number;
  bonus?: number;
  boons?: Partial<Record<BoonId, number>>;
  tokens?: number;
  perkPoint?: boolean;
  canContinue?: boolean;
  onNext?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onLevels?: () => void;
}

const A = K.ART_ATLAS;
const INK = '#4a2a14';
const INK_SOFT = '#6b3d1c';

export class LevelEndScene extends Overlay<LevelEndData> {
  static readonly KEY = 'LevelEnd';
  private celebrated = false;

  constructor() {
    super(LevelEndScene.KEY);
  }

  override init(data: LevelEndData): void {
    super.init(data);
    this.celebrated = false;
    this.dim = data.result === 'win' ? 0.45 : 0.6;
  }

  protected buildContent(): void {
    if (this.d.result === 'win') this.buildWin();
    else this.buildLose();
  }

  private buildWin(): void {
    const d = this.d;
    const final = !!d.final;
    const boons = BOON_IDS.filter((b) => (d.boons?.[b] ?? 0) > 0);
    const extras = (d.tokens ?? 0) > 0 || !!d.perkPoint;
    const rowsH = 0.85 + (boons.length ? 1.0 : 0) + (extras ? 0.95 : 0) + (final ? 2.6 : 0.75);
    const hUnits = 3.95 + rowsH + 1.75;
    const u = this.unitFor(8, hUnits + 0.6);
    const a = this.area();
    const w = u * 7.4;
    const h = u * hUnits;
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const top = cy - h / 2;
    this.panel(cx, cy, w, h);
    const title = final ? STRINGS.allDoneTitle : d.boss ? STRINGS.bossWin : d.hard ? STRINGS.hardWin : STRINGS.winTitle;
    this.titlePlate(cx, top, w * 0.84, title, u);
    if (d.boss) {
      const b = this.add.image(cx - w * 0.43, top - u * 0.1, A, K.BADGE_BOSS).setDisplaySize(u * 1.3, u * 1.3).setAngle(-10);
      this.root.add(b);
    }

    // Stars: empty sockets, then the earned ones pop in one by one (a rising "star" chime per star).
    const sy = top + u * 2.0;
    const pos = [
      { x: cx - u * 1.75, y: sy + u * 0.3, s: u * 1.45, a: -14 },
      { x: cx, y: sy - u * 0.1, s: u * 1.85, a: 0 },
      { x: cx + u * 1.75, y: sy + u * 0.3, s: u * 1.45, a: 14 },
    ];
    const earned = d.stars ?? 1;
    pos.forEach((p, i) => {
      const empty = this.add.image(p.x, p.y, A, K.STAR_EMPTY).setDisplaySize(p.s, p.s).setAngle(p.a);
      this.root.add(empty);
      if (i >= earned) return;
      const star = this.add.image(p.x, p.y, A, K.STAR_FULL).setAngle(p.a);
      const scale = p.s / star.frame.width;
      this.root.add(star);
      if (this.celebrated) {
        star.setScale(scale);
        return;
      }
      star.setScale(0);
      this.tweens.add({
        targets: star,
        scale: scale,
        delay: 250 + i * 220,
        duration: 360,
        ease: 'Back.easeOut',
        onStart: () => {
          getServices().audio.play('star', { index: i });
          this.sparkle(p.x, p.y, u);
        },
      });
    });

    // Relics found (x/goal + bonus).
    let y = top + u * 3.95;
    const rs = u * 0.7;
    const relicLine = addText(this, 0, y, STRINGS.relicsFound(d.relics ?? 0, d.goal ?? 1), this.f.label, { color: INK }).setOrigin(0, 0.5);
    const bonusLine = (d.bonus ?? 0) > 0 ? addText(this, 0, y, STRINGS.bonusFound(d.bonus ?? 0), this.f.label, { color: '#b46a00' }).setOrigin(0, 0.5) : null;
    const lineW = rs + u * 0.2 + relicLine.width + (bonusLine ? u * 0.25 + bonusLine.width : 0);
    let x = cx - lineW / 2;
    const ri = this.add.image(x + rs / 2, y, A, K.ICON_RELIC).setDisplaySize(rs, rs);
    x += rs + u * 0.2;
    relicLine.setX(x);
    x += relicLine.width + u * 0.25;
    bonusLine?.setX(x);
    this.root.add([ri, relicLine]);
    if (bonusLine) this.root.add(bonusLine);
    y += u * 0.85;

    // Boons gained this attempt.
    if (boons.length) {
      const bs = Math.min(u * 0.8, (w * 0.9) / boons.length / 1.15);
      const step = bs * 1.18;
      boons.forEach((b, i) => {
        const bx = cx + (i - (boons.length - 1) / 2) * step;
        const img = this.add.image(bx, y, A, K.boonKey(BOON_IDS.indexOf(b))).setDisplaySize(bs, bs);
        this.root.add(img);
        const n = d.boons?.[b] ?? 0;
        if (n > 1) {
          const bub = this.add.image(bx + bs * 0.38, y - bs * 0.34, A, K.BOON_STACK_BUBBLE).setDisplaySize(bs * 0.5, bs * 0.5);
          const t = addText(this, bub.x, bub.y, String(n), bs * 0.3).setOrigin(0.5, 0.52);
          this.root.add([bub, t]);
        }
        if (!this.celebrated) {
          const s = img.scale;
          img.setScale(0);
          this.tweens.add({ targets: img, scale: s, delay: 500 + earned * 220 + i * 90, duration: 300, ease: 'Back.easeOut' });
        }
      });
      y += u * 1.0;
    }

    // Reforge tokens and the perk point earned.
    if (extras) {
      const items: [string, string, string][] = [];
      if ((d.tokens ?? 0) > 0) items.push([K.REFORGE_TOKEN, STRINGS.tokensWon(d.tokens ?? 0), '#8a4a0a']);
      if (d.perkPoint) items.push([K.PERK_POINT, STRINGS.perkPointTitle, '#2a6a8a']);
      const is = u * 0.72;
      const texts = items.map(([, label, col]) => addText(this, 0, y, label, this.f.label, { color: col }).setOrigin(0, 0.5));
      const total = texts.reduce((sum, t) => sum + is + u * 0.15 + t.width, 0) + (items.length - 1) * u * 0.6;
      let ix = cx - total / 2;
      items.forEach(([frame], i) => {
        const img = this.add.image(ix + is / 2, y, A, frame).setDisplaySize(is, is);
        const t = texts[i]!;
        t.setX(ix + is + u * 0.15);
        ix += is + u * 0.15 + t.width + u * 0.6;
        this.root.add([img, t]);
        if (!this.celebrated) {
          const s = img.scale;
          img.setScale(0);
          this.tweens.add({
            targets: img,
            scale: s,
            delay: 800 + earned * 220 + i * 160,
            duration: 340,
            ease: 'Back.easeOut',
            onStart: () => {
              getServices().audio.play(frame === K.REFORGE_TOKEN ? 'reforge_token' : 'perk_pick');
              this.sparkle(img.x, img.y, u * 0.7);
            },
          });
        }
      });
      y += u * 0.95;
    }

    if (final) {
      this.text(cx, y + u * 0.35, STRINGS.allDoneBody, u * 0.55, INK);
      this.text(cx, y + u * 1.15, STRINGS.allDoneHint, this.f.body, '#8a5a34', w * 0.85);
      y += u * 2.6;
      const b = new Button(this, this.m, { x: cx, y: y + u * 0.2, w: u * 4.2, h: u * 1.15, label: STRINGS.levels, icon: K.ICON_LEVELS, onClick: () => d.onLevels?.(), id: 'end.levels' });
      this.root.add(b);
    } else {
      if (d.movesLeft !== null && d.movesLeft !== undefined) this.text(cx, y, STRINGS.movesLeft(d.movesLeft), this.f.body, INK_SOFT);
      y += u * 0.75;
      const bw = u * 4.0;
      const bh = u * 1.2;
      const by = y + u * 0.6;
      const next = new Button(this, this.m, { x: cx + u * 0.75, y: by, w: bw, h: bh, label: STRINGS.next, onClick: () => d.onNext?.(), id: 'end.next' });
      const lv = new Button(this, this.m, { x: cx - bw / 2 + u * 0.75 - u * 1.05, y: by, w: bh, h: bh, icon: K.ICON_LEVELS, kind: 'icon', onClick: () => d.onLevels?.(), id: 'end.levels' });
      this.root.add([lv, next]);
      if (!this.celebrated) {
        next.setScale(0);
        this.tweens.add({ targets: next, scale: 1, delay: 300 + earned * 220, duration: 280, ease: 'Back.easeOut' });
      }
    }
    if (!this.celebrated) this.confetti(u, !!d.boss || final);
    this.celebrated = true;
  }

  private sparkle(x: number, y: number, u: number): void {
    const e = this.add.particles(x, y, A, {
      frame: K.SPARK,
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      speed: { min: u * 1.5, max: u * 4 },
      lifespan: { min: 250, max: 500 },
      scale: { start: (u * 0.35) / this.m.spark, end: 0 },
      tint: 0xffe07a,
    });
    this.root.add(e);
    e.explode(14);
    this.time.delayedCall(700, () => e.destroy());
  }

  /** Gem-shard confetti raining from the top of the screen (a bigger, longer storm with side bursts for bosses). */
  private confetti(u: number, big: boolean): void {
    const L = this.layout;
    const s = (u * 0.42) / this.m.shard;
    const e = this.add.particles(0, -u, A, {
      frame: [K.shardKey(0), K.shardKey(1), K.shardKey(2), K.shardKey(3), K.shardKey(4)],
      x: { min: 0, max: L.width },
      speedY: { min: u * 1.5, max: u * 4.5 },
      speedX: { min: -u * 1.2, max: u * 1.2 },
      gravityY: u * 3.5,
      lifespan: { min: 2200, max: 3200 },
      rotate: { start: 0, end: 720 },
      scale: { start: s, end: s * 0.7 },
      alpha: { start: 1, end: 0.2 },
      quantity: big ? 5 : 3,
      frequency: 30,
      maxParticles: big ? 260 : 160,
    });
    this.children.moveDown(e);
    this.time.delayedCall(big ? 2200 : 1100, () => e.stop());
    this.time.delayedCall(big ? 5800 : 4600, () => e.destroy());
    if (!big) return;
    for (const [x, ang] of [[0, -50], [L.width, -130]] as const) {
      const side = this.add.particles(x, L.height * 0.78, A, {
        frame: K.SPARK,
        emitting: false,
        blendMode: Phaser.BlendModes.ADD,
        tint: [0xffe07a, 0xd68bff, 0x8af0ff],
        speed: { min: u * 6, max: u * 12 },
        angle: { min: ang - 18, max: ang + 18 },
        gravityY: u * 6,
        lifespan: { min: 900, max: 1500 },
        scale: { start: (u * 0.5) / this.m.spark, end: 0 },
        maxParticles: 120,
      });
      this.children.moveDown(side);
      for (const t of [200, 650, 1100]) this.time.delayedCall(t, () => side.explode(36));
      this.time.delayedCall(3000, () => side.destroy());
    }
  }

  private buildLose(): void {
    const d = this.d;
    const u = this.unitFor(8, 8.2);
    const a = this.area();
    const w = u * 7.2;
    const h = u * 7.4;
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const top = cy - h / 2;
    this.panel(cx, cy, w, h);
    this.titlePlate(cx, top, w * 0.78, STRINGS.failTitle, u);
    const icon = this.add.image(cx, top + u * 1.6, A, K.ICON_MOVES).setDisplaySize(u * 1.3, u * 1.3).setAngle(-12);
    this.root.add(icon);
    this.tweens.add({ targets: icon, angle: 12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.text(cx, top + u * 2.7, d.canContinue ? STRINGS.failBody : STRINGS.failBodyFinal, this.f.label, INK, w * 0.86);
    this.text(cx, top + u * 3.35, STRINGS.relicsFound(d.relics ?? 0, d.goal ?? 1), this.f.body, INK_SOFT);
    const bw = u * 5.2;
    const bh = u * 1.2;
    // Sell the randomness: a retry is a fresh board.
    const gemRow = (y: number) => {
      const gs = u * 0.42;
      const label = addText(this, 0, y, STRINGS.failRandom, this.f.small, { color: '#8a5a34' }).setOrigin(0, 0.5);
      const total = gs * 3 + u * 0.2 + label.width;
      let x = cx - total / 2;
      for (const g of [0, 1, 3]) {
        this.root.add(this.add.image(x + gs / 2, y, A, K.gemKey(g)).setDisplaySize(gs, gs));
        x += gs;
      }
      label.setX(x + u * 0.2);
      this.root.add(label);
    };
    if (d.canContinue) {
      const cont = new Button(this, this.m, { x: cx, y: top + u * 4.45, w: bw, h: bh, label: STRINGS.continuePlus, onClick: () => d.onContinue?.(), id: 'end.continue' });
      this.text(cx, top + u * 5.25, STRINGS.continueFree, this.f.small, '#8a5a34');
      const retry = new Button(this, this.m, { x: cx, y: top + u * 6.05, w: bw * 0.62, h: bh * 0.8, label: STRINGS.retry, kind: 'secondary', onClick: () => d.onRetry?.(), id: 'end.retry' });
      this.root.add([cont, retry]);
      gemRow(top + u * 6.9);
      this.tweens.add({ targets: cont, scale: 1.05, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      const retry = new Button(this, this.m, { x: cx + u * 0.7, y: top + u * 4.7, w: bw * 0.78, h: bh, label: STRINGS.retry, onClick: () => d.onRetry?.(), id: 'end.retry' });
      const lv = new Button(this, this.m, { x: cx - bw * 0.39 + u * 0.7 - u * 1.05, y: top + u * 4.7, w: bh, h: bh, icon: K.ICON_LEVELS, kind: 'icon', onClick: () => d.onLevels?.(), id: 'end.levels' });
      this.root.add([lv, retry]);
      gemRow(top + u * 6.0);
    }
  }
}
