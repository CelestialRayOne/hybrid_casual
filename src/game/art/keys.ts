// Frame names for all code-drawn art. Everything except the background lives in ONE atlas texture
// (`ART_ATLAS`); use `scene.add.image(x, y, ART_ATLAS, gemKey(0))`. Names are size-independent:
// `registerTextures` repaints the same atlas and frames in place when called with a new cell size.
// The atlas may span several 2048-px pages at large cell sizes; that is internal (one texture key,
// frames know their page), so callers never need to care which page a frame lives on.

// Local structural types (deliberately NOT imported from src/core, which is being reworked).
type GemColor = 0 | 1 | 2 | 3 | 4;
export type PathId = 'jeweler' | 'archaeologist' | 'alchemist' | 'blacksmith';

/** Texture key of the art atlas. */
export const ART_ATLAS = 'art';

export const GEM_COUNT = 5;
export const RELIC_COUNT = 6;

export const gemKey = (c: GemColor | number): string => `gem_${c}`;
/** Same size as gemKey; brighter body plus a soft halo for the pressed/group highlight state. */
export const gemGlowKey = (c: GemColor | number): string => `gem_${c}_glow`;

/** hp 1..3 (3 = intact, 1 = badly cracked). */
export const dirtKey = (hp: number): string => `dirt_${Math.max(1, Math.min(3, hp))}`;

/** Crust overlay drawn on top of the relic. hp 2 or 1. `big` = 2x2 relic (texture is 2 cells wide). */
export const crustKey = (hp: number, big = false): string =>
  `crust_${big ? 'big_' : ''}${Math.max(1, Math.min(2, hp))}`;

/** Relic icon. `big` = native 2x2-cell texture (sharper than scaling the 1x1). */
export const relicKey = (variant: number, big = false): string =>
  `relic_${big ? 'big_' : ''}${((variant % RELIC_COUNT) + RELIC_COUNT) % RELIC_COUNT}`;

/** Bedrock neighbour mask bits: set the bit when the neighbour on that side belongs to the SAME piece. */
export const BEDROCK_N = 1;
export const BEDROCK_E = 2;
export const BEDROCK_S = 4;
export const BEDROCK_W = 8;
export const bedrockTile = (mask: number): string => `bedrock_${mask & 15}`;
/** Alias of the isolated tile (mask 0). */
export const BEDROCK = 'bedrock_0';

export const CELL_SLOT = 'cell_slot';
export const BOARD_FRAME = 'board_frame';

export const SPARK = 'spark';
export const shardKey = (c: GemColor | number): string => `shard_${c}`;
export const DUST = 'dust';
export const GLINT = 'glint';
/** Soft radial light (white), tint it for relic reveal glows. */
export const GLOW = 'glow';

export const PANEL = 'panel';
export const PANEL_DARK = 'panel_dark';
export const BUTTON = 'button';
export const BUTTON_PRESSED = 'button_pressed';
export const STAR_FULL = 'star_full';
export const STAR_EMPTY = 'star_empty';
export const ICON_MOVES = 'icon_moves';
export const ICON_DEPTH = 'icon_depth';
export const ICON_RELIC = 'icon_relic';
export const ICON_SOUND_ON = 'icon_sound_on';
export const ICON_SOUND_OFF = 'icon_sound_off';
export const ICON_SETTINGS = 'icon_settings';
export const ICON_BACK = 'icon_back';
export const ICON_LEVELS = 'icon_levels';
export const ICON_RESTART = 'icon_restart';
export const ICON_BIN = 'icon_bin';
export const LOCK = 'lock';
export const HAND = 'hand';
export const perkKey = (path: PathId): string => `perk_${path}`;

// ---------------------------------------------------------------------------------------------
// v2 frames
// ---------------------------------------------------------------------------------------------

/** Power ids by gem colour: 0 ruby Wildfire, 1 sapphire Tidal Wave, 2 emerald Earthshaker, 3 topaz Chain Lightning, 4 amethyst Drill. */
export const POWER_NAMES = ['wildfire', 'tidal', 'earthshaker', 'lightning', 'drill'] as const;
/** Tray token for the power of gem colour `c` (round gem-coloured badge with the power symbol). Size `ArtMetrics.power`. */
export const powerKey = (c: GemColor | number): string => `power_${c}`;
/** Level pips (size `ArtMetrics.pip`): show `level` ON pips and `5 - level` OFF pips under the token (see `pipOffsets`). */
export const POWER_PIP_ON = 'power_pip_on';
export const POWER_PIP_OFF = 'power_pip_off';
export const POWER_MAX_LEVEL = 5;
/**
 * Pip centres relative to the token centre, for a token displayed at `tokenPx` and pips at `pipPx`:
 * a straight row just under the token's bottom rim. Pip i < level uses POWER_PIP_ON.
 */
export function pipOffsets(tokenPx: number, pipPx: number, count = POWER_MAX_LEVEL): [number, number][] {
  const out: [number, number][] = [];
  const mid = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    const k = i - mid;
    out.push([k * pipPx * 1.18, tokenPx * 0.56]);
  }
  return out;
}
/** White glow ring drawn around an armed tray token (size `ArtMetrics.armedRing`); tint with GEM[c].glow, pulse alpha/scale. */
export const POWER_ARMED_RING = 'power_armed_ring';
/** Board cursor for an armed power (size `ArtMetrics.reticle`, about 1.4 cells); white, tint with GEM[c].glow. */
export const POWER_RETICLE = 'power_reticle';
/** Empty power slot socket for the tray (size `ArtMetrics.traySlot`). */
export const TRAY_SLOT = 'tray_slot';

/** Geode gem: same silhouette and colour as gemKey(c), with a gold rim, iridescent sheen and a crystal sparkle. */
export const geodeKey = (c: GemColor | number): string => `geode_${c}`;
/** Rainbow-tinted twinkle particle for geodes (size `ArtMetrics.glint`). */
export const GEODE_GLINT = 'geode_glint';

/** FX sprites (sizes in ArtMetrics, all centred). White/near-white ones are meant to be tinted. */
export const FX_FLAME = 'fx_flame';
/** Three flame shapes for flicker: cycle frames or pick at random per particle. */
export const FX_FLAME_FRAMES: readonly string[] = ['fx_flame', 'fx_flame_1', 'fx_flame_2'];
export const FX_EMBER = 'fx_ember';
export const FX_WATER_DROP = 'fx_water_drop';
/** One cell wide, seamless left/right: lay one per cell along a row (rotate 90 deg for a column). */
export const FX_WAVE_STREAK = 'fx_wave_streak';
export const FX_ROCK = 'fx_rock';
export const FX_ROCK_FRAMES: readonly string[] = ['fx_rock', 'fx_rock_1', 'fx_rock_2'];
/** White ring (2 cells across); scale up + fade. Tint for the power colour. */
export const FX_SHOCK_RING = 'fx_shock_ring';
/** Horizontal lightning segment (origin 0,0.5 at its left end); stretch scaleX to the distance, rotate. See also fx.ts drawLightningBolt. */
export const FX_BOLT_SEGMENT = 'fx_bolt_segment';
/** Big drill head pointing DOWN (1 cell wide, 1.4 tall). Spin illusion: flip scaleX back and forth quickly. */
export const FX_DRILL_BIT = 'fx_drill_bit';
export const FX_SPARK_BLUE = 'fx_spark_blue';
export const FX_SPARK_GREEN = 'fx_spark_green';

/** HUD boon badge for relic type `v` (relic icon on a small round plate). Size `ArtMetrics.boon`. */
export const boonKey = (v: number): string => `boon_${((v % RELIC_COUNT) + RELIC_COUNT) % RELIC_COUNT}`;
/** Red count bubble to put on a boon's top-right corner; draw the stack count text on it. Size `ArtMetrics.bubble`. */
export const BOON_STACK_BUBBLE = 'boon_stack_bubble';
/** HUD goal slots (cell-sized): an empty relic socket, and a bonus-relic socket with a small gold "+" star. */
export const RELIC_SLOT_EMPTY = 'relic_slot_empty';
export const RELIC_SLOT_BONUS = 'relic_slot_bonus';

export const PERK_IDS = [
  'jeweler_brilliant', 'jeweler_flawless', 'arch_softcrust', 'arch_treasure',
  'alch_transmute', 'alch_volatile', 'smith_toolbelt', 'smith_tempered',
] as const;
export type PerkIconId = (typeof PERK_IDS)[number];
/** Individual perk badge (path-coloured round badge with a symbol). Size `ArtMetrics.perk`. */
export const perkIconKey = (id: PerkIconId): string => `perk_icon_${id}`;
/** Perks-screen node frames (size `ArtMetrics.perkNode`); draw the perk icon on top at 0.7 of the node size
 *  (the state medal sits on the bottom-right rim, outside the icon). */
export const PERK_NODE_OWNED = 'perk_node_owned';
export const PERK_NODE_AVAILABLE = 'perk_node_available';
/** Locked: dark iron socket with a lock medal at the bottom right. Draw the icon tinted 0x8a8a8a, alpha ~0.55. */
export const PERK_NODE_LOCKED = 'perk_node_locked';
/** Counter icons (size `ArtMetrics.token`). */
export const PERK_POINT = 'perk_point';
export const REFORGE_TOKEN = 'reforge_token';
/** Level badges (size `ArtMetrics.badge`): boss level crest (horned stone idol with a crown gem), hard level shield. */
export const BADGE_BOSS = 'badge_boss';
export const BADGE_HARD = 'badge_hard';
/** "BOSS LEVEL" intro banner ribbon (ArtMetrics.bossBannerW x bossBannerH). Nine-slice friendly horizontally:
 *  nineslice(x, y, ART_ATLAS, BOSS_BANNER, w, h, bossBannerInset, bossBannerInset, 0, 0). Draw the text on it. */
export const BOSS_BANNER = 'boss_banner';
/** Level-select tile for a boss level (square `ArtMetrics.levelTile`; nine-slice it with `panelInset` like PANEL): violet face in a gold rim. Draw the number on it and put BADGE_BOSS on its top-right corner. */
export const LEVEL_TILE_BOSS = 'level_tile_boss';

/** Standalone texture KEY (not an atlas frame) for the strata backdrop. */
export const BACKGROUND = 'bg_strata';
