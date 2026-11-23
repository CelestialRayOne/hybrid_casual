// Tiny test/debug hook on `window.__game`, installed ONLY with ?debug=1 or on the Vite dev server.
// Used by the Playwright smoke tests and the visual review scripts; never present in a normal player build session.
import type Phaser from 'phaser';
import { POWER_KINDS, suggestAction } from '../core';
import type { GemColor, PerkId, PowerLevel } from '../core';
import { levelTileCenter, pickLevelTile } from './scenes/LevelSelectScene';
import { perkCardCenter, pickPerkCard } from './scenes/PerkPickScene';
import { perkNodeCenter, pickPerkNode } from './scenes/PerksScene';
import { PlayScene } from './scenes/PlayScene';
import { ctx } from './services';
import { buttonCenter, pressButtonById, registeredButtonIds } from './ui/widgets';

export interface GameHook {
  ready(): boolean;
  summary(): Record<string, unknown> | null;
  /**
   * Tap a level cell (x = column, y = row in the whole level) through the same path as a pointer release. With a
   * power armed this fires it.
   */
  tap(x: number, y: number): boolean;
  /** Tap tray slot `i` (arm / disarm), same path as a real tap. */
  arm(trayIndex: number): boolean;
  /** One bot move (suggestAction) through the real input paths ('tap' | 'power' | 'busy' | 'none' | 'fail'). */
  botStep(): string;
  /** Debug: put a power in the tray (replaces the tray), e.g. to show each power's animation. */
  givePower(color: number, level: number): boolean;
  /** Debug: add perk points / reforge tokens to the saved progress. */
  grant(points: number, tokens: number): void;
  /** Debug: set moves left / an attempt stat (e.g. reforgeTokens) on the live level. */
  setMoves(n: number): void;
  setStat(name: string, value: number): void;
  pickPerkNode(id: string): boolean;
  perkNodeToPage(id: string): { x: number; y: number } | null;
  /** Frame times (ms) recorded during power animations since the last call; live particle count. */
  fxFrames(): number[];
  particles(): number;
  suggest(): unknown;
  press(buttonId: string): boolean;
  buttons(): string[];
  pickPerk(i: number): boolean;
  pickLevel(level: number): boolean;
  startLevel(level: number): void;
  /** Page (CSS px) coordinates of a cell centre / tray slot, for real pointer input in tests. */
  cellToPage(x: number, y: number): { x: number; y: number } | null;
  traySlotToPage(i: number): { x: number; y: number } | null;
  gameToPage(x: number, y: number): { x: number; y: number };
  /** Page (CSS px) centres of a registered button, perk card or level tile (null if not on screen). */
  buttonToPage(id: string): { x: number; y: number } | null;
  perkCardToPage(i: number): { x: number; y: number } | null;
  levelTileToPage(level: number): { x: number; y: number } | null;
  /** Object, tween, timer and listener counts (leak checks across many levels). */
  stats(): Record<string, number> | null;
}

export function installTestHook(game: Phaser.Game): void {
  const play = (): PlayScene | null => {
    const s = game.scene.getScene(PlayScene.KEY) as PlayScene | null;
    return s && s.sys.isActive() ? s : null;
  };
  const toPage = (x: number, y: number) => {
    const rect = game.canvas.getBoundingClientRect();
    return { x: rect.left + (x / game.scale.width) * rect.width, y: rect.top + (y / game.scale.height) * rect.height };
  };
  const hook: GameHook = {
    ready: () => play() !== null,
    summary() {
      const p = play();
      if (!p) return null;
      const s = p.state;
      return {
        level: s.def.id,
        status: s.status,
        movesLeft: s.movesLeft,
        movesUsed: s.movesUsed,
        scroll: s.scroll,
        rows: s.grid.length,
        tray: s.tray.map((t) => `${POWER_KINDS[t.color]}${t.level}`),
        armed: s.armed,
        goal: s.goal,
        collected: s.collected,
        bonus: s.stats.bonusCollected,
        boons: Object.fromEntries(Object.entries(s.boons).filter(([, n]) => n > 0)),
        powersUsed: s.stats.powersUsed,
        powersCharged: s.stats.powersCharged,
        relicsLeft: s.relics.filter((r) => !r.collected).length,
        boss: s.def.boss,
        hard: s.def.hard,
        attemptSeed: s.attemptSeed,
        perkPoints: ctx().progress.perkPoints,
        reforgeTokens: ctx().progress.reforgeTokens,
        tutorialsSeen: [...ctx().progress.tutorialsSeen],
        busy: p.busy,
        banner: p.bannerShowing,
        bossIntro: p.bossIntroShowing,
        animating: p.isAnimating(),
        tutorial: p.tutorialStep(),
        overlay: p.overlay,
        perks: [...ctx().progress.perks],
        unlocked: ctx().progress.unlocked,
        stars: { ...ctx().progress.stars },
        layout: {
          mode: p.layoutInfo().mode,
          cell: p.layoutInfo().cell,
          cellCss: p.layoutInfo().cellCss,
          levelsBtn: (() => {
            const r = p.layoutInfo().levelsBtn;
            return toPage(r.x + r.w / 2, r.y + r.h / 2);
          })(),
          perksBtn: (() => {
            const r = p.layoutInfo().perksBtn;
            return toPage(r.x + r.w / 2, r.y + r.h / 2);
          })(),
        },
      };
    },
    tap: (x, y) => play()?.commitTap({ x, y }) ?? false,
    arm: (i) => play()?.toggleArm(i) ?? false,
    botStep: () => play()?.botStep() ?? 'no-play',
    givePower(color, level) {
      const p = play();
      if (!p || p.busy || p.state.status !== 'playing') return false;
      p.state.tray = [{ color: (color % 5) as GemColor, level: Math.max(1, Math.min(5, level)) as PowerLevel, seq: 900 + p.state.powerSeq }];
      p.state.armed = null;
      p.debugResyncTray();
      return true;
    },
    grant(points, tokens) {
      const c = ctx();
      c.setProgress({ ...c.progress, perkPoints: c.progress.perkPoints + points, reforgeTokens: Math.min(9, c.progress.reforgeTokens + tokens) });
    },
    setMoves(n) {
      const p = play();
      if (p && p.state.movesLeft !== null) p.state.movesLeft = n;
    },
    setStat(name, value) {
      const p = play();
      if (p && name in p.state.stats) (p.state.stats as unknown as Record<string, number>)[name] = value;
    },
    pickPerkNode: (id) => pickPerkNode(id as PerkId),
    perkNodeToPage(id) {
      const c = perkNodeCenter(id as PerkId);
      return c ? toPage(c.x, c.y) : null;
    },
    fxFrames: () => play()?.takeFxFrames() ?? [],
    particles: () => play()?.particleCount() ?? 0,
    suggest: () => {
      const p = play();
      return p ? suggestAction(p.state) : null;
    },
    press: (id) => pressButtonById(id),
    buttons: () => registeredButtonIds(),
    pickPerk: (i) => pickPerkCard(i),
    pickLevel: (l) => pickLevelTile(l),
    startLevel: (l) => play()?.goLevel(l, true),
    cellToPage(x, y) {
      const p = play();
      if (!p) return null;
      const s = p.screenOfCell(x, y);
      return toPage(s.x, s.y);
    },
    traySlotToPage(i) {
      const p = play();
      if (!p) return null;
      const s = p.traySlotCenter(i);
      return toPage(s.x, s.y);
    },
    gameToPage: toPage,
    buttonToPage(id) {
      const c = buttonCenter(id);
      return c ? toPage(c.x, c.y) : null;
    },
    perkCardToPage(i) {
      const c = perkCardCenter(i);
      return c ? toPage(c.x, c.y) : null;
    },
    stats() {
      const p = play();
      if (!p) return null;
      let objects = 0;
      const count = (list: readonly Phaser.GameObjects.GameObject[]) => {
        for (const o of list) {
          objects++;
          const kids = (o as unknown as { list?: Phaser.GameObjects.GameObject[] }).list;
          if (Array.isArray(kids)) count(kids);
        }
      };
      count(p.children.list);
      const clock = p.time as unknown as { _active?: unknown[]; _pendingInsertion?: unknown[] };
      return {
        objects,
        tweens: p.tweens.getTweens().length,
        timers: (clock._active?.length ?? 0) + (clock._pendingInsertion?.length ?? 0),
        cameras: p.cameras.cameras.length,
        textures: Object.keys(game.textures.list).length,
        resizeListeners: game.scale.listenerCount('resize'),
        pointerUpListeners: p.input.listenerCount('pointerup'),
        keyListeners: p.input.keyboard?.listenerCount('keydown-N') ?? 0,
        scenesActive: game.scene.getScenes(true).length,
      };
    },
    levelTileToPage(level) {
      const c = levelTileCenter(level);
      return c ? toPage(c.x, c.y) : null;
    },
  };
  (window as unknown as { __game: GameHook }).__game = hook;
}
