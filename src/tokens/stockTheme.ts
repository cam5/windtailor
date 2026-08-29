import resolveConfig from "tailwindcss/resolveConfig.js";
import defaultConfig from "tailwindcss/defaultConfig.js";
import { parseColor, type Rgb255 } from "./color.js";
import { parseLengthPx } from "./units.js";

export interface StockLength {
  key: string;
  px: number;
  /** True if this entry came from a caller-supplied theme rather than Tailwind's own defaults. */
  isCustom: boolean;
}

export interface StockColor {
  key: string;
  rgb: Rgb255;
  /** True if this entry came from a caller-supplied theme rather than Tailwind's own defaults. */
  isCustom: boolean;
}

export interface StockTheme {
  spacing: StockLength[];
  fontSize: StockLength[];
  radius: StockLength[];
  colors: StockColor[];
}

export interface ResolvedThemeShape {
  theme: {
    spacing: Record<string, string>;
    fontSize: Record<string, string | [string, unknown]>;
    borderRadius: Record<string, string>;
    colors: Record<string, string | Record<string, string>>;
  };
}

/** Flattens an already-resolved Tailwind config's theme into lookup tables keyed by pixel/rgb value. */
export function themeFromResolvedConfig(full: ResolvedThemeShape): StockTheme {
  const spacing = flattenLengths(full.theme.spacing);
  const radius = flattenLengths(full.theme.borderRadius);
  const fontSize = flattenLengths(
    Object.fromEntries(
      Object.entries(full.theme.fontSize).map(([key, val]) => [key, Array.isArray(val) ? val[0] : val]),
    ),
  );
  const colors = flattenColors(full.theme.colors);

  return { spacing, fontSize, radius, colors };
}

let cached: StockTheme | undefined;

/** Loads and flattens Tailwind's resolved *default* theme, cached after the first call. */
export function loadStockTheme(): StockTheme {
  if (cached) return cached;
  const full = resolveConfig(defaultConfig) as unknown as ResolvedThemeShape;
  cached = themeFromResolvedConfig(full);
  return cached;
}

function flattenLengths(scale: Record<string, string>): StockLength[] {
  const out: StockLength[] = [];
  for (const [key, value] of Object.entries(scale)) {
    const px = parseLengthPx(value);
    if (px !== null) out.push({ key, px, isCustom: false });
  }
  return out.sort((a, b) => a.px - b.px);
}

function flattenColors(colors: Record<string, string | Record<string, string>>): StockColor[] {
  const out: StockColor[] = [];
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === "string") {
      const rgb = parseColor(value);
      if (rgb) out.push({ key: name, rgb, isCustom: false });
    } else {
      for (const [shade, hex] of Object.entries(value)) {
        const rgb = parseColor(hex);
        if (rgb) out.push({ key: `${name}-${shade}`, rgb, isCustom: false });
      }
    }
  }
  return out;
}

/**
 * Finds the closest scale entry within tolerance (px), or null if nothing is close enough.
 * On an exact distance tie, a `isCustom` entry wins over a stock one (see markCustomEntries in
 * themeConfig.ts) -- a caller's own theme value should win a tie against Tailwind's default, e.g.
 * a brand color that happens to equal gray-900 exactly. Ties between two stock (or two custom)
 * entries keep the first one encountered, unchanged from before.
 */
export function nearestLength(scale: StockLength[], px: number, tolerancePx: number): StockLength | null {
  let best: StockLength | null = null;
  let bestDist = Infinity;
  for (const entry of scale) {
    const dist = Math.abs(entry.px - px);
    const better = dist < bestDist || (dist === bestDist && entry.isCustom && !best?.isCustom);
    if (better) {
      bestDist = dist;
      best = entry;
    }
  }
  return best && bestDist <= tolerancePx ? best : null;
}
