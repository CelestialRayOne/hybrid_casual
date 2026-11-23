// The game screen: board, HUD and power tray. Turns input into core actions and plays the returned events as a
// timeline (see timeline.ts). Overlays (level end, perk offer, perks screen, level select, settings, debug) are
// separate scenes launched on top; while one is open this scene ignores input and reports gameplayStop.
//
// Powers: tap a tray token to arm it (free), tap it again to disarm. While armed, a reticle follows the pointer over
// the board (on touch: it appears on press and follows the finger) with the power's area shaded; releasing on a cell
// fires the power there. Every attempt (start, retry, level change) uses a fresh attempt seed, so gem colours, bonus
// relics, relic types and geodes re-roll.
import Phaser from 'phaser';
import {
  BOON_IDS, COLUMNS, VISIBLE_ROWS, armPower, chargeLevel, disarmPower, createLevelState, findGroup, getLevel, grantPendingPerkPoints,
  listGroups, powerThreshold, relicCells, stars, suggestAction, tap, transmute, useContinue,
} from '../../core';
import type { BoonId, CoreEvent, LevelState, PerkId, Pos } from '../../core';
import { TELEMETRY_EVENTS as EV } from '../../telemetry';
import * as K from '../art/keys';
import { GEM, hexToInt } from '../art/palette';
import { drawStrataBackground } from '../art/textures';
import type { ArtMetrics } from '../art/textures';
import { LONG_PRESS_MS, LONG_PRESS_RING_DELAY_MS } from '../config';
import { type Layout, cellAt } from '../layout';
import { previewPower } from '../powerPreview';
import {
  applyTokens, applyWin, currentLevel, markTutorialSeen, nextLevelAfter, perkOffer, pointEarned, samePerks, starsFor,
  tutorialSeen,
} from '../progress';
import { ctx, getServices } from '../services';
import { BOONS, POWER_NAMES, STRINGS } from '../strings';
import { type Plan, type PlannedStep, type PowerEvent, TIMING, planTimeline, powerTiming, scrollDuration } from '../timeline';
import { currentLayout, onResize } from '../ui/screen';
import { addPanel, addText, ensureArt, fontSizes } from '../ui/widgets';
import { BoardView } from '../view/BoardView';
import { Fx } from '../view/Fx';
import { Hud } from '../view/Hud';
import { PowerFx } from '../view/PowerFx';
import { TrayView } from '../view/TrayView';
import { type HintSpec, TutorialHint } from '../view/TutorialHint';

const A = K.ART_ATLAS;

export interface PlayData {
  level?: number;
}

interface Press {
  pointerId: number;
  cell: Pos;
  group: Pos[];
  on: boolean;
  downAt: number;
  canTransmute: boolean;
  consumed: boolean;
  /** Pressed while a power was armed: the release cell fires it. */
  armed: boolean;
}

interface TrayPress {
  pointerId: number;
  slot: number;
}

type TutStep = 'tap' | 'dirt' | 'charge' | 'use' | 'bedrock';

let firstPlay = true;
/** The backdrop changes one band per this many rows of depth. */
const BG_BAND_ROWS = 6;
/** The backdrop texture currently painted (size and band); the texture is global and survives scene restarts. */
let paintedBackground = '';
/** Background repaint after a band change: wait for this much stillness, retry while the player is acting. */
const BG_IDLE_MS = 650;
const BG_RETRY_MS = 400;
/** Board presses are ignored this long after a level starts (see onBoardDown). */
const START_GUARD_MS = 350;
/** A fresh attempt seed: the clock mixed with randomness (retry = new seed = new gems). */
const newAttemptSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 32)) >>> 0;

/** Primary button: any touch or pen contact, or the left mouse button. */
function isPrimary(p: Phaser.Input.Pointer): boolean {
  return p.wasTouch || p.button === 0;
}

export class PlayScene extends Phaser.Scene {
  static readonly KEY = 'Play';
  state!: LevelState;
  level = 1;
  private layout!: Layout;
  private m!: ArtMetrics;

  private bgLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private boardLayer!: Phaser.GameObjects.Layer;
  private fxLayer!: Phaser.GameObjects.Layer;
  private boardCam!: Phaser.Cameras.Scene2D.Camera;
  private fxCam!: Phaser.Cameras.Scene2D.Camera;

  private board!: BoardView;
  private hud!: Hud;
  private tray!: TrayView;
  private fx!: Fx;
  private powerFx!: PowerFx;
  private hint!: TutorialHint;
  private bubble: Phaser.GameObjects.Container | null = null;
  private ring!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Image;
  private preview!: Phaser.GameObjects.Graphics;
  private reticleCell: Pos | null = null;
  private armedHint: Phaser.GameObjects.Container | null = null;

  busy = false;
  overlay: string | null = null;
  private timers: Phaser.Time.TimerEvent[] = [];
  private flights = 0;
  private trayFlights = 0;
  private flightWaiters: (() => void)[] = [];
  private press: Press | null = null;
  private trayPress: TrayPress | null = null;
  private heldPointer: number | null = null;
  private queuedTap: Pos | null = null;
  private endHandled = false;
  /** Set once the scene is restarting for another level: ignores repeated Next / Retry / level presses. */
  private leaving = false;
  private startedAt = 0;
  private attemptSeed = 0;
  /** Stars of the win, recorded as soon as the core reports it (before the end card opens). */
  private winStars: 1 | 2 | 3 = 1;
  /** The win earned a perk point (offer the perk cards after the win card). */
  private winPoint = false;
  private bgBand = -1;
  private bgTimer: Phaser.Time.TimerEvent | null = null;
  private geodeTimer: Phaser.Time.TimerEvent | null = null;
  private tuts: TutStep[] = [];
  private lastClear: Pos[] | null = null;
  /** Screen position of the last relic revealed (boon consequences fly from there). */
  private lastRelicAt: { x: number; y: number } | null = null;
  /** Relic variants in the order they were collected (the HUD slots). */
  private foundOrder: number[] = [];
  /** Moves shown in the HUD (bonus moves are added when their animation lands). */
  private shownMoves: number | null = null;
  private bannerQueue: (() => void)[] = [];
  private bannerBusy = false;
  private toastObjs: Phaser.GameObjects.GameObject[] = [];
  /** Cell kinds before the current action (power animations need what WAS there). */
  private kindsBefore: string[][] = [];
  /** The level-end card, reopened if the player peeks at another overlay (e.g. level select) and closes it. */
  private endCard: { key: string; data: Record<string, unknown> } | null = null;
  /** Perks when this attempt started (a change on the perks screen mid-level applies from the next attempt). */
  private attemptPerks: PerkId[] = [];
  /** Recent frame times during power animations (perf telemetry for the test hook). */
  private fxFrames: number[] = [];
  private fxActiveUntil = 0;
  /** Scene time until which the boss intro banner is on screen. */
  private bossIntroUntil = 0;

  constructor() {
    super(PlayScene.KEY);
  }

  init(data: PlayData): void {
    this.level = data.level ?? currentLevel(ctx().progress);
  }

  create(): void {
    const c = ctx();
    const sv = getServices();
    this.busy = false;
    this.overlay = null;
    this.timers = [];
    this.flights = 0;
    this.trayFlights = 0;
    this.flightWaiters = [];
    this.press = null;
    this.trayPress = null;
    this.queuedTap = null;
    this.heldPointer = null;
    this.endHandled = false;
    this.leaving = false;
    this.winPoint = false;
    this.startedAt = this.time.now;
    this.endCard = null;
    this.bgBand = -1;
    this.bgTimer = null;
    this.bannerQueue = [];
    this.bannerBusy = false;
    this.reticleCell = null;
    this.armedHint = null;
    this.foundOrder = [];
    this.lastRelicAt = null;
    this.fxFrames = [];
    this.fxActiveUntil = 0;
    this.bossIntroUntil = 0;
    this.tweens.timeScale = 1;
    // Pending perk points (e.g. the page closed on a win card) are granted silently; the HUD perks button shows them.
    const granted = grantPendingPerkPoints(c.progress);
    if (granted !== c.progress) c.setProgress(granted);
    this.attemptSeed = newAttemptSeed();
    this.attemptPerks = [...c.activePerks()];
    this.state = createLevelState(getLevel(this.level), c.activePerks(), this.attemptSeed);
    this.shownMoves = this.state.movesLeft;
    this.tuts = this.initialTutorials();

    this.boardCam = this.cameras.add(0, 0, 1, 1, false, 'board');
    this.fxCam = this.cameras.add(0, 0, 1, 1, false, 'fx');
    this.buildView();

    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('pointerdown', this.onScenePointerDown, this);
    if (sv.flags.debug) this.bindDebugKeys();
    onResize(this, () => this.rebuild());
    // Leaving the page mid-level (reload, tab close) counts as quitting it.
    const logQuit = () => this.logQuit();
    c.onPageHide = logQuit;
    this.geodeTimer = this.time.addEvent({ delay: 650, loop: true, callback: () => this.twinkleGeode() });
    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.input.off('pointerupoutside', this.onPointerUp, this);
      this.input.off('pointerdown', this.onScenePointerDown, this);
      this.geodeTimer?.remove(false);
      this.board?.destroy();
      this.fx?.destroy();
      if (c.onPageHide === logQuit) c.onPageHide = null;
    });

    const def = this.state.def;
    sv.telemetry.log(EV.levelStart, { level: this.level, boss: def.boss || undefined, perks: c.activePerks(), seed: this.attemptSeed });
    for (const cam of [this.cameras.main, this.boardCam, this.fxCam]) cam.fadeIn(220, 58, 36, 24);
    if (def.boss) this.bossIntro();
    else this.intro();
    this.setInPlay(true);
    if (firstPlay) {
      firstPlay = false;
      sv.platform.loadingStop();
    }
    this.time.delayedCall(def.boss ? 1900 : 1250, () => this.updateTutorial());
  }

  /** Logs level_quit when the level is left while still in progress. */
  private logQuit(): void {
    if (this.state.status === 'playing' && !this.endHandled && !this.leaving) {
      getServices().telemetry.log(EV.levelQuit, { level: this.level, boss: this.state.def.boss || undefined, movesUsed: this.state.movesUsed });
    }
  }

  // ---- view construction ---------------------------------------------------------------------------------

  private buildView(): void {
    this.layout = currentLayout(this);
    this.m = ensureArt(this, this.layout);
    const L = this.layout;
    // Old effects may still have delayed bursts queued (pop ripple, power choreography); they become no-ops.
    this.fx?.destroy();
    for (const l of [this.bgLayer, this.uiLayer, this.boardLayer, this.fxLayer]) l?.destroy();
    this.bubble = null;
    this.toastObjs = [];
    this.armedHint = null;
    this.bgLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    this.boardLayer = this.add.layer();
    this.fxLayer = this.add.layer();
    const main = this.cameras.main;
    main.setViewport(0, 0, L.width, L.height);
    this.boardCam.setViewport(L.board.x, L.board.y, L.board.w, L.board.h);
    this.fxCam.setViewport(0, 0, L.width, L.height);
    main.ignore([this.boardLayer, this.fxLayer]);
    this.boardCam.ignore([this.bgLayer, this.uiLayer, this.fxLayer]);
    this.fxCam.ignore([this.bgLayer, this.uiLayer, this.boardLayer]);

    // Background (repainted only when the size or the depth band changes; the texture outlives scene restarts).
    this.bgBand = this.depthBand();
    this.paintBackground();
    this.bgLayer.add(this.add.image(0, 0, K.BACKGROUND).setOrigin(0));

    // Board frame.
    const fr = L.frame;
    this.uiLayer.add(addPanel(this, fr.x + fr.w / 2, fr.y + fr.h / 2, fr.w, fr.h, this.m, K.BOARD_FRAME));

    const cams = [main, this.boardCam, this.fxCam];
    this.fx = new Fx(this, this.fxLayer, L.cell, this.m, cams);
    const sv = getServices();
    this.hud = new Hud(this, this.uiLayer, this.fxLayer, L, this.m, {
      onLevels: () => this.openLevelSelect(),
      onPerks: () => this.openPerks(),
      onSettings: () => this.openSettings(),
      onDebug: sv.flags.debug ? () => this.openOverlay('Debug', {}) : null,
      onBoonTap: () => sv.audio.play('ui_click', { volume: 0.6 }),
    });
    this.hud.build(this.state, this.foundOrder, this.state.boons, ctx().progress.perkPoints, ctx().perksOff);
    this.hud.setMoves(this.shownMoves, false);
    this.tray = new TrayView(this, this.uiLayer, L, this.m);
    this.tray.build(this.state.rules.trayCapacity);
    this.tray.render(this.state.tray, this.state.armed);
    this.board = new BoardView(this, this.boardLayer, this.uiLayer, this.boardCam, L, this.m, this.fx);
    this.board.build(this.state);
    this.board.updatePeek(this.state);
    this.powerFx = new PowerFx(this, this.fx, this.board, L, sv.audio, (ms, fn) => this.after(ms, fn));
    this.powerFx.kindOf = (p) => this.kindsBefore[p.y]?.[p.x] ?? 'empty';
    this.hint = new TutorialHint(this, this.fxLayer, L, this.m);
    this.preview = this.add.graphics();
    this.fxLayer.add(this.preview);
    this.reticle = this.add.image(0, 0, A, K.POWER_RETICLE).setVisible(false);
    this.reticle.setDisplaySize(L.cell * 1.4, L.cell * 1.4);
    this.fxLayer.add(this.reticle);
    this.tweens.add({ targets: this.reticle, angle: 360, duration: 6000, repeat: -1 });
    this.ring = this.add.graphics();
    this.fxLayer.add(this.ring);

    // The single input zone over the board.
    const zone = this.add.zone(L.board.x, L.board.y, L.board.w, L.board.h).setOrigin(0).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onBoardDown(p));
    this.uiLayer.add(zone);
    this.refreshArmed();
  }

  /** Full rebuild after a resize: finishes any running animation instantly, then redraws from state. */
  private rebuild(): void {
    this.cancelTimeline();
    this.cancelPress();
    this.hint.hide();
    this.hud.hideTip();
    this.flights = 0;
    this.trayFlights = 0;
    this.bannerQueue = [];
    this.bannerBusy = false;
    this.shownMoves = this.state.movesLeft;
    this.tweens.killAll();
    this.tweens.timeScale = 1;
    this.buildView();
    const waiters = this.flightWaiters;
    this.flightWaiters = [];
    if (this.busy) {
      this.busy = false;
      this.settle();
    } else {
      for (const w of waiters) w();
      this.updateTutorial();
    }
  }

  /**
   * The backdrop deepens one band every few rows. Repainting it is a 30-50 ms canvas paint plus a full-screen
   * texture upload, so it waits until the board has been still for a moment instead of hitching right after a
   * scroll (measured: 30-40 ms frames on desktop Chromium, more on mid phones).
   */
  private scheduleBackground(): void {
    if (this.depthBand() === this.bgBand || this.bgTimer) return;
    const attempt = () => {
      this.bgTimer = null;
      if (this.depthBand() === this.bgBand) return;
      if (this.busy || this.press || this.trayPress || this.flights > 0) {
        this.bgTimer = this.time.delayedCall(BG_RETRY_MS, attempt);
        return;
      }
      this.bgBand = this.depthBand();
      this.paintBackground();
    };
    this.bgTimer = this.time.delayedCall(BG_IDLE_MS, attempt);
  }

  /** Paints the backdrop for the current band (quantised, so consecutive levels in a band reuse it). */
  private paintBackground(): void {
    const L = this.layout;
    const key = `${L.width}x${L.height}@${L.cell}#${this.bgBand}`;
    if (key === paintedBackground && this.textures.exists(K.BACKGROUND)) return;
    paintedBackground = key;
    drawStrataBackground(this, L.width, L.height, this.bgBand * BG_BAND_ROWS, L.cell);
  }

  private depthRows(): number {
    return (this.level - 1) * 2.5 + (this.state?.scroll ?? 0);
  }

  private depthBand(): number {
    return Math.floor(this.depthRows() / BG_BAND_ROWS);
  }

  private intro(): void {
    const L = this.layout;
    const f = fontSizes(L.cell);
    getServices().audio.play('level_start');
    const cx = L.board.x + L.board.w / 2;
    const cy = L.board.y + L.board.h * 0.42;
    const t = addText(this, cx, cy, STRINGS.level(this.level), f.hero * 1.2).setOrigin(0.5).setScale(0.4).setAlpha(0);
    this.fxLayer.add(t);
    const sub = this.state.def.hard ? addText(this, cx, cy + f.hero, STRINGS.hard, f.title, { color: '#ffb4a8' }).setOrigin(0.5).setAlpha(0) : null;
    if (sub) this.fxLayer.add(sub);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    if (sub) this.tweens.add({ targets: sub, alpha: 1, duration: 280, delay: 120 });
    this.tweens.add({
      targets: sub ? [t, sub] : t,
      alpha: 0,
      y: `-=${L.cell * 0.6}`,
      delay: 950,
      duration: 360,
      ease: 'Quad.easeIn',
      onComplete: () => {
        t.destroy();
        sub?.destroy();
      },
    });
  }

  /** Boss levels: a big "BOSS LEVEL" ribbon, the boss crest slams in with a low rumble. Never blocks input. */
  private bossIntro(): void {
    const L = this.layout;
    const c = L.cell;
    const f = fontSizes(c);
    const audio = getServices().audio;
    audio.play('level_start', { pitch: -5 });
    this.bossIntroUntil = this.time.now + 2050;
    const cx = L.board.x + L.board.w / 2;
    const cy = L.board.y + L.board.h * 0.4;
    const k = c / this.m.cell;
    const bw = Math.min(L.width - c * 0.4, L.board.w * 1.08);
    const bh = this.m.bossBannerH * k * 1.05;
    const inset = this.m.bossBannerInset;
    const banner = this.add.nineslice(0, 0, A, K.BOSS_BANNER, bw / k, this.m.bossBannerH, inset, inset, 0, 0).setScale(k * 1.05);
    const title = addText(this, 0, -bh * 0.02, STRINGS.bossLevel, f.hero * 1.05, { color: '#fff3c4' }).setOrigin(0.5);
    if (title.width > bw * 0.66) title.setScale((bw * 0.66) / title.width);
    const sub = addText(this, 0, bh * 0.5 + f.title * 0.85, `${STRINGS.level(this.level)}  •  ${STRINGS.bossSub}`, f.label, { color: '#fff0d0' }).setOrigin(0.5);
    const subBg = addPanel(this, 0, sub.y, sub.width + c * 0.7, sub.height + c * 0.24, this.m, K.PANEL_DARK).setAlpha(0.92);
    const cont = this.add.container(cx, cy, [banner, title, subBg, sub]);
    const badgeS = c * 1.9;
    const badge = this.add.image(cx, cy - bh * 0.5 - badgeS * 0.32, A, K.BADGE_BOSS).setDisplaySize(badgeS, badgeS);
    const glow = this.add.image(badge.x, badge.y, A, K.GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0xc77dff).setAlpha(0);
    glow.setScale((c * 3.4) / this.m.glow);
    this.fxLayer.add([glow, cont, badge]);
    cont.setScale(0.2, 0.05).setAlpha(0);
    const bScale = badge.scale;
    badge.setScale(bScale * 3.2).setAlpha(0);
    this.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: badge,
      scale: bScale,
      alpha: 1,
      delay: 260,
      duration: 230,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.fx.shake(c * 0.16, 360);
        this.fx.rockBurst(badge.x, badge.y + badgeS * 0.3, 10);
        this.fx.dustBurst(badge.x, badge.y + badgeS * 0.3, 10, 'stone');
        this.fx.sparkBurst(badge.x, badge.y, 14, 0xd68bff);
        audio.play('bedrock_shatter', { pitch: -7, volume: 0.75 });
        this.tweens.add({ targets: glow, alpha: { from: 0.95, to: 0 }, scale: glow.scale * 2.2, duration: 700, ease: 'Quad.easeOut' });
      },
    });
    this.tweens.add({
      targets: [cont, badge],
      alpha: 0,
      y: `-=${c * 0.8}`,
      delay: 1650,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => {
        cont.destroy();
        badge.destroy();
        glow.destroy();
      },
    });
  }

  private toast(text: string, icon?: string, color?: string): void {
    for (const o of this.toastObjs) o.destroy();
    const L = this.layout;
    const f = fontSizes(L.cell);
    const t = addText(this, 0, 0, text, f.label, color ? { color, stroke: true } : {}).setOrigin(0.5);
    const iconS = icon ? L.cell * 0.62 : 0;
    const w = t.width + L.cell * 0.8 + (icon ? iconS + L.cell * 0.15 : 0);
    const h = Math.max(t.height, iconS) + L.cell * 0.32;
    const x = L.board.x + L.board.w / 2;
    const y = L.board.y + L.cell * 0.9;
    const bg = addPanel(this, 0, 0, w, h, this.m, K.PANEL_DARK).setAlpha(0.94);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    if (icon) {
      const img = this.add.image(-w / 2 + L.cell * 0.4 + iconS / 2, 0, A, icon).setDisplaySize(iconS, iconS);
      t.setX(img.x + iconS / 2 + L.cell * 0.15 + t.width / 2);
      parts.push(img);
    }
    parts.push(t);
    const cont = this.add.container(x, y, parts);
    this.fxLayer.add(cont);
    this.toastObjs = [cont];
    cont.setScale(0.6);
    this.tweens.add({ targets: cont, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: cont, alpha: 0, delay: 1400, duration: 300, onComplete: () => cont.destroy() });
  }

  // ---- input -------------------------------------------------------------------------------------------

  private canInteract(): boolean {
    return this.overlay === null && this.state.status === 'playing' && !this.endHandled;
  }

  private onScenePointerDown(p: Phaser.Input.Pointer): void {
    if (this.overlay) return;
    // Right (or middle) click never taps or fires anything; right click cancels an armed power.
    if (!isPrimary(p)) {
      if (p.button === 2) this.cancelArmed();
      return;
    }
    if (this.hud.tipOpen) this.hud.hideTip();
    const slot = this.tray.slotAt(p.x, p.y);
    if (slot === null || this.trayPress) return;
    this.trayPress = { pointerId: p.id, slot };
  }

  private onBoardDown(p: Phaser.Input.Pointer): void {
    if (!isPrimary(p) || !this.canInteract() || this.press) return;
    // The second tap of a quick double tap on Next / Retry must not land on the new board as a move.
    if (this.time.now - this.startedAt < START_GUARD_MS) return;
    if (this.busy) {
      this.heldPointer = p.id;
      return;
    }
    this.beginPress(p);
  }

  private beginPress(p: Phaser.Input.Pointer): void {
    const cell = cellAt(this.layout, p.x, p.y, this.state.scroll);
    if (!cell) return;
    this.hint.hide();
    if (this.state.armed !== null) {
      this.press = { pointerId: p.id, cell, group: [], on: true, downAt: this.time.now, canTransmute: false, consumed: false, armed: true };
      this.aimAt(cell);
      return;
    }
    const kind = this.state.grid[cell.y]?.[cell.x]?.kind;
    const group = kind === 'block' ? findGroup(this.state, cell) : [];
    const canTransmute = kind === 'block' && this.state.transmutesLeft > 0 && this.state.movesLeft !== 0;
    this.press = { pointerId: p.id, cell, group, on: true, downAt: this.time.now, canTransmute, consumed: false, armed: false };
    if (group.length >= 2) this.showGroup(group);
  }

  private showGroup(group: Pos[]): void {
    this.board.highlight(this.state, group);
    this.hideBubble();
    const L = this.layout;
    const c = L.cell;
    const top = this.board.groupTop(group);
    const f = fontSizes(c);
    const g0 = group[0] as Pos;
    const cell = this.state.grid[g0.y]?.[g0.x];
    const color = cell?.kind === 'block' ? cell.color : 0;
    const lvl = chargeLevel(this.state, group.length);
    const t = addText(this, 0, 0, String(group.length), f.stat * 0.9).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let w = Math.max(c * 0.78, t.width + c * 0.36);
    if (lvl !== null) {
      // This group charges a power: show its token and level next to the count.
      const tok = c * 0.62;
      const icon = this.add.image(0, 0, A, K.powerKey(color)).setDisplaySize(tok, tok);
      const lv = addText(this, 0, 0, `Lv${lvl}`, f.small, { color: '#ffe27a' }).setOrigin(0, 0.5);
      w = t.width + tok + lv.width + c * 0.62;
      t.setX(-w / 2 + c * 0.18 + t.width / 2);
      icon.setX(t.x + t.width / 2 + c * 0.1 + tok / 2);
      lv.setX(icon.x + tok / 2 + c * 0.06);
      t.setColor('#ffe27a');
      parts.push(icon, lv);
    }
    const bg = addPanel(this, 0, 0, w, c * 0.72, this.m, K.PANEL_DARK);
    const by = Math.max(L.board.y + c * 0.4, top.y - c * 0.82);
    const bx = Phaser.Math.Clamp(top.x, L.board.x + w / 2, L.board.x + L.board.w - w / 2);
    this.bubble = this.add.container(bx, by, [bg, t, ...parts]);
    this.fxLayer.add(this.bubble);
    this.bubble.setScale(0.5);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private hideBubble(): void {
    this.bubble?.destroy();
    this.bubble = null;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const pr = this.press;
    if (pr && p.id === pr.pointerId) {
      const cell = cellAt(this.layout, p.x, p.y, this.state.scroll);
      if (pr.armed) {
        pr.on = !!cell;
        if (cell) {
          pr.cell = cell;
          this.aimAt(cell);
        } else this.aimAt(null);
        return;
      }
      const inGroup = !!cell && (pr.group.length > 0 ? pr.group.some((g) => g.x === cell.x && g.y === cell.y) : cell.x === pr.cell.x && cell.y === pr.cell.y);
      if (inGroup !== pr.on) {
        pr.on = inGroup;
        if (!inGroup) {
          this.board.clearHighlight();
          this.hideBubble();
          pr.canTransmute = false;
          this.ring.clear();
        } else if (pr.group.length >= 2) {
          this.showGroup(pr.group);
        }
      }
      return;
    }
    // Mouse hover while armed: the reticle follows the pointer.
    if (!p.wasTouch && !this.press && this.state.armed !== null && this.canInteract() && !this.busy) {
      this.aimAt(cellAt(this.layout, p.x, p.y, this.state.scroll));
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    // Releasing a right/middle button (even mid left-press) never commits anything.
    if (!isPrimary(p)) return;
    if (this.heldPointer === p.id) this.heldPointer = null;
    // A touch the browser cancelled (system gesture, palm rejection) never commits a tap, power or button.
    const cancelled = p.wasCanceled;
    const pr = this.press;
    if (pr && p.id === pr.pointerId) {
      this.press = null;
      this.ring.clear();
      this.hideBubble();
      if (pr.armed) {
        const cell = cellAt(this.layout, p.x, p.y, this.state.scroll);
        if (p.wasTouch || !cell) this.aimAt(null);
        if (!cancelled && cell && this.state.armed !== null) this.commitTap(cell);
        else this.updateTutorial();
      } else if (cancelled) {
        this.board.clearHighlight();
        this.updateTutorial();
      } else if (!pr.consumed) {
        const cell = cellAt(this.layout, p.x, p.y, this.state.scroll);
        const same = pr.on && !!cell && (pr.group.length > 0 ? pr.group.some((g) => g.x === cell.x && g.y === cell.y) : cell.x === pr.cell.x && cell.y === pr.cell.y);
        if (!same || !this.commitTap(pr.cell)) {
          this.board.clearHighlight();
          this.updateTutorial();
        }
      }
    }
    const tp = this.trayPress;
    if (tp && p.id === tp.pointerId) {
      this.trayPress = null;
      if (!cancelled && this.tray.slotAt(p.x, p.y) === tp.slot) this.toggleArm(tp.slot);
    }
  }

  private cancelPress(): void {
    this.press = null;
    this.ring?.clear();
    this.hideBubble();
    this.board?.clearHighlight();
  }

  override update(time: number, delta: number): void {
    if (time < this.fxActiveUntil) {
      this.fxFrames.push(delta);
      if (this.fxFrames.length > 600) this.fxFrames.shift();
    }
    const pr = this.press;
    if (!pr || !pr.canTransmute || pr.consumed || !pr.on || this.busy) return;
    const held = this.time.now - pr.downAt;
    if (held < LONG_PRESS_RING_DELAY_MS) return;
    const t = Math.min(1, (held - LONG_PRESS_RING_DELAY_MS) / (LONG_PRESS_MS - LONG_PRESS_RING_DELAY_MS));
    const pos = this.board.screen(pr.cell.x, pr.cell.y);
    const r = this.layout.cell * 0.62;
    const g = this.ring;
    g.clear();
    g.lineStyle(Math.max(3, this.layout.cell * 0.1), 0x24130a, 0.6).strokeCircle(pos.x, pos.y, r);
    g.lineStyle(Math.max(3, this.layout.cell * 0.1), 0xd68bff, 1);
    g.beginPath();
    g.arc(pos.x, pos.y, r, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2, false);
    g.strokePath();
    if (t >= 1) {
      pr.consumed = true;
      g.clear();
      this.hideBubble();
      this.board.clearHighlight();
      this.doTransmute(pr.cell);
    }
  }

  // ---- armed power: reticle, preview, hint -----------------------------------------------------------------

  /** Shows the reticle and the power's area at `cell` (null hides them). */
  private aimAt(cell: Pos | null): void {
    const armed = this.state.armed;
    const p = armed !== null ? this.state.tray[armed] : undefined;
    if (!cell || !p) {
      this.reticleCell = null;
      this.reticle.setVisible(false);
      this.preview.clear();
      return;
    }
    const same = this.reticleCell && this.reticleCell.x === cell.x && this.reticleCell.y === cell.y;
    this.reticleCell = cell;
    const pos = this.board.screen(cell.x, cell.y);
    const tint = hexToInt(GEM[p.color]!.glow);
    if (!this.reticle.visible) {
      this.reticle.setVisible(true).setAlpha(1);
      const s = (this.layout.cell * 1.4) / this.m.reticle;
      this.reticle.setScale(s * 1.4);
      this.tweens.add({ targets: this.reticle, scale: s, duration: 140, ease: 'Back.easeOut' });
    }
    this.reticle.setPosition(pos.x, pos.y).setTint(tint);
    if (same) return;
    const pv = previewPower(this.state, cell);
    const g = this.preview;
    g.clear();
    if (!pv) return;
    const c = this.layout.cell;
    g.fillStyle(tint, 0.22);
    g.lineStyle(Math.max(1.5, c * 0.04), tint, 0.65);
    for (const q of pv.cells) {
      const s = this.board.screen(q.x, q.y);
      g.fillRect(s.x - c / 2 + 1, s.y - c / 2 + 1, c - 2, c - 2);
    }
    for (const q of pv.cells) {
      const s = this.board.screen(q.x, q.y);
      g.strokeRect(s.x - c / 2 + 2, s.y - c / 2 + 2, c - 4, c - 4);
    }
  }

  /** Syncs the armed visuals (tray ring, hint line, reticle) with the core state. */
  private refreshArmed(): void {
    const armed = this.state.armed;
    this.tray.setArmed(armed, false);
    if (armed === null) {
      this.aimAt(null);
      this.armedHint?.destroy();
      this.armedHint = null;
      return;
    }
    this.showArmedHint();
  }

  private showArmedHint(): void {
    this.armedHint?.destroy();
    this.armedHint = null;
    const armed = this.state.armed;
    const p = armed !== null ? this.state.tray[armed] : undefined;
    if (!p) return;
    const L = this.layout;
    const c = L.cell;
    const f = fontSizes(c);
    const name = STRINGS.powerLevel(POWER_NAMES[p.color] ?? '', Math.min(5, p.level + this.state.rules.temperedBonus));
    const msg = this.state.movesLeft === 0 ? STRINGS.armedHintFree : STRINGS.armedHint;
    const iconS = c * 0.5;
    const icon = this.add.image(0, 0, A, K.powerKey(p.color)).setDisplaySize(iconS, iconS);
    const t1 = addText(this, 0, 0, name, f.small, { color: GEM[p.color]!.light }).setOrigin(0, 0.5);
    const t2 = addText(this, 0, 0, `•  ${msg}`, f.small).setOrigin(0, 0.5);
    const gap = c * 0.12;
    const w = iconS + gap + t1.width + gap + t2.width + c * 0.5;
    const h = Math.max(iconS, t1.height) + c * 0.14;
    let x = -w / 2 + c * 0.25;
    icon.setX(x + iconS / 2);
    x += iconS + gap;
    t1.setX(x);
    x += t1.width + gap;
    t2.setX(x);
    const bg = addPanel(this, 0, 0, w, h, this.m, K.PANEL_DARK).setAlpha(0.95);
    const y = L.peek.y + L.peek.h / 2;
    const cont = this.add.container(L.board.x + L.board.w / 2, y, [bg, icon, t1, t2]);
    if (w > L.play.w * 0.98) cont.setScale((L.play.w * 0.98) / w);
    this.fxLayer.add(cont);
    this.armedHint = cont;
    const s = cont.scale;
    cont.setScale(s * 0.7).setAlpha(0);
    this.tweens.add({ targets: cont, scale: s, alpha: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t2, alpha: 0.55, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 400 });
  }

  /** Tap on tray slot `i`: arm it, or disarm it when it is the armed one. Arming is free. */
  toggleArm(i: number): boolean {
    const sv = getServices();
    if (!this.canInteract() || this.busy || this.trayFlights > 0) return false;
    if (!this.state.tray[i]) return false;
    const res = armPower(this.state, i);
    if (!res.ok) return false;
    const armedNow = this.state.armed !== null;
    sv.audio.play(armedNow ? 'power_arm' : 'power_disarm');
    this.tray.setArmed(this.state.armed);
    this.hint.hide();
    this.refreshArmed();
    if (armedNow) {
      const p = this.tray.slotCenter(i);
      this.fx.glow(p.x, p.y, hexToInt(GEM[this.state.tray[i]!.color]!.glow), 0.4, 1.8, 320, 0.7);
      if (this.tuts[0] === 'charge') this.completeTutorial('charge');
    }
    this.updateTutorial();
    return true;
  }

  /** Disarms the armed power (right click). */
  cancelArmed(): boolean {
    if (this.state.armed === null || this.state.status !== 'playing') return false;
    const res = disarmPower(this.state);
    if (!res.ok) return false;
    if (this.press?.armed) this.cancelPress();
    getServices().audio.play('power_disarm');
    this.refreshArmed();
    this.updateTutorial();
    return true;
  }

  // ---- actions -----------------------------------------------------------------------------------------

  /**
   * Tap a cell (pointer release, test hook and bot all come through here). With a power armed this fires it.
   * Returns true if the action went through.
   */
  commitTap(at: Pos): boolean {
    const sv = getServices();
    if (!this.canInteract()) return false;
    if (this.busy) {
      this.queuedTap = at;
      return false;
    }
    const armed = this.state.armed;
    const power = armed !== null ? this.state.tray[armed] : undefined;
    const kind = this.state.grid[at.y]?.[at.x]?.kind;
    this.kindsBefore = this.state.grid.map((row) => row.map((c) => c.kind));
    const res = tap(this.state, at);
    if (!res.ok) {
      this.board.clearHighlight();
      if (res.reason === 'not_a_group') {
        if (kind === 'block') this.board.wobble(at);
        if (kind && kind !== 'empty') {
          sv.audio.play('tap_invalid');
          sv.telemetry.log(EV.tap, { level: this.level, valid: false, cell: kind });
        }
      } else if (res.reason === 'no_moves') {
        sv.audio.play('tap_invalid');
        this.tray.pulse();
        this.toast(STRINGS.usePower);
      }
      return false;
    }
    if (power) {
      sv.telemetry.log(EV.powerUsed, { level: this.level, color: power.color, powerLevel: power.level });
      this.aimAt(null);
      this.armedHint?.destroy();
      this.armedHint = null;
      if (this.tuts[0] === 'use') this.completeTutorial('use');
    } else {
      sv.telemetry.log(EV.tap, { level: this.level, valid: true });
      if (this.tuts[0] === 'tap') this.completeTutorial('tap');
    }
    this.runAction(res.events, at);
    return true;
  }

  private doTransmute(at: Pos): void {
    this.kindsBefore = this.state.grid.map((row) => row.map((c) => c.kind));
    const res = transmute(this.state, at);
    if (!res.ok) {
      this.board.wobble(at);
      getServices().audio.play('tap_invalid');
      return;
    }
    getServices().telemetry.log('transmute', { level: this.level });
    this.runAction(res.events, at);
  }

  // ---- timeline ----------------------------------------------------------------------------------------

  private after(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    this.timers.push(this.time.delayedCall(ms, fn));
  }

  private cancelTimeline(): void {
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    this.tweens.timeScale = 1;
    this.fx?.setFrozen(false);
  }

  /** Telemetry and progress side effects happen when the action happens (a resize mid-animation skips steps). */
  private logEvents(events: readonly CoreEvent[]): void {
    const c = ctx();
    const tel = getServices().telemetry;
    const level = this.level;
    for (const e of events) {
      switch (e.type) {
        case 'powerCharged':
          tel.log(EV.powerCharged, { level, color: e.color, powerLevel: e.level, merged: e.merged, source: e.source });
          break;
        case 'powerSkipped':
          tel.log(EV.powerSkipped, { level, color: e.color, powerLevel: e.level, source: e.source });
          break;
        case 'boonGained':
          tel.log(EV.boonGained, { level, boon: e.boon, stacks: e.stacks });
          break;
        case 'geodeCleared':
          tel.log(EV.geode, { level });
          break;
        case 'relicCollected': {
          if (e.bonus) tel.log(EV.bonusRelic, { level });
          const r = this.state.relics.find((q) => q.id === e.relicId);
          this.foundOrder.push(r?.variant ?? 0);
          break;
        }
        case 'reforgeTokenEarned':
          tel.log(EV.reforgeTokenEarned, { level, reason: e.reason });
          c.setProgress(applyTokens(c.progress, 1));
          break;
        case 'shuffled':
          tel.log('shuffle', { level });
          break;
        default:
          break;
      }
    }
  }

  private runAction(events: CoreEvent[], origin: Pos): void {
    this.busy = true;
    this.cancelPress();
    this.hint.hide();
    this.hud.hideTip();
    this.lastClear = null;
    this.logEvents(events);
    // Bonus moves (Brilliant Cut, Sun Coin) are added to the counter when their animation lands.
    const bonus = events.reduce((n, e) => n + (e.type === 'bonusMove' ? e.amount : 0), 0);
    this.shownMoves = this.state.movesLeft === null ? null : this.state.movesLeft - bonus;
    this.hud.setMoves(this.shownMoves, true);
    const plan: Plan = planTimeline(events, {
      relicCells: (id) => {
        const r = this.state.relics.find((q) => q.id === id);
        return r ? relicCells(r) : null;
      },
    });
    for (const h of plan.hitStops) {
      this.after(h, () => {
        this.tweens.timeScale = 0;
        this.fx.setFrozen(true);
      });
      this.after(h + TIMING.hitStopMs, () => {
        this.tweens.timeScale = 1;
        this.fx.setFrozen(false);
      });
    }
    for (const step of plan.steps) this.after(step.at, () => this.applyStep(step, origin));
    this.after(plan.settleAt, () => this.settle());
  }

  private applyStep(step: PlannedStep, origin: Pos): void {
    const e = step.event;
    const sv = getServices();
    const audio = sv.audio;
    switch (e.type) {
      case 'cleared':
        this.lastClear = e.cells;
        audio.play('clear', { color: e.color, size: e.size });
        this.board.apply(this.state, e, { origin });
        break;
      case 'powerTriggered':
        this.firePower(e);
        break;
      case 'dirtDamaged':
        audio.play(e.hp === 0 ? 'dirt_break' : 'dirt_crack');
        this.board.apply(this.state, e, { origin });
        if (this.tuts[0] === 'dirt') this.completeTutorial('dirt');
        break;
      case 'bedrockShattered':
        audio.play('bedrock_shatter');
        this.board.apply(this.state, e, { origin });
        if (this.tuts[0] === 'bedrock') this.completeTutorial('bedrock');
        break;
      case 'crustChipped':
        audio.play('crust_chip');
        this.board.apply(this.state, e, { origin });
        break;
      case 'relicCollected':
        this.revealRelic(e.relicId, e.bonus);
        break;
      case 'boonGained':
        // Shown when its relic lands in the HUD (see revealRelic): queued here in event order.
        this.queueBoon(e.boon, e.stacks);
        break;
      case 'fell':
        this.board.apply(this.state, e, { origin });
        break;
      case 'scrolled': {
        const ms = scrollDuration(e.rows);
        this.board.scrollTo(e.scroll, ms);
        this.hud.tickDepth(e.scroll, ms);
        break;
      }
      case 'powerCharged':
        this.flyPower(e);
        break;
      case 'powerSkipped':
        this.toast(STRINGS.powerSkipped(POWER_NAMES[e.color] ?? '', e.level), K.powerKey(e.color));
        break;
      case 'geodeCleared': {
        const p = this.board.screen(e.at.x, e.at.y);
        audio.play('geode');
        this.fx.glintBurst(p.x, p.y, 10);
        this.fx.glow(p.x, p.y, 0xfff0ff, 0.4, 2.4, 460);
        this.fx.sparkBurst(p.x, p.y, 8, 0xd6f4ff);
        this.fx.floatText(p.x, p.y - this.layout.cell * 0.3, STRINGS.geodePower, fontSizes(this.layout.cell).label, '#e8d0ff');
        break;
      }
      case 'bonusMove':
        this.flyBonusMoves(e.amount, e.source);
        break;
      case 'reforgeTokenEarned':
        audio.play('reforge_token');
        this.toast(STRINGS.tokenEarned, K.REFORGE_TOKEN, '#ffe9a8');
        break;
      case 'recoloured':
        audio.play('perk_pick');
        this.board.apply(this.state, e, { origin });
        break;
      case 'shuffled':
        audio.play('shuffle');
        this.toast(STRINGS.shuffled);
        this.board.apply(this.state, e, { origin });
        break;
      default:
        break;
    }
  }

  private firePower(e: PowerEvent): void {
    const t = powerTiming(e);
    this.tray.removeAt(e.trayIndex);
    this.aimAt(null);
    if (e.effect.power === 'wildfire' && e.effect.group.length) this.lastClear = e.effect.group;
    else this.lastClear = [e.at];
    this.fxActiveUntil = this.time.now + t.duration;
    this.powerFx.play(e, t);
  }

  private flightDone(): void {
    this.flights = Math.max(0, this.flights - 1);
    if (this.flights === 0) {
      const w = this.flightWaiters;
      this.flightWaiters = [];
      for (const f of w) f();
    }
  }

  private whenFlightsDone(fn: () => void): void {
    if (this.flights === 0) fn();
    else this.flightWaiters.push(fn);
  }

  /** THE money moment: freeze, flash, glow burst, arpeggio, then the relic arcs into its HUD slot. */
  private revealRelic(id: number, bonus: boolean): void {
    const r = this.state.relics.find((q) => q.id === id);
    if (!r) return;
    this.flights++;
    this.board.relicFlash(id);
    const start = this.board.relicScreen(r);
    this.lastRelicAt = start;
    const target = this.hud.relicTarget();
    this.after(TIMING.hitStopMs, () => {
      const sv = getServices();
      sv.audio.play('relic_reveal');
      this.board.takeRelic(id);
      const c = this.layout.cell;
      this.fx.glow(start.x, start.y, 0xffd86a, 0.6 * r.size, 3.2 * r.size, 650);
      this.fx.glow(start.x, start.y, 0xffffff, 0.3 * r.size, 1.6 * r.size, 300);
      this.fx.sparkBurst(start.x, start.y, 18, 0xffe07a);
      this.fx.shake(c * 0.08, 180);
      if (bonus) this.fx.floatText(start.x, start.y - c * 0.6, STRINGS.bonusRelic, fontSizes(c).label, '#ffe27a');
      const img = this.add.image(start.x, start.y, A, K.relicKey(r.variant, r.size === 2));
      this.fxLayer.add(img);
      const s0 = (c * r.size) / img.frame.width;
      img.setScale(s0);
      const sEnd = target.size / img.frame.width;
      const ctl = { x: (start.x + target.x) / 2 + c * 1.6 * (start.x < target.x ? -1 : 1), y: Math.min(start.y, target.y) - c * 2.2 };
      const trail = this.fx.trail;
      trail.startFollow(img);
      trail.start();
      const prog = { t: 0 };
      this.tweens.chain({
        tweens: [
          { targets: img, scale: s0 * 1.35, duration: 220, ease: 'Back.easeOut' },
          {
            targets: prog,
            t: 1,
            duration: 560,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
              const t = prog.t;
              const u = 1 - t;
              img.setPosition(u * u * start.x + 2 * u * t * ctl.x + t * t * target.x, u * u * start.y + 2 * u * t * ctl.y + t * t * target.y);
              img.setScale(s0 * 1.35 + (sEnd - s0 * 1.35) * t);
              img.setAngle(Math.sin(t * Math.PI) * 18);
            },
          },
        ],
        onComplete: () => {
          trail.stop();
          trail.stopFollow();
          img.destroy();
          this.hud.addRelic(r.variant);
          this.fx.sparkBurst(target.x, target.y, 14, 0xffe07a);
          this.fx.glow(target.x, target.y, 0xffd86a, 0.4, 1.6, 420);
          this.runBanners();
          this.flightDone();
        },
      });
    });
  }

  /** Boon banners play one at a time once their relic has landed ("Chalice: Powers +1"). */
  private queueBoon(boon: BoonId, stacks: number): void {
    this.flights++;
    this.bannerQueue.push(() => this.boonBanner(boon, stacks));
  }

  private runBanners(): void {
    if (this.bannerBusy) return;
    const next = this.bannerQueue.shift();
    if (!next) return;
    this.bannerBusy = true;
    next();
  }

  private boonBanner(boon: BoonId, stacks: number): void {
    const L = this.layout;
    const c = L.cell;
    const f = fontSizes(c);
    const sv = getServices();
    sv.audio.play('boon');
    const info = BOONS[boon];
    const v = BOON_IDS.indexOf(boon);
    const iconS = c * 1.05;
    const icon = this.add.image(0, 0, A, K.boonKey(v)).setDisplaySize(iconS, iconS);
    const label = STRINGS.boonBanner(info.name, info.banner) + (stacks > 1 ? `  x${stacks}` : '');
    const t = addText(this, 0, 0, label, f.title * 0.9, { color: '#fff3c4' }).setOrigin(0, 0.5);
    const maxW = L.play.w * 0.94;
    const w0 = iconS + c * 0.25 + t.width + c * 0.8;
    if (w0 > maxW) t.setScale((maxW - iconS - c * 1.05) / t.width);
    const w = Math.min(maxW, w0);
    const h = iconS + c * 0.32;
    icon.setX(-w / 2 + c * 0.35 + iconS / 2);
    t.setX(icon.x + iconS / 2 + c * 0.22);
    const bg = addPanel(this, 0, 0, w, h, this.m, K.PANEL_DARK).setAlpha(0.96);
    const glow = this.add.image(icon.x, 0, A, K.GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd86a).setScale((c * 2) / this.m.glow).setAlpha(0.7);
    const y = L.board.y + L.board.h * 0.3;
    const cont = this.add.container(L.board.x + L.board.w / 2, y, [bg, glow, icon, t]);
    this.fxLayer.add(cont);
    cont.setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: cont, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: glow, alpha: 0.2, scale: glow.scale * 1.3, duration: 500, yoyo: true, repeat: 1 });
    const dest = this.hud.boonCenter(boon);
    this.time.delayedCall(820, () => {
      if (!cont.active) return;
      // The icon flies down into the boons row; the banner fades.
      const fly = this.add.image(cont.x + icon.x, cont.y, A, K.boonKey(v)).setDisplaySize(iconS, iconS);
      this.fxLayer.add(fly);
      icon.setVisible(false);
      this.tweens.add({ targets: cont, alpha: 0, y: y - c * 0.4, duration: 260, onComplete: () => cont.destroy() });
      this.tweens.add({
        targets: fly,
        x: dest.x,
        y: dest.y,
        displayWidth: dest.size,
        displayHeight: dest.size,
        duration: 360,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          fly.destroy();
          this.hud.gainBoon(boon, stacks);
          this.fx.sparkBurst(dest.x, dest.y, 8, 0xffe07a);
          this.bannerBusy = false;
          this.flightDone();
          this.runBanners();
        },
      });
    });
  }

  /** "+2" (Sun Coin) or "+1" (Brilliant Cut) flies into the move counter. */
  private flyBonusMoves(amount: number, source: 'brilliant' | 'sun_coin' | 'continue'): void {
    const c = this.layout.cell;
    const f = fontSizes(c);
    const to = this.hud.movesCenter();
    const from = source === 'sun_coin' && this.lastRelicAt ? this.lastRelicAt : this.lastClear ? this.board.centroid(this.lastClear) : to;
    const t = addText(this, from.x, from.y, STRINGS.bonusMoves(amount), f.stat * 1.1, { color: '#8af08e' }).setOrigin(0.5).setScale(0.4);
    this.fxLayer.add(t);
    this.flights++;
    this.tweens.chain({
      tweens: [
        { targets: t, scale: 1.2, duration: 200, ease: 'Back.easeOut' },
        { targets: t, x: to.x, y: to.y, scale: 0.8, duration: 480, delay: 120, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => {
        t.destroy();
        if (this.shownMoves !== null) this.shownMoves += amount;
        this.hud.setMoves(this.shownMoves, true);
        this.fx.sparkBurst(to.x, to.y, 8, 0x8af08e);
        getServices().audio.play('ui_click', { pitch: 7 });
        this.flightDone();
      },
    });
  }

  /** A charged power flies to its tray slot, then lands there (new, level-up merge, or replacing a weaker one). */
  private flyPower(e: Extract<CoreEvent, { type: 'powerCharged' }>): void {
    const c = this.layout.cell;
    const B = this.layout.board;
    let from: { x: number; y: number };
    if (e.source === 'boon' && this.lastRelicAt) from = this.lastRelicAt;
    else if ((e.source === 'group' || e.source === 'geode' || e.source === 'volatile') && this.lastClear) from = this.board.centroid(this.lastClear);
    else from = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
    if (e.source === 'rescue') this.toast(STRINGS.rescuePower);
    this.flights++;
    this.trayFlights++;
    const to = this.tray.slotCenter(e.index);
    const img = this.add.image(from.x, from.y, A, K.powerKey(e.color));
    this.fxLayer.add(img);
    const s1 = (c * 1.15) / this.m.power;
    const sEnd = this.tray.tokenSize() / this.m.power;
    img.setScale(0);
    this.fx.glow(from.x, from.y, hexToInt(GEM[e.color]!.glow), 0.5, 2.6, 460);
    const trail = this.fx.trail;
    const prog = { t: 0 };
    const ctl = { x: (from.x + to.x) / 2 + c * 1.2 * (from.x < to.x ? -1 : 1), y: Math.min(from.y, to.y) - c * 0.8 };
    this.tweens.chain({
      tweens: [
        { targets: img, scale: s1, angle: 360, duration: 260, ease: 'Back.easeOut' },
        {
          targets: prog,
          t: 1,
          delay: 60,
          duration: 420,
          ease: 'Cubic.easeInOut',
          onStart: () => {
            trail.setParticleTint(hexToInt(GEM[e.color]!.glow));
            trail.startFollow(img);
            trail.start();
          },
          onUpdate: () => {
            const t = prog.t;
            const u = 1 - t;
            img.setPosition(u * u * from.x + 2 * u * t * ctl.x + t * t * to.x, u * u * from.y + 2 * u * t * ctl.y + t * t * to.y);
            img.setScale(s1 + (sEnd - s1) * t);
          },
        },
      ],
      onComplete: () => {
        trail.stop();
        trail.stopFollow();
        trail.setParticleTint(0xffe07a);
        img.destroy();
        const audio = getServices().audio;
        if (e.merged) {
          audio.play('power_merge', { level: e.level });
          this.fx.floatText(to.x, to.y - c * 0.7, STRINGS.levelUp(e.level), fontSizes(c).label, '#ffe27a');
        } else audio.play('power_charge', { color: e.color, level: e.level });
        this.tray.land(e.index, { color: e.color, level: e.level }, e.merged, !!e.replaced);
        this.fx.sparkBurst(to.x, to.y, e.merged ? 16 : 10, hexToInt(GEM[e.color]!.glow));
        this.fx.glow(to.x, to.y, hexToInt(GEM[e.color]!.glow), 0.4, 1.8, 380);
        this.fx.shake(c * 0.04, 100);
        this.trayFlights = Math.max(0, this.trayFlights - 1);
        this.flightDone();
        if (this.trayFlights === 0 && !this.busy) this.syncTray();
        this.updateTutorial();
      },
    });
  }

  private syncTray(): void {
    if (!this.tray.matches(this.state.tray)) this.tray.render(this.state.tray, this.state.armed);
    else this.tray.setArmed(this.state.armed, false);
  }

  /** Every so often a visible geode twinkles. */
  private twinkleGeode(): void {
    if (this.overlay || !this.board) return;
    const list = this.board.geodeScreens();
    if (!list.length) return;
    const p = list[Math.floor(Math.random() * list.length)]!;
    const c = this.layout.cell;
    const img = this.fx.sprite(K.GEODE_GLINT);
    if (!img) return;
    const s = img.scale;
    img.setBlendMode(Phaser.BlendModes.ADD).setPosition(p.x + (Math.random() - 0.5) * c * 0.5, p.y + (Math.random() - 0.5) * c * 0.5).setScale(0);
    this.tweens.add({ targets: img, scale: s * 0.9, angle: 90, duration: 260, yoyo: true, ease: 'Sine.easeOut', onComplete: () => this.fx.free(img) });
  }

  /** The board is stable: reconcile the view, unlock input, handle level end, tutorials and queued input. */
  private settle(): void {
    this.timers = [];
    this.tweens.timeScale = 1;
    this.fx.setFrozen(false);
    this.board.sync(this.state);
    this.board.updatePeek(this.state);
    if (this.flights === 0) {
      this.shownMoves = this.state.movesLeft;
      this.hud.setMoves(this.shownMoves, false);
    }
    if (this.trayFlights === 0) this.syncTray();
    this.scheduleBackground();
    this.busy = false;
    if (this.state.status === 'won' && !this.endHandled) {
      this.endHandled = true;
      this.hint.hide();
      this.refreshArmed();
      this.recordWin();
      this.whenFlightsDone(() => this.time.delayedCall(320, () => this.onWin()));
      return;
    }
    if (this.state.status === 'lost' && !this.endHandled) {
      this.endHandled = true;
      this.hint.hide();
      this.refreshArmed();
      this.whenFlightsDone(() => this.time.delayedCall(450, () => this.onLose()));
      return;
    }
    if (this.state.movesLeft === 0 && this.state.tray.length > 0 && this.state.armed === null) {
      this.toast(STRINGS.usePower);
      this.tray.pulse();
    }
    this.refreshArmed();
    this.updateTutorial();
    const q = this.queuedTap;
    this.queuedTap = null;
    if (q) {
      this.commitTap(q);
      return;
    }
    if (this.heldPointer !== null) {
      const p = this.input.manager.pointers.find((pp) => pp.id === this.heldPointer && pp.isDown);
      this.heldPointer = null;
      if (p) this.beginPress(p);
    }
  }

  // ---- level end -----------------------------------------------------------------------------------------

  /** Saves the win (stars, unlock, perk point) the moment it happens, so a reload during the celebration cannot lose it. */
  private recordWin(): void {
    const c = ctx();
    const sv = getServices();
    const st = stars(this.state);
    this.winStars = st;
    const before = c.progress;
    const after = applyWin(before, this.level, st);
    this.winPoint = pointEarned(before, after, this.level);
    c.setProgress(after);
    const s = this.state;
    sv.telemetry.log(EV.levelWon, {
      level: this.level, boss: s.def.boss || undefined, movesLeft: s.movesLeft, stars: st, movesUsed: s.movesUsed,
      relics: s.collected, goal: s.goal, bonus: s.stats.bonusCollected, powersUsed: s.stats.powersUsed,
    });
    if (this.winPoint) sv.telemetry.log(EV.perkPointEarned, { level: this.level });
  }

  private onWin(): void {
    const sv = getServices();
    const st = this.winStars;
    sv.audio.play('win');
    const next = nextLevelAfter(this.level);
    if (next === null || this.state.def.boss) sv.platform.happytime();
    const s = this.state;
    this.openOverlay('LevelEnd', {
      result: 'win',
      level: this.level,
      stars: st,
      movesLeft: s.movesLeft,
      hard: s.def.hard,
      boss: s.def.boss,
      final: next === null,
      relics: s.collected,
      goal: s.goal,
      bonus: s.stats.bonusCollected,
      boons: { ...s.boons },
      tokens: s.stats.reforgeTokens,
      perkPoint: this.winPoint,
      onNext: () => this.afterWin(),
      onLevels: () => this.openLevelSelect(),
    });
  }

  private afterWin(): void {
    if (this.leaving || this.overlay !== 'LevelEnd') return;
    const c = ctx();
    const next = nextLevelAfter(this.level) ?? this.level;
    const offer = perkOffer(c.progress, this.level);
    if (this.winPoint && c.progress.perkPoints > 0 && offer.length > 0) {
      this.winPoint = false;
      getServices().telemetry.log('perk_offered', { level: this.level, perks: offer });
      this.openOverlay('PerkPick', { level: this.level, offer, onDone: () => this.goLevel(next, false) });
      return;
    }
    this.goLevel(next, false);
  }

  private onLose(): void {
    const sv = getServices();
    sv.telemetry.log(EV.levelLost, { level: this.level, boss: this.state.def.boss || undefined, continueUsed: this.state.continueUsed });
    sv.audio.play('lose');
    this.openOverlay('LevelEnd', {
      result: 'lose',
      level: this.level,
      boss: this.state.def.boss,
      relics: this.state.collected,
      goal: this.state.goal,
      tokens: this.state.stats.reforgeTokens,
      canContinue: !this.state.continueUsed && this.state.movesLeft !== null,
      onContinue: () => this.doContinue(),
      onRetry: () => this.goLevel(this.level, false),
      onLevels: () => this.openLevelSelect(),
    });
  }

  private doContinue(): void {
    if (this.leaving) return;
    const res = useContinue(this.state);
    if (!res.ok) return;
    getServices().telemetry.log(EV.continueUsed, { level: this.level });
    this.endHandled = false;
    this.endCard = null;
    this.closeOverlay();
    const p = this.hud.movesCenter();
    this.fx.floatText(p.x, p.y + this.layout.cell * 0.2, STRINGS.bonusMoves(5), fontSizes(this.layout.cell).stat, '#8af08e');
    this.runAction(res.events.filter((e) => e.type !== 'bonusMove'), { x: 0, y: this.state.scroll });
  }

  // ---- overlays ---------------------------------------------------------------------------------------

  openOverlay(key: string, data: Record<string, unknown>): void {
    if (key === 'LevelEnd') this.endCard = { key, data };
    if (this.overlay) this.scene.stop(this.overlay);
    this.overlay = key;
    this.cancelPress();
    this.aimAt(null);
    this.hint.hide();
    this.hud.hideTip();
    this.setInPlay(false);
    this.scene.launch(key, { onClose: () => this.closeOverlay(), ...data });
    this.scene.bringToTop(key);
  }

  closeOverlay(): void {
    if (this.overlay) this.scene.stop(this.overlay);
    this.overlay = null;
    if (this.endCard && this.endHandled && this.state.status !== 'playing') {
      const card = this.endCard;
      this.openOverlay(card.key, card.data);
      return;
    }
    this.hud.setPerkPoints(ctx().progress.perkPoints, false);
    this.setInPlay(this.state.status === 'playing');
    this.updateTutorial();
  }

  private openLevelSelect(): void {
    this.openOverlay('LevelSelect', {
      current: this.level,
      onPick: (n: number) => this.goLevel(n, true),
      onPerks: () => this.openPerks(),
    });
  }

  /**
   * The perks screen. Perks only change between attempts: a change made before the first move restarts this
   * attempt with the new perks (nothing is lost); after that it applies from the next attempt (the screen says so).
   */
  private openPerks(): void {
    const fresh = this.state.status === 'playing' && this.state.movesUsed === 0 && this.state.stats.powersUsed === 0 && !this.endHandled;
    this.openOverlay('Perks', {
      nextTryNote: !fresh && this.state.status === 'playing',
      onClose: () => this.closePerks(fresh),
    });
  }

  private closePerks(fresh: boolean): void {
    const changed = !samePerks(this.attemptPerks, ctx().activePerks());
    if (changed && fresh) {
      this.goLevel(this.level, false);
      return;
    }
    this.closeOverlay();
  }

  private openSettings(): void {
    this.openOverlay('Settings', {
      onReset: () => this.goLevel(1, false),
      onRestart: () => this.goLevel(this.level, true),
    });
  }

  /** Leaves this level for `n` (a new attempt). `quit` logs a level_quit when leaving a level still in progress. */
  goLevel(n: number, quit: boolean): void {
    if (this.leaving) return;
    if (quit) this.logQuit();
    this.leaving = true;
    if (this.overlay) this.scene.stop(this.overlay);
    this.overlay = null;
    this.cancelTimeline();
    this.scene.restart({ level: n } satisfies PlayData);
  }

  private setInPlay(on: boolean): void {
    const c = ctx();
    c.inPlay = on;
    const p = getServices().platform;
    if (on) p.gameplayStart();
    else p.gameplayStop();
  }

  // ---- tutorial ------------------------------------------------------------------------------------------

  private initialTutorials(): TutStep[] {
    const t = this.state.def.tutorial ?? [];
    const p = ctx().progress;
    return t.filter((s) => (s === 'tap' ? starsFor(p, this.level) === 0 && !tutorialSeen(p, s) : !tutorialSeen(p, s))) as TutStep[];
  }

  private completeTutorial(step: TutStep): void {
    if (this.tuts[0] !== step) return;
    this.tuts.shift();
    // Persisted, so the hint does not come back after a reload or a retry.
    const c = ctx();
    if (!tutorialSeen(c.progress, step)) c.setProgress(markTutorialSeen(c.progress, step));
    this.hint.hide();
  }

  /** Shows the current tutorial hint if it applies to the board right now (never blocks input). */
  updateTutorial(): void {
    const step = this.tuts[0];
    if (!step || this.busy || this.overlay || this.state.status !== 'playing' || this.press || this.trayFlights > 0) {
      if (!step) this.hint?.hide();
      return;
    }
    const spec = this.tutorialSpec(step);
    if (spec) this.hint.show(spec);
    else this.hint.hide();
  }

  private slotHint(text: string): HintSpec | null {
    const i = this.state.tray.findIndex((p) => !!p);
    if (i < 0) return null;
    const p = this.tray.slotCenter(i);
    const L = this.layout;
    // Label above the tray (in the peek strip) in the column layout; above the slot in the wide one.
    const labelY = L.mode === 'column' ? L.peek.y - L.cell * 0.15 : p.y - L.cell * 1.15;
    return { kind: 'tap', x: p.x, y: p.y, text, labelY };
  }

  private tutorialSpec(step: TutStep): HintSpec | null {
    const s = this.state;
    const at = (p: Pos) => this.board.screen(p.x, p.y);
    const groupHint = (g: Pos[], text: string): HintSpec => {
      const p = this.board.centroid(g);
      return { kind: 'tap', x: p.x, y: p.y, topY: this.board.groupTop(g).y, text };
    };
    switch (step) {
      case 'tap': {
        const sug = suggestAction(s);
        if (!sug || sug.type !== 'tap') return null;
        const g = findGroup(s, sug.at);
        return groupHint(g.length ? g : [sug.at], STRINGS.tutTap);
      }
      case 'dirt': {
        let best: Pos[] | null = null;
        for (const g of listGroups(s)) {
          const touches = g.some((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const c = s.grid[p.y + (dy as number)]?.[p.x + (dx as number)];
            return c?.kind === 'dirt' && p.y + (dy as number) < s.scroll + VISIBLE_ROWS;
          }));
          if (touches && (!best || g.length > best.length)) best = g;
        }
        return best ? groupHint(best, STRINGS.tutDirt) : null;
      }
      case 'charge': {
        if (s.tray.length > 0) return s.armed === null ? this.slotHint(STRINGS.tutArm) : null;
        // Prefer the level's scripted (pinned) group, then the biggest group that charges.
        let best: Pos[] | null = null;
        const t = powerThreshold(s);
        const pinned = (g: Pos[]) => g.some((p) => s.def.pinned.some((q) => q.x === p.x && q.y === p.y));
        for (const g of listGroups(s)) {
          if (g.length < t) continue;
          if (!best || (pinned(g) && !pinned(best)) || (pinned(g) === pinned(best) && g.length > best.length)) best = g;
        }
        return best ? groupHint(best, STRINGS.tutCharge) : null;
      }
      case 'use': {
        if (s.tray.length === 0) return null;
        if (s.armed === null) return this.slotHint(STRINGS.tutArm);
        const target = this.powerHintTarget();
        if (!target) return null;
        const p = at(target);
        return { kind: 'tap', x: p.x, y: p.y, text: STRINGS.tutUse };
      }
      case 'bedrock': {
        let rock: Pos | null = null;
        for (let y = s.scroll; y < Math.min(s.grid.length, s.scroll + VISIBLE_ROWS) && !rock; y++) {
          for (let x = 0; x < COLUMNS; x++) if (s.grid[y]?.[x]?.kind === 'bedrock') { rock = { x, y }; break; }
        }
        if (!rock) return null;
        if (s.tray.length > 0 && s.armed === null) return this.slotHint(STRINGS.tutBedrock);
        const p = at(rock);
        return { kind: 'tap', x: p.x, y: p.y, text: STRINGS.tutBedrock };
      }
    }
  }

  /** A sensible demo target for the armed power: the bot's choice, else the cell above the next relic. */
  private powerHintTarget(): Pos | null {
    const s = this.state;
    const armed = s.armed;
    if (armed === null) return null;
    const unarmed = { ...s, armed: null };
    const sug = suggestAction(unarmed);
    if (sug?.type === 'power' && sug.trayIndex === armed) return sug.at;
    const relic = s.relics.find((r) => !r.collected && r.y >= s.scroll && r.y < s.scroll + VISIBLE_ROWS);
    if (relic) return { x: relic.x, y: Math.max(s.scroll, relic.y - 2) };
    return { x: 3, y: s.scroll + 4 };
  }

  // ---- debug / test hooks --------------------------------------------------------------------------------

  private bindDebugKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-N', () => {
      if (this.overlay || this.endHandled) return;
      this.cancelTimeline();
      this.busy = false;
      for (const r of this.state.relics) r.collected = true;
      this.state.collected = Math.max(this.state.collected, this.state.goal);
      this.state.status = 'won';
      this.settle();
    });
    kb.on('keydown-R', () => this.goLevel(this.level, true));
    kb.on('keydown-P', () => {
      const c = ctx();
      c.perksOff = !c.perksOff;
      this.goLevel(this.level, true);
    });
  }

  /** One bot move through the same paths as real input (test hook / autoplay). A power use = arm + fire. */
  botStep(): string {
    if (!this.canInteract() || this.busy || this.trayFlights > 0) return 'busy';
    const sug = suggestAction(this.state);
    if (!sug) return 'none';
    if (sug.type === 'tap') {
      if (this.state.armed !== null) this.toggleArm(this.state.armed);
      return this.commitTap(sug.at) ? 'tap' : 'fail';
    }
    if (this.state.armed !== sug.trayIndex && !this.toggleArm(sug.trayIndex)) return 'fail';
    return this.commitTap(sug.at) ? 'power' : 'fail';
  }

  /** The boss intro banner is on screen (for tests). */
  get bossIntroShowing(): boolean {
    return this.time.now < this.bossIntroUntil;
  }

  /** A boon banner is on screen (for screenshots/tests). */
  get bannerShowing(): boolean {
    return this.bannerBusy;
  }

  /** Debug hook: the tray was edited directly; redraw it and the HUD perk badge. */
  debugResyncTray(): void {
    this.tray.render(this.state.tray, this.state.armed);
    this.refreshArmed();
    this.hud.setPerkPoints(ctx().progress.perkPoints, false);
    this.updateTutorial();
  }

  /** The active tutorial step (null when none), for tests. */
  tutorialStep(): string | null {
    return this.tuts[0] ?? null;
  }

  /** Effects still in flight after the board settled (relic, boon or power flights), for tests. */
  isAnimating(): boolean {
    return this.flights > 0 || this.trayFlights > 0;
  }

  /** Frame times (ms) recorded while power animations played, then cleared. */
  takeFxFrames(): number[] {
    const f = this.fxFrames;
    this.fxFrames = [];
    return f;
  }

  particleCount(): number {
    return this.fx.particleCount();
  }

  layoutInfo(): Layout {
    return this.layout;
  }

  screenOfCell(x: number, y: number): { x: number; y: number } {
    return this.board.screen(x, y);
  }

  traySlotCenter(i: number): { x: number; y: number } {
    return this.tray.slotCenter(i);
  }
}
