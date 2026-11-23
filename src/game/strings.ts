// Every player-facing string (English only for the MVP). Scenes never inline literals.
import type { BoonId } from '../core';
import { GAME_TITLE } from './config';

/** Display names of the five gem powers, by gem colour (0 ruby .. 4 amethyst). */
export const POWER_NAMES = ['Wildfire', 'Tidal Wave', 'Earthshaker', 'Chain Lightning', 'Drill'] as const;

/** Relic boons: name, the short banner effect ("Chalice: Powers +1") and the one-line tooltip. */
export const BOONS: Readonly<Record<BoonId, { name: string; banner: string; tip: string }>> = {
  sun_coin: { name: 'Sun Coin', banner: '+2 moves', tip: '+2 moves when found.' },
  chalice: { name: 'Chalice', banner: 'Powers +1', tip: 'New powers charge 1 level higher.' },
  compass: { name: 'Compass', banner: 'Dirt +1', tip: 'Clears deal +1 damage to dirt.' },
  star_amulet: { name: 'Star Amulet', banner: 'Free power!', tip: 'Gives a random power when found.' },
  ancient_key: { name: 'Ancient Key', banner: 'Crusts crack', tip: 'Crusts lose 1 HP now; chips count double.' },
  crowned_ring: { name: 'Crowned Ring', banner: 'Charge easier', tip: 'Powers need 1 fewer gem to charge.' },
};

export const STRINGS = {
  title: GAME_TITLE,
  level: (n: number) => `Level ${n}`,
  hard: 'HARD',
  boss: 'BOSS',
  bossLevel: 'BOSS LEVEL',
  bossSub: 'Lots of relics!',
  infinite: '∞',
  movesLabel: 'Moves',
  depthLabel: 'Depth',
  depthValue: (rows: number) => `${rows}m`,

  // Tutorial (at most 4 words each)
  tutTap: 'Tap matching gems',
  tutDirt: 'Break the dirt',
  tutCharge: 'Clear 6+ for power',
  tutArm: 'Tap to arm',
  tutUse: 'Tap the board',
  tutBedrock: 'Powers break stone',

  // Powers
  armedHint: 'Tap the board',
  armedHintFree: 'Free! Tap the board',
  powerLevel: (name: string, level: number) => `${name} Lv${level}`,
  levelUp: (level: number) => `Lv${level}!`,

  // In-play toasts
  usePower: 'Use a power!',
  shuffled: 'Shuffle!',
  rescuePower: 'Free power!',
  powerSkipped: (name: string, level: number) => `Tray full: ${name} Lv${level} skipped`,
  geodePower: 'Geode power!',
  bonusMoves: (n: number) => `+${n}`,
  boonBanner: (name: string, effect: string) => `${name}: ${effect}`,
  bonusRelic: 'Bonus relic!',
  tokenEarned: 'Reforge token!',

  // Level end
  winTitle: 'Level Complete!',
  hardWin: 'Hard level beaten!',
  bossWin: 'Boss defeated!',
  movesLeft: (n: number) => `Moves left: ${n}`,
  relicsFound: (found: number, goal: number) => `Relics ${Math.min(found, goal)}/${goal}`,
  bonusFound: (n: number) => `+${n} bonus`,
  tokensWon: (n: number) => `+${n}`,
  next: 'Next',
  failTitle: 'Out of Moves',
  failBody: 'So close! Keep digging?',
  failBodyFinal: 'The relics stay buried... for now.',
  failRandom: 'New gems every try!',
  continuePlus: '+5 Moves',
  continueFree: 'Free, once per level',
  retry: 'Retry',
  levels: 'Levels',
  allDoneTitle: "You've dug it all!",
  allDoneBody: 'More levels soon.',
  allDoneHint: 'Replay any level to earn more stars.',

  // Perk offer (after a perk point)
  perkPointTitle: 'Perk point!',
  perkOfferSubtitle: 'Pick one, or keep the point',
  saveForLater: 'Save for later',

  // Perks screen
  perksTitle: 'Perks',
  perksPoints: (n: number) => `${n}`,
  perksNext: (level: number) => `Next point after level ${level}`,
  perksAllPoints: 'All perk points earned',
  perksTapToLearn: 'Tap a glowing perk to learn it',
  perksNoPoints: 'Earn points by beating levels',
  perksNextTry: 'Changes apply from your next try',
  perkLearn: 'Learn',
  perkOwned: 'Learned',
  perkLocked: 'Needs a perk point',
  reforge: 'Reforge',
  reforgeTitle: 'Reforge all perks?',
  reforgeBody: (n: number) => `Uses 1 reforge token. Your ${n} perk${n === 1 ? '' : 's'} turn back into points to spend again.`,
  reforgeYes: 'Reforge',
  reforgeHint: 'Tokens: 3-star wins, big groups, bonus relics',

  // Level select
  levelSelectTitle: 'Levels',
  starsTotal: (n: number, max: number) => `${n} / ${max}`,

  // Settings
  settingsTitle: 'Settings',
  sound: 'Sound',
  on: 'On',
  off: 'Off',
  mutedByHost: 'Muted by the site',
  restartLevel: 'Restart level',
  restartNote: 'New gems, same level',
  resetProgress: 'Reset progress',
  resetConfirmTitle: 'Reset all progress?',
  resetConfirmBody: 'Stars, unlocked levels and perks will be lost.',
  resetYes: 'Reset',
  cancel: 'Cancel',
  close: 'Close',
  credits: 'Art and sound made in code',

  // Debug overlay (tester-facing)
  debugTitle: 'Playtest data',
  debugCopy: 'Copy JSON',
  debugDownload: 'Download JSON',
  debugCopied: 'Copied!',
  debugCopyFailed: 'Copy failed',
  debugKeys: 'Keys: N win level, R restart, P perks on/off',
  debugPerksOff: 'Perks OFF (debug)',
  debugHeader: ['Lvl', 'Tries', 'Win%', 'Bad%', 'Pow', 'Boon'] as const,
  debugTotals: (sessions: number, avgMin: string, events: number) =>
    `Sessions ${sessions} | avg ${avgMin} min | ${events} events`,
} as const;

export type Strings = typeof STRINGS;
