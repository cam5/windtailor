import resolveConfig from "tailwindcss/resolveConfig.js";
import defaultConfig from "tailwindcss/defaultConfig.js";
import { parseColor, type Rgb255 } from "./color.js";
import { parseLengthPx } from "./units.js";

export interface StockLength {
  key: string;
  px: number;
}

export interface StockColor {
  key: string;
  rgb: Rgb255;
}

export interface StockTheme {
  spacing: StockLength[];
  fontSize: StockLength[];
  radius: StockLength[];
  colors: StockColor[];
}

let cached: StockTheme | undefined;

/** Flattens Tailwind's resolved default theme into lookup tables keyed by pixel/rgb value. */
export function loadStockTheme(): StockTheme {
  if (cached) return cached;

  const full = resolveConfig(defaultConfig) as unknown as {
    theme: {
      spacing: Record<string, string>;
      fontSize: Record<string, string | [string, unknown]>;
      borderRadius: Record<string, string>;
      colors: Record<string, string | Record<string, string>>;
    };
  };

  const spacing = flattenLengths(full.theme.spacing);
  const radius = flattenLengths(full.theme.borderRadius);
  const fontSize = flattenLengths(
    Object.fromEntries(
      Object.entries(full.theme.fontSize).map(([key, val]) => [key, Array.isArray(val) ? val[0] : val]),
    ),
  );
  const colors = flattenColors(full.theme.colors);

  cached = { spacing, fontSize, radius, colors };
  return cached;
}

function flattenLengths(scale: Record<string, string>): StockLength[] {
  const out: StockLength[] = [];
  for (const [key, value] of Object.entries(scale)) {
    const px = parseLengthPx(value);
    if (px !== null) out.push({ key, px });
  }
  return out.sort((a, b) => a.px - b.px);
}

function flattenColors(colors: Record<string, string | Record<string, string>>): StockColor[] {
  const out: StockColor[] = [];
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === "string") {
      const rgb = parseColor(value);
      if (rgb) out.push({ key: name, rgb });
    } else {
      for (const [shade, hex] of Object.entries(value)) {
        const rgb = parseColor(hex);
        if (rgb) out.push({ key: `${name}-${shade}`, rgb });
      }
    }
  }
  return out;
}

/** Finds the closest stock scale entry within tolerance (px), or null if nothing is close enough. */
export function nearestLength(scale: StockLength[], px: number, tolerancePx: number): StockLength | null {
  let best: StockLength | null = null;
  let bestDist = Infinity;
  for (const entry of scale) {
    const dist = Math.abs(entry.px - px);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best && bestDist <= tolerancePx ? best : null;
}
