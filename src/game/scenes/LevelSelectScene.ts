// Level select: a 5x4 grid of the 20 levels with best stars and locks; the current level is highlighted.
import type Phaser from 'phaser';
import { LEVEL_COUNT, getLevel } from '../../core';
import * as K from '../art/keys';
import { isUnlocked, starsFor, totalStars } from '../progress';
import { ctx, getServices } from '../services';
import { STRINGS } from '../strings';
import { Button, addPanel, addText } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';

export interface LevelSelectData extends OverlayData {
  current: number;
  onPick: (level: number) => void;
  /** Opens the perks screen (replaces this overlay). */
  onPerks?: () => void;
}

const A = K.ART_ATLAS;
const COLS = 5;

const tileHandlers = new Map<number, () => void>();
const tileObjs = new Map<number, Phaser.GameObjects.NineSlice>();

/** Test hook: centre of a level tile in game px (for a real pointer tap). */
export function levelTileCenter(level: number): { x: number; y: number } | null {
  const o = tileObjs.get(level);
  if (!o || !o.active) return null;
  const r = o.getBounds();
  return { x: r.centerX, y: r.centerY };
}

/** Test hook: tap a level tile. */
export function pickLevelTile(level: number): boolean {
  const fn = tileHandlers.get(level);
  if (!fn) return false;
  fn();
  return true;
}

export class LevelSelectScene extends Overlay<LevelSelectData> {
  static readonly KEY = 'LevelSelect';

  constructor() {
    super(LevelSelectScene.KEY);
  }

  protected override onBackdrop(): void {
    this.close();
  }

  protected buildContent(): void {
    tileHandlers.clear();
    tileObjs.clear();
    const rows = Math.ceil(LEVEL_COUNT / COLS);
    const u = this.unitFor(8.9, rows * 1.62 + 3.6);
    const a = this.area();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const tile = u * 1.36;
    const gap = u * 0.24;
    const gridW = COLS * tile + (COLS - 1) * gap;
    const gridH = rows * tile + (rows - 1) * gap;
    const w = gridW + u * 0.9;
    const h = gridH + u * 2.75;
    const top = cy - h / 2;
    const p = this.panel(cx, cy, w, h);
    p.setInteractive(); // swallow taps on the panel itself
    this.titlePlate(cx, top, Math.min(w * 0.7, u * 4.2), STRINGS.levelSelectTitle, u);

    const progress = ctx().progress;
    const back = new Button(this, this.m, { x: cx - w / 2 + u * 0.8, y: top + u * 1.05, w: u * 0.95, h: u * 0.95, icon: K.ICON_BACK, kind: 'icon', onClick: () => this.close(), id: 'levels.close' });
    this.root.add(back);
    if (this.d.onPerks) {
      const perks = new Button(this, this.m, { x: cx + w / 2 - u * 0.8, y: top + u * 1.05, w: u * 0.95, h: u * 0.95, icon: K.PERK_POINT, kind: 'icon', onClick: () => this.d.onPerks?.(), id: 'levels.perks' });
      this.root.add(perks);
      if (progress.perkPoints > 0) {
        const bs = u * 0.42;
        const bub = this.add.image(perks.x + u * 0.36, perks.y - u * 0.36, A, K.BOON_STACK_BUBBLE).setDisplaySize(bs, bs);
        const t = addText(this, bub.x, bub.y, String(progress.perkPoints), bs * 0.6).setOrigin(0.5, 0.52);
        this.root.add([bub, t]);
      }
    }

    // Total stars.
    const starY = top + u * 1.05;
    const st = this.add.image(cx - u * 0.55, starY, A, K.STAR_FULL).setDisplaySize(u * 0.55, u * 0.55);
    const tt = addText(this, cx - u * 0.2, starY, STRINGS.starsTotal(totalStars(progress), LEVEL_COUNT * 3), this.f.body, { color: '#6b3d1c' }).setOrigin(0, 0.5);
    this.root.add([st, tt]);

    const gx = cx - gridW / 2 + tile / 2;
    const gy = top + u * 1.75 + tile / 2;
    for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
      const i = lv - 1;
      const x = gx + (i % COLS) * (tile + gap);
      const y = gy + Math.floor(i / COLS) * (tile + gap);
      this.tile(lv, x, y, tile, u, isUnlocked(progress, lv), starsFor(progress, lv), lv === this.d.current);
    }
  }

  private tile(level: number, x: number, y: number, s: number, u: number, unlocked: boolean, stars: number, current: boolean): void {
    const c = this.add.container(x, y);
    const def = getLevel(level);
    const hard = def.hard;
    const boss = def.boss;
    const bg = addPanel(this, 0, 0, s, s, this.m, boss ? K.LEVEL_TILE_BOSS : K.PANEL_DARK);
    if (!unlocked) bg.setAlpha(boss ? 0.65 : 0.5);
    c.add(bg);
    if (current) {
      const ring = this.add.graphics();
      ring.lineStyle(Math.max(3, u * 0.09), 0xffd84a, 1).strokeRoundedRect(-s / 2 - u * 0.05, -s / 2 - u * 0.05, s + u * 0.1, s + u * 0.1, u * 0.28);
      c.add(ring);
      this.tweens.add({ targets: ring, alpha: 0.35, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (unlocked) {
      const num = addText(this, 0, -s * 0.12, String(level), s * 0.4, { color: boss ? '#fff3c4' : hard ? '#ffb4a8' : undefined }).setOrigin(0.5);
      c.add(num);
      const ss = s * 0.26;
      for (let k = 0; k < 3; k++) {
        const img = this.add.image((k - 1) * ss * 0.95, s * 0.27 + (k === 1 ? ss * 0.08 : 0), A, k < stars ? K.STAR_FULL : K.STAR_EMPTY).setDisplaySize(ss, ss);
        c.add(img);
      }
    } else {
      const lock = this.add.image(0, 0, A, K.LOCK).setDisplaySize(s * 0.5, s * 0.5).setAlpha(0.85);
      c.add(lock);
    }
    if (boss) {
      const b = this.add.image(s * 0.38, -s * 0.38, A, K.BADGE_BOSS).setDisplaySize(s * 0.5, s * 0.5);
      c.add(b);
      if (unlocked) this.tweens.add({ targets: b, angle: { from: -6, to: 6 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (hard) c.add(this.add.image(-s * 0.38, -s * 0.38, A, K.BADGE_HARD).setDisplaySize(s * 0.38, s * 0.38));
    this.root.add(c);
    const pick = () => {
      if (!unlocked) {
        getServices().audio.play('tap_invalid');
        this.tweens.add({ targets: c, angle: { from: -6, to: 6 }, duration: 50, yoyo: true, repeat: 2, onComplete: () => c.setAngle(0) });
        return;
      }
      getServices().audio.play('ui_click');
      this.d.onPick(level);
    };
    tileHandlers.set(level, pick);
    tileObjs.set(level, bg);
    bg.setInteractive({ useHandCursor: unlocked });
    bg.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.92, duration: 70 }));
    bg.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 120 }));
    bg.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 140, ease: 'Back.easeOut' });
      pick();
    });
  }
}

