// Art palette: every colour used by the code-drawn art lives here as a named token.
// Direction: bright, glossy jewel tones on warm earth strata. Hex strings (CSS) so the
// canvas-2D painters can use them directly; use `hexToInt` for Phaser tint/fill APIs.

export interface GemTone {
  /** Mid body colour. */
  base: string;
  /** Lit facets. */
  light: string;
  /** Shadowed facets. */
  dark: string;
  /** Near-white specular / table glare (tinted). */
  highlight: string;
  /** Outline: a deep, slightly desaturated version of the body. */
  edge: string;
  /** Glow halo for the highlighted (pressed / group) state. */
  glow: string;
}

/** Indexed by GemColor: 0 ruby, 1 sapphire, 2 emerald, 3 topaz, 4 amethyst. */
export const GEM: readonly GemTone[] = [
  // ruby: hot cherry red, warm
  { base: '#e8203f', light: '#ff6a7a', dark: '#9a0b2a', highlight: '#ffe1e4', edge: '#5a0618', glow: '#ff5d73' },
  // sapphire: electric royal blue
  { base: '#1f6cf0', light: '#5fb0ff', dark: '#0f3a9e', highlight: '#e3f3ff', edge: '#0a1f5c', glow: '#5aa8ff' },
  // emerald: vivid green
  { base: '#14b85a', light: '#5ff08f', dark: '#077a3a', highlight: '#e2ffe9', edge: '#03431f', glow: '#4ff08a' },
  // topaz: golden amber / yellow
  { base: '#ffb61c', light: '#ffe45c', dark: '#d0700a', highlight: '#fffbe0', edge: '#7a3a04', glow: '#ffd84a' },
  // amethyst: rich violet
  { base: '#a03be8', light: '#d68bff', dark: '#5f17a8', highlight: '#f6e6ff', edge: '#330a63', glow: '#c77dff' },
];

/** Warm earth strata, top (surface) to deep. Each band: [top, bottom] gradient stops + accents. */
export interface EarthBand {
  name: string;
  top: string;
  bottom: string;
  /** Sediment line / darker streak colour. */
  line: string;
  /** Pebble / fleck colour (lighter). */
  fleck: string;
}

export const EARTH: readonly EarthBand[] = [
  { name: 'sand',       top: '#f6d9a3', bottom: '#ecc27f', line: '#d9a865', fleck: '#fff0cf' },
  { name: 'clay',       top: '#e6ae6f', bottom: '#d9955a', line: '#c07a42', fleck: '#f4cb96' },
  { name: 'ochre',      top: '#d38b42', bottom: '#c27434', line: '#a65c25', fleck: '#eab070' },
  { name: 'terracotta', top: '#b9603a', bottom: '#a44e30', line: '#863b23', fleck: '#d98a62' },
  { name: 'umber',      top: '#8a4e2e', bottom: '#733f25', line: '#5c2f1a', fleck: '#a8704a' },
  { name: 'deep umber', top: '#62361f', bottom: '#4f2b19', line: '#3d2012', fleck: '#83543a' },
];

/** Board well (recessed area behind the cells) and empty-cell slot. */
export const BOARD = {
  well: '#3b2216',
  wellAlpha: 0.72,
  slot: '#4a2c1c',
  slotEdge: '#2c180e',
  slotLight: '#6a432c',
  frame: '#7a4a28',
  frameLight: '#c98e52',
  frameDark: '#3a1f10',
} as const;

/** Dirt (breakable packed soil), by hp. Index 1..3 (index 0 unused). */
export const DIRT = {
  body: ['#000000', '#a8703f', '#9a6234', '#8a552b'],
  light: ['#000000', '#c99560', '#bd8752', '#b07a46'],
  dark: ['#000000', '#6e4422', '#64391b', '#583116'],
  edge: '#3c2310',
  pebble: '#d8b78a',
  pebbleDark: '#7a5534',
  crack: '#2e1a0b',
  crackLight: '#d9a96e',
} as const;

/** Crust: sandstone/clay shell around a relic. Cracks leak golden relic light. */
export const CRUST = {
  body: '#d79a5c',
  light: '#f1c48a',
  dark: '#a8683a',
  edge: '#5e3418',
  plate: '#c88648',
  crack: '#4a2510',
  leak: '#ffe07a',
  leakGlow: 'rgba(255, 214, 90, 0.75)',
} as const;

/** Bedrock: cool dark basalt/slate. Deliberately NOT warm so it reads as a different, unbreakable material. */
export const BEDROCK = {
  body: '#3a4150',
  bodyDeep: '#2a303c',
  light: '#7c879c',
  sheen: '#b9c6dc',
  dark: '#171b23',
  edge: '#0d1016',
  fleck: '#5f6a7e',
  vein: '#8d99b0',
} as const;

/** Stamp / tool: forged steel faces with gold frames. */
export const STEEL = {
  face: '#9aa6b8',
  faceLight: '#e4ebf5',
  faceDark: '#5b6678',
  edge: '#262d38',
} as const;

export const GOLD = {
  base: '#f2b631',
  light: '#ffe58a',
  highlight: '#fffbe3',
  dark: '#b0700f',
  deep: '#7a4307',
  edge: '#5a2f05',
} as const;

/** UI tokens. */
export const UI = {
  panel: '#fff0d4',
  panelLow: '#f4d9a6',
  panelEdge: '#8c4f26',
  panelEdgeDark: '#4e2a12',
  panelEdgeLight: '#c98448',
  panelDark: '#4a2a18',
  panelDarkEdge: '#24130a',
  text: '#4a2a14',
  textLight: '#fff7e6',
  textShadow: '#2a1608',
  accentGold: GOLD.base,
  button: '#3fc25a',
  buttonLight: '#8af08e',
  buttonDark: '#1f8a3a',
  buttonEdge: '#0f4a1e',
  buttonPressed: '#2ea548',
  star: GOLD.base,
  starEmpty: '#6b4128',
  starEmptyDark: '#3d2214',
  iconInk: '#3a200e',
  white: '#ffffff',
  danger: '#e8423a',
  ok: '#4fe07a',
} as const;

/** Perk path colours: primary, secondary, deep (badge rim). */
export const PATH = {
  jeweler:       { primary: '#26d4e8', secondary: '#ff5f9e', deep: '#0b5a73' },
  archaeologist: { primary: '#e2b273', secondary: '#1fa6a0', deep: '#6b4320' },
  alchemist:     { primary: '#8b4fe0', secondary: '#5be06a', deep: '#36156b' },
  blacksmith:    { primary: '#ff7a1f', secondary: '#6d7787', deep: '#4a1d08' },
} as const;

/** Effects: sparks, dust, glints. */
export const FX = {
  spark: '#fff6c2',
  sparkCore: '#ffffff',
  sparkGlow: 'rgba(255, 200, 80, 0.8)',
  dust: '#c99766',
  glint: '#ffffff',
  ghostOk: '#ffe27a',
  ghostBad: '#ff4a3a',
  shadow: 'rgba(30, 12, 4, 0.45)',
} as const;

/** '#rrggbb' -> 0xrrggbb for Phaser APIs (tint, fillStyle, camera background). */
export function hexToInt(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}
