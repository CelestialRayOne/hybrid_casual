// Top HUD: level-select / perks / settings buttons, level title (with the boss and hard badges), moves, depth
// meter, the relic goal slots (found / goal, plus bonus slots as extra relics are found) and the boons row (icons
// with stack counts; tap one for a one-line tooltip).
import Phaser from 'phaser';
import { BOON_IDS } from '../../core';
import type { BoonId, LevelState } from '../../core';
import * as K from '../art/keys';
import { UI } from '../art/palette';
import type { ArtMetrics } from '../art/textures';
import type { Layout, Rect } from '../layout';
import { BOONS, STRINGS } from '../strings';
import { Button, addPanel, addText, fitText, fontSizes } from '../ui/widgets';

const A = K.ART_ATLAS;

export interface HudCallbacks {
  onLevels: () => void;
  onPerks: () => void;
  onSettings: () => void;
  onDebug: (() => void) | null;
  /** A boon icon was tapped (the scene plays a click). */
  onBoonTap?: (boon: BoonId) => void;
}

interface RelicSlot {
  bg: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image | null;
}

interface BoonIcon {
  boon: BoonId;
  icon: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  stacks: number;
}

export class Hud {
  private movesText!: Phaser.GameObjects.Text;
  private movesIcon!: Phaser.GameObjects.Image;
  private depthText!: Phaser.GameObjects.Text;
  private depthIcon!: Phaser.GameObjects.Image;
  private titleText!: Phaser.GameObjects.Text;
  private perksBtn!: Button;
  private pointBubble: Phaser.GameObjects.Container | null = null;
  private relicSlots: RelicSlot[] = [];
  private found: number[] = [];
  /** Relic flights on their way to a slot (their slots exist already). */
  private pending = 0;
  private goal = 1;
  private boonIcons = new Map<BoonId, BoonIcon>();
  private boonOrder: BoonId[] = [];
  private tip: Phaser.GameObjects.Container | null = null;
  private tipTimer: Phaser.Time.TimerEvent | null = null;
  private shownDepth = 0;
  private lowMovesTween: Phaser.Tweens.Tween | null = null;
  private readonly f: ReturnType<typeof fontSizes>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    /** Layer drawn above the board (tooltips). */
    private readonly topLayer: Phaser.GameObjects.Layer,
    private readonly layout: Layout,
    private readonly m: ArtMetrics,
    private readonly cb: HudCallbacks,
  ) {
    this.f = fontSizes(layout.cell);
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.add(o);
    return o;
  }

  build(state: LevelState, found: readonly number[], boons: Readonly<Record<BoonId, number>>, perkPoints: number, perksOff: boolean): void {
    const L = this.layout;
    const c = L.cell;
    const ctr = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

    // HUD panel (stats + relics).
    this.add(addPanel(this.scene, ctr(L.hudPanel).x, ctr(L.hudPanel).y, L.hudPanel.w, L.hudPanel.h, this.m, K.PANEL_DARK));

    // Buttons.
    const btn = (r: Rect, icon: string, onClick: () => void, id: string) => {
      const p = ctr(r);
      return this.add(new Button(this.scene, this.m, { x: p.x, y: p.y, w: r.w, h: r.h, icon, kind: 'icon', onClick, id }));
    };
    btn(L.levelsBtn, K.ICON_LEVELS, this.cb.onLevels, 'hud.levels');
    this.perksBtn = btn(L.perksBtn, K.PERK_POINT, this.cb.onPerks, 'hud.perks');
    btn(L.settingsBtn, K.ICON_SETTINGS, this.cb.onSettings, 'hud.settings');
    if (this.cb.onDebug) {
      const db = ctr(L.debugBtn);
      const b = this.add(new Button(this.scene, this.m, { x: db.x, y: db.y, w: L.debugBtn.w, h: L.debugBtn.h, label: 'DBG', kind: 'secondary', fontPx: this.f.small, onClick: this.cb.onDebug, id: 'hud.debug' }));
      b.setAlpha(0.8);
    }
    this.setPerkPoints(perkPoints, false);

    // Title with badges.
    const tc = ctr(L.title);
    const def = state.def;
    const badgeS = Math.min(L.title.h * 0.92, c * 0.95);
    this.titleText = this.add(addText(this.scene, tc.x, tc.y, STRINGS.level(def.id), this.f.title, { color: def.boss ? '#fff0c0' : UI.textLight }).setOrigin(0.5));
    const room = L.title.w - (def.boss ? badgeS : 0) - (def.hard ? badgeS * 0.8 : 0);
    fitText(this.titleText, room);
    const tw = this.titleText.width + (def.boss ? badgeS * 1.05 : 0) + (def.hard ? badgeS * 0.75 : 0);
    let x = tc.x - tw / 2;
    if (def.boss) {
      const b = this.add(this.scene.add.image(x + badgeS * 0.45, tc.y, A, K.BADGE_BOSS).setDisplaySize(badgeS, badgeS));
      this.scene.tweens.add({ targets: b, angle: { from: -4, to: 4 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      x += badgeS * 1.05;
    }
    this.titleText.setX(x + this.titleText.width / 2);
    x += this.titleText.width;
    if (def.hard) this.add(this.scene.add.image(x + badgeS * 0.42, tc.y, A, K.BADGE_HARD).setDisplaySize(badgeS * 0.72, badgeS * 0.72));
    if (perksOff) {
      this.add(addText(this.scene, tc.x, tc.y + this.f.title * 0.85, STRINGS.debugPerksOff, this.f.small, { color: '#ffb4a8' }).setOrigin(0.5));
    }

    // Moves.
    const iconS = c * 0.7;
    const mv = L.moves;
    const wide = L.mode === 'wide';
    const statY = (r: Rect) => r.y + r.h / 2;
    this.movesIcon = this.add(this.scene.add.image(mv.x + iconS * 0.55, statY(mv), A, K.ICON_MOVES).setDisplaySize(iconS, iconS));
    this.movesText = this.add(addText(this.scene, mv.x + iconS * 1.12, statY(mv), '', this.f.stat).setOrigin(0, 0.5));
    // Depth.
    const dp = L.depth;
    const dx = wide ? dp.x + iconS * 0.55 : dp.x + dp.w - iconS * 0.55;
    this.depthIcon = this.add(this.scene.add.image(dx, statY(dp), A, K.ICON_DEPTH).setDisplaySize(iconS * 0.95, iconS * 0.95));
    this.depthText = this.add(addText(this.scene, wide ? dx + iconS * 0.62 : dx - iconS * 0.62, statY(dp), '', this.f.stat * 0.92).setOrigin(wide ? 0 : 1, 0.5));

    // Relic slots and boons.
    this.goal = state.goal;
    this.found = [...found];
    this.pending = 0;
    this.relicSlots = [];
    this.layoutRelics(false);
    this.boonIcons.clear();
    this.boonOrder = BOON_IDS.filter((b) => (boons[b] ?? 0) > 0);
    this.layoutBoons(boons);

    this.setMoves(state.movesLeft, false);
    this.shownDepth = state.scroll;
    this.depthText.setText(STRINGS.depthValue(state.scroll));
  }

  // ---- relic slots ------------------------------------------------------------------------------------------

  private slotCount(): number {
    return Math.max(this.goal, this.found.length + this.pending);
  }

  private slotGeom(i: number, n: number): { x: number; y: number; size: number } {
    const rel = this.layout.relics;
    const size = Math.min(rel.h * 0.78, (rel.w / Math.max(1, n)) * 0.92, this.layout.cell * 0.95);
    const gap = Math.min(size * 0.1, (rel.w - n * size) / Math.max(1, n - 1));
    const total = n * size + (n - 1) * gap;
    return { x: rel.x + rel.w / 2 - total / 2 + size / 2 + i * (size + gap), y: rel.y + rel.h / 2, size };
  }

  private layoutRelics(animate: boolean): void {
    const n = this.slotCount();
    const fresh = new Set<RelicSlot>();
    while (this.relicSlots.length < n) {
      const i = this.relicSlots.length;
      const bg = this.add(this.scene.add.image(0, 0, A, i >= this.goal ? K.RELIC_SLOT_BONUS : K.RELIC_SLOT_EMPTY));
      const slot = { bg, icon: null };
      fresh.add(slot);
      this.relicSlots.push(slot);
    }
    this.relicSlots.forEach((s, i) => {
      const g = this.slotGeom(i, n);
      if (animate && !fresh.has(s)) this.scene.tweens.add({ targets: s.bg, x: g.x, y: g.y, displayWidth: g.size, displayHeight: g.size, duration: 220, ease: 'Cubic.easeOut' });
      else s.bg.setPosition(g.x, g.y).setDisplaySize(g.size, g.size);
      const v = this.found[i];
      if (v !== undefined) {
        s.icon ??= this.add(this.scene.add.image(g.x, g.y, A, K.relicKey(v)));
        s.icon.setFrame(K.relicKey(v));
        if (animate) this.scene.tweens.add({ targets: s.icon, x: g.x, y: g.y, displayWidth: g.size * 0.84, displayHeight: g.size * 0.84, duration: 220 });
        else s.icon.setPosition(g.x, g.y).setDisplaySize(g.size * 0.84, g.size * 0.84);
      }
    });
  }

  /**
   * Where the NEXT relic lands (its slot is created first if this relic is a bonus beyond the goal).
   * `size` = displayed icon size.
   */
  relicTarget(): { x: number; y: number; size: number } {
    const i = this.found.length + this.pending;
    this.pending++;
    if (i >= this.relicSlots.length) {
      this.layoutRelics(true);
      const s = this.relicSlots[i];
      if (s) {
        const full = s.bg.scale;
        s.bg.setScale(0);
        this.scene.tweens.add({ targets: s.bg, scale: full, duration: 260, ease: 'Back.easeOut' });
      }
    }
    const g = this.slotGeom(i, this.slotCount());
    return { x: g.x, y: g.y, size: g.size * 0.84 };
  }

  /** A relic landed: fills the next slot with a pop. */
  addRelic(variant: number): void {
    const i = this.found.length;
    this.pending = Math.max(0, this.pending - 1);
    this.found.push(variant);
    this.layoutRelics(false);
    const s = this.relicSlots[i];
    if (!s?.icon) return;
    const base = s.icon.displayWidth;
    s.icon.setDisplaySize(base * 1.7, base * 1.7);
    this.scene.tweens.add({ targets: s.icon, displayWidth: base, displayHeight: base, duration: 380, ease: 'Back.easeOut' });
    const ss = s.bg.displayWidth;
    this.scene.tweens.add({ targets: s.bg, displayWidth: ss * 1.18, displayHeight: ss * 1.18, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ---- boons -------------------------------------------------------------------------------------------------

  private boonGeom(i: number, n: number): { x: number; y: number; size: number } {
    const r = this.layout.boons;
    const c = this.layout.cell;
    if (this.layout.mode === 'wide') {
      const cols = 3;
      const size = Math.min(c * 0.68, r.w / cols * 0.7, r.h / 2 * 0.78);
      const cw = r.w / cols;
      return { x: r.x + cw * ((i % cols) + 0.5), y: r.y + (r.h / 2) * (Math.floor(i / cols) + 0.5), size };
    }
    const size = Math.min(c * 0.7, r.h * 0.86);
    const step = Math.min(c * 1.3, r.w / Math.max(1, n));
    return { x: r.x + r.w / 2 + (i - (n - 1) / 2) * step, y: r.y + r.h / 2, size };
  }

  private layoutBoons(stacks: Readonly<Record<BoonId, number>>): void {
    const n = this.boonOrder.length;
    this.boonOrder.forEach((b, i) => {
      const g = this.boonGeom(i, n);
      let bi = this.boonIcons.get(b);
      if (!bi) {
        const icon = this.add(this.scene.add.image(g.x, g.y, A, K.boonKey(BOON_IDS.indexOf(b))));
        const bubble = this.add(this.scene.add.image(0, 0, A, K.BOON_STACK_BUBBLE));
        const count = this.add(addText(this.scene, 0, 0, '', this.f.small * 0.9).setOrigin(0.5, 0.52));
        const zone = this.add(this.scene.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }));
        zone.on('pointerup', (p: Phaser.Input.Pointer) => {
          if (!p.wasCanceled) this.showTip(b);
        });
        bi = { boon: b, icon, bubble, count, zone, stacks: 0 };
        this.boonIcons.set(b, bi);
      }
      bi.icon.setPosition(g.x, g.y).setDisplaySize(g.size, g.size);
      const bs = g.size * 0.55;
      bi.bubble.setPosition(g.x + g.size * 0.4, g.y - g.size * 0.36).setDisplaySize(bs, bs);
      bi.count.setPosition(bi.bubble.x, bi.bubble.y).setFontSize(Math.max(9, Math.round(bs * 0.62)));
      this.setStacks(bi, stacks[b] ?? 0);
      // Generous hit area: the boon's share of the row, from the HUD panel down to the board frame.
      const L = this.layout;
      const w = L.mode === 'wide' ? L.boons.w / 3 : Math.min(L.cell * 1.3, L.boons.w / Math.max(1, n));
      const top = L.mode === 'wide' ? g.y - L.boons.h / 4 : L.hudPanel.y + L.hudPanel.h - L.cell * 0.15;
      const bottom = L.mode === 'wide' ? g.y + L.boons.h / 4 : L.frame.y + L.cell * 0.2;
      bi.zone.setPosition(g.x - w / 2, top).setOrigin(0).setSize(w, bottom - top);
      bi.zone.input?.hitArea.setTo(0, 0, w, bottom - top);
    });
  }

  private setStacks(bi: BoonIcon, n: number): void {
    bi.stacks = n;
    const show = n > 1;
    bi.bubble.setVisible(show);
    bi.count.setVisible(show).setText(String(n));
  }

  /** Where a boon's icon sits (or will sit, once added). */
  boonCenter(boon: BoonId): { x: number; y: number; size: number } {
    const i = this.boonOrder.includes(boon) ? this.boonOrder.indexOf(boon) : this.boonOrder.length;
    const n = Math.max(this.boonOrder.length, i + 1);
    return this.boonGeom(i, n);
  }

  /** A boon was gained: adds or bumps its icon with a pop. */
  gainBoon(boon: BoonId, stacks: number): void {
    const isNew = !this.boonOrder.includes(boon);
    if (isNew) this.boonOrder.push(boon);
    const all: Partial<Record<BoonId, number>> = {};
    for (const [b, bi] of this.boonIcons) all[b] = bi.stacks;
    all[boon] = stacks;
    this.layoutBoons(all as Record<BoonId, number>);
    const bi = this.boonIcons.get(boon);
    if (!bi) return;
    const s = bi.icon.scale;
    bi.icon.setScale(s * (isNew ? 0.2 : 1.5));
    this.scene.tweens.add({ targets: bi.icon, scale: s, duration: 420, ease: 'Back.easeOut' });
    if (stacks > 1) {
      const bs = bi.bubble.scale;
      bi.bubble.setScale(bs * 1.8);
      this.scene.tweens.add({ targets: bi.bubble, scale: bs, duration: 300, ease: 'Back.easeOut' });
    }
  }

  private showTip(boon: BoonId): void {
    const bi = this.boonIcons.get(boon);
    if (!bi) return;
    this.cb.onBoonTap?.(boon);
    this.hideTip();
    const L = this.layout;
    const c = L.cell;
    const info = BOONS[boon];
    const stack = bi.stacks > 1 ? ` (x${bi.stacks})` : '';
    const maxW = Math.min(L.play.w * 0.92, c * 7.6);
    const t = addText(this.scene, 0, 0, `${info.name}${stack}: ${info.tip}`, this.f.body, { wrap: maxW - c * 0.6 }).setOrigin(0.5);
    const w = Math.min(maxW, t.width + c * 0.6);
    const h = t.height + c * 0.36;
    const x = Phaser.Math.Clamp(bi.icon.x, L.play.x + w / 2, L.play.x + L.play.w - w / 2);
    const y = bi.icon.y + bi.icon.displayHeight / 2 + c * 0.2 + h / 2;
    const bg = addPanel(this.scene, 0, 0, w, h, this.m, K.PANEL_DARK).setAlpha(0.96);
    const cont = this.scene.add.container(x, y, [bg, t]);
    this.topLayer.add(cont);
    cont.setScale(0.7).setAlpha(0);
    this.scene.tweens.add({ targets: cont, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    this.tip = cont;
    this.tipTimer = this.scene.time.delayedCall(2600, () => this.hideTip());
  }

  hideTip(): void {
    this.tipTimer?.remove(false);
    this.tipTimer = null;
    this.tip?.destroy();
    this.tip = null;
  }

  get tipOpen(): boolean {
    return this.tip !== null;
  }

  // ---- stats ---------------------------------------------------------------------------------------------------

  setPerkPoints(n: number, pop: boolean): void {
    this.pointBubble?.destroy();
    this.pointBubble = null;
    if (n <= 0) return;
    const r = this.layout.perksBtn;
    const s = r.w * 0.42;
    const bx = r.x + r.w - s * 0.3;
    const by = r.y + s * 0.3;
    const bubble = this.scene.add.image(0, 0, A, K.BOON_STACK_BUBBLE).setDisplaySize(s, s);
    const t = addText(this.scene, 0, 0, String(n), s * 0.6).setOrigin(0.5, 0.52);
    this.pointBubble = this.add(this.scene.add.container(bx, by, [bubble, t]));
    this.scene.tweens.add({ targets: this.perksBtn, angle: { from: -5, to: 5 }, duration: 160, yoyo: true, repeat: pop ? 3 : 1, onComplete: () => this.perksBtn.setAngle(0) });
    this.scene.tweens.add({ targets: this.pointBubble, scale: 1.18, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  setMoves(moves: number | null, bump: boolean): void {
    this.movesText.setText(moves === null ? STRINGS.infinite : String(moves));
    const low = moves !== null && moves <= 3;
    this.movesText.setColor(low ? '#ffb0a0' : UI.textLight);
    if (low && !this.lowMovesTween) {
      this.lowMovesTween = this.scene.tweens.add({ targets: this.movesIcon, angle: { from: -12, to: 12 }, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!low && this.lowMovesTween) {
      this.lowMovesTween.stop();
      this.lowMovesTween = null;
      this.movesIcon.setAngle(0);
    }
    if (bump) this.punch(this.movesText, 1.25);
  }

  /** Depth meter ticks up row by row over `ms`. */
  tickDepth(to: number, ms: number): void {
    const from = this.shownDepth;
    this.shownDepth = to;
    if (to === from) return;
    const counter = { v: from };
    let last = from;
    this.scene.tweens.add({
      targets: counter,
      v: to,
      duration: ms,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const v = Math.round(counter.v);
        if (v !== last) {
          last = v;
          this.depthText.setText(STRINGS.depthValue(v));
          this.punch(this.depthText, 1.15);
        }
      },
      onComplete: () => this.depthText.setText(STRINGS.depthValue(to)),
    });
    this.scene.tweens.add({ targets: this.depthIcon, y: this.depthIcon.y + this.layout.cell * 0.08, duration: 90, yoyo: true, repeat: Math.max(0, to - from - 1) });
  }

  movesCenter(): { x: number; y: number } {
    return { x: this.movesText.x + this.movesText.width / 2, y: this.movesText.y };
  }

  private punch(t: Phaser.GameObjects.Text, k: number): void {
    this.scene.tweens.killTweensOf(t);
    t.setScale(k);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }
}
