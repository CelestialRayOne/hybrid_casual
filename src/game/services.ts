// The services the scenes use, set once by the composition root (src/main.ts). Scenes never construct
// platform objects themselves, so swapping implementations (CrazyGames, Capacitor, tests) stays in main.ts.
import type { PerkId, Progress } from '../core';
import type { AudioService, Platform, SafeArea, SaveStore } from '../platform';
import type { Telemetry } from '../telemetry';
import type { UrlFlags } from './config';

export interface Services {
  platform: Platform;
  audio: AudioService;
  save: SaveStore;
  telemetry: Telemetry;
  flags: UrlFlags;
  /** Vite dev server (enables the test hook). */
  dev: boolean;
  readSafeArea(): SafeArea;
  /** Touch-first device (SDK device type when known, else a coarse-pointer media query). */
  isTouch(): boolean;
}

export class GameContext {
  progress: Progress;
  /** Debug flag (`P` key with ?debug=1): play without perks to test the core loop alone. */
  perksOff = false;
  /** True while a level is being played with no overlay open (drives gameplayStart/Stop on visibility). */
  inPlay = false;
  /** Set by the Play scene: logs level_quit when the page goes away mid-level (called from main.ts on pagehide). */
  onPageHide: (() => void) | null = null;

  constructor(readonly services: Services, progress: Progress) {
    this.progress = progress;
  }

  /** Perks applied to new levels. */
  activePerks(): PerkId[] {
    return this.perksOff ? [] : [...this.progress.perks];
  }

  setProgress(p: Progress): void {
    this.progress = p;
    void this.services.save.save(p).catch(() => {});
  }

  soundOn(): boolean {
    return this.progress.settings.sound;
  }

  setSound(on: boolean): void {
    this.services.audio.setEnabled(on);
    this.setProgress({ ...this.progress, settings: { ...this.progress.settings, sound: on } });
  }
}

let services: Services | null = null;
let context: GameContext | null = null;

export function provideServices(s: Services): void {
  services = s;
}

export function getServices(): Services {
  if (!services) throw new Error('services not provided');
  return services;
}

export function setContext(c: GameContext): void {
  context = c;
}

export function ctx(): GameContext {
  if (!context) throw new Error('game context not ready (Boot has not finished)');
  return context;
}
