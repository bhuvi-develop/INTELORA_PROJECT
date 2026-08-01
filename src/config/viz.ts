/* ───────────────────────────────────────────────────────────────────────────
 * Visualisation tokens.
 *
 * Recharts writes colours as SVG presentation attributes, and CSS custom
 * properties do not resolve inside attribute values. Chart colour therefore
 * cannot ride the CSS variable layer that the rest of the interface uses — it
 * has to be real strings in JavaScript, swapped when the theme changes.
 *
 * The exported palettes are mutated in place by `applyVizTheme` so that any
 * function reading `SERIES[0]` at call time picks up the active theme. Values
 * captured once at module scope will not, which is why the few module-level
 * series constants in the codebase are built inside their component instead.
 *
 * Both palettes are SELECTED, not flipped. Each was validated independently
 * against its own surface for the lightness band, chroma floor, colour-vision
 * separation, normal-vision floor and contrast:
 *
 *   dark  (#0E1421) — worst adjacent CVD ΔE 8.4 protan, normal-vision 19.3
 *   light (#F6F8FC) — worst adjacent CVD ΔE 9.1 protan, normal-vision 19.6
 *
 * The light palette carries a contrast obligation: orange, aqua, yellow and
 * magenta sit below 3:1 against a light surface, so every chart using them
 * ships visible labels — legends, end labels or in-cell values — which is the
 * documented relief for that condition. Do not remove those labels.
 * ─────────────────────────────────────────────────────────────────────────── */

export type VizTheme = 'dark' | 'light';

/* ─── Categorical series, in fixed order and never cycled ────────────────── */

const SERIES_DARK = [
  '#3D8EF0', // 1 blue
  '#D95926', // 2 orange
  '#199E70', // 3 aqua
  '#C98500', // 4 yellow
  '#D55181', // 5 magenta
  '#008300', // 6 green
  '#8A7DE4', // 7 violet
  '#E66767', // 8 red
] as const;

const SERIES_LIGHT = [
  '#2A78D6', // 1 blue
  '#EB6834', // 2 orange
  '#1BAF7A', // 3 aqua
  '#EDA100', // 4 yellow
  '#E87BA4', // 5 magenta
  '#008300', // 6 green
  '#4A3AA7', // 7 violet
  '#E34948', // 8 red
] as const;

/**
 * Live categorical palette. Mutated in place on theme change — read it at call
 * time, never copy it into a module-level constant.
 */
export const SERIES: string[] = [...SERIES_DARK];

/** Safe subset for all-pairs comparison forms (scatter, bubble, matrix). */
export const SERIES_ALLPAIRS: string[] = SERIES.slice(0, 3);

/* ─── Sequential ramps ──────────────────────────────────────────────────── */

/**
 * Density ramp, ordered near-zero → maximum.
 *
 * On a dark surface a near-zero cell must recede toward the surface, so the ramp
 * runs dark to bright. On a light surface it runs light to dark. Same encoding
 * intent, opposite direction — an inverted ramp reads as "empty is important".
 */
const RAMP_DARK = ['#1C5CAB', '#256ABF', '#2A78D6', '#3987E5', '#5598E7', '#86B6EF'] as const;
const RAMP_LIGHT = ['#CDE2FB', '#9EC5F4', '#6DA7EC', '#3987E5', '#2A78D6', '#1C5CAB'] as const;

export const ORDINAL_BLUE: string[] = [...RAMP_DARK];

/** Full sequential range, for continuous magnitude. */
export const SEQUENTIAL_BLUE = [
  '#CDE2FB',
  '#B7D3F6',
  '#9EC5F4',
  '#86B6EF',
  '#6DA7EC',
  '#5598E7',
  '#3987E5',
  '#2A78D6',
  '#256ABF',
  '#1C5CAB',
  '#184F95',
] as const;

/* ─── Reserved status palette — never themed, never a series colour ─────── */

export const STATUS_COLOR = {
  good: '#0CA30C',
  warning: '#FAB219',
  serious: '#EC835A',
  critical: '#D03B3B',
} as const;

/**
 * Ink for text sitting on a saturated status or ramp fill. Fixed, because the
 * fill it sits on is saturated in both themes — flipping this with the theme
 * would put light text on a light-yellow cell.
 */
export const ON_FILL_INK = '#05070C';

/* ─── Chart chrome ──────────────────────────────────────────────────────── */

interface ChromeTokens {
  chart: string;
  page: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  gridline: string;
  baseline: string;
  border: string;
  /** Crosshair stroke on hover. */
  cursor: string;
  /** Column highlight behind a hovered bar. */
  barCursor: string;
  /** Track behind a radial arc. */
  track: string;
  /** Reference marker on a radial arc. */
  marker: string;
}

const CHROME_DARK: ChromeTokens = {
  chart: '#0E1421',
  page: '#05070C',
  inkPrimary: '#E8EEF9',
  inkSecondary: '#A9B6CC',
  inkMuted: '#7A8699',
  gridline: 'rgba(255,255,255,0.06)',
  baseline: '#2A3547',
  border: 'rgba(255,255,255,0.10)',
  cursor: 'rgba(255,255,255,0.22)',
  barCursor: 'rgba(255,255,255,0.035)',
  track: 'rgba(255,255,255,0.07)',
  marker: 'rgba(255,255,255,0.55)',
};

const CHROME_LIGHT: ChromeTokens = {
  chart: '#F6F8FC',
  page: '#FFFFFF',
  inkPrimary: '#0F1724',
  inkSecondary: '#4A5A6E',
  inkMuted: '#64738A',
  gridline: 'rgba(22,33,52,0.085)',
  baseline: '#CFD9E7',
  border: 'rgba(22,33,52,0.12)',
  cursor: 'rgba(22,33,52,0.3)',
  barCursor: 'rgba(22,33,52,0.045)',
  track: 'rgba(22,33,52,0.08)',
  marker: 'rgba(22,33,52,0.45)',
};

/** Live chrome tokens. Mutated in place on theme change. */
export const SURFACE: ChromeTokens = { ...CHROME_DARK };

/* ─── Telemetry channel identity ────────────────────────────────────────── */

/**
 * Fixed channel-to-slot assignment, so a channel keeps its identity across every
 * chart regardless of which others are on screen. The slot is stable; only the
 * hue behind it changes with the theme.
 */
const CHANNEL_SLOT: Record<string, number> = {
  voltage: 0,
  current: 2,
  power: 1,
  energy: 6,
  frequency: 4,
  powerFactor: 5,
  temperature: 3,
  health: 0,
};

export const CHANNEL_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(CHANNEL_SLOT).map(([key, slot]) => [key, SERIES[slot]]),
);

/* ─── Theme application ─────────────────────────────────────────────────── */

let activeTheme: VizTheme = 'dark';

export const currentVizTheme = (): VizTheme => activeTheme;

/**
 * Swap every chart token to the given theme, in place.
 *
 * Called by the theme provider before the DOM attribute flips, so the first
 * render after a switch already has the correct palette and no chart paints a
 * frame in the outgoing theme.
 */
export const applyVizTheme = (theme: VizTheme): void => {
  activeTheme = theme;

  const series = theme === 'light' ? SERIES_LIGHT : SERIES_DARK;
  const ramp = theme === 'light' ? RAMP_LIGHT : RAMP_DARK;
  const chrome = theme === 'light' ? CHROME_LIGHT : CHROME_DARK;

  // Mutate rather than reassign: consumers hold the array reference.
  SERIES.length = 0;
  SERIES.push(...series);

  SERIES_ALLPAIRS.length = 0;
  SERIES_ALLPAIRS.push(...series.slice(0, 3));

  ORDINAL_BLUE.length = 0;
  ORDINAL_BLUE.push(...ramp);

  Object.assign(SURFACE, chrome);

  for (const [key, slot] of Object.entries(CHANNEL_SLOT)) {
    CHANNEL_COLOR[key] = series[slot];
  }
};

/* ─── Ramp helpers ──────────────────────────────────────────────────────── */

/** Health score → ramp step, for dense bars and heat cells. */
export const healthRampColor = (score: number): string => {
  const clamped = Math.min(100, Math.max(0, score));
  const index = Math.round((clamped / 100) * (ORDINAL_BLUE.length - 1));
  return ORDINAL_BLUE[index];
};

/** Density value → ramp step. Zero recedes toward the chart surface. */
export const densityRampColor = (value: number, max: number): string => {
  if (max <= 0 || value <= 0) return activeTheme === 'light' ? 'rgba(22,33,52,0.04)' : 'rgba(255,255,255,0.035)';
  const t = Math.min(1, value / max);
  const index = Math.min(ORDINAL_BLUE.length - 1, Math.floor(t * ORDINAL_BLUE.length));
  return ORDINAL_BLUE[index];
};

/** WCAG relative luminance. */
const relativeLuminance = (color: string): number => {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 0;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Whether a cell filled with `color` needs dark ink on top.
 *
 * Decided by comparing the two candidates and taking whichever actually reads
 * better, rather than by a luminance threshold. A threshold puts a band of
 * mid-tones on the wrong side — mid-blue ramp steps ended up with white text at
 * 2.5:1, which is illegible for the small bold numerals these cells carry.
 * Choosing the higher-contrast option is self-correcting for any fill and any
 * theme, including palettes added later.
 */
export const needsDarkInk = (color: string): boolean =>
  contrastRatio(ON_FILL_INK, color) >= contrastRatio('#FFFFFF', color);

export const CHART_MARK = {
  strokeWidth: 2,
  dotRadius: 4,
  activeDotRadius: 5,
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  barGapPx: 2,
  gridDash: '3 6',
} as const;
