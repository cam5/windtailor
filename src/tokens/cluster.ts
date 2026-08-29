import type { GeneratedToken, TokenCategory, TokenTable } from "../model/types.js";
import { parseColor, colorDistance, toHex, type Rgb255 } from "./color.js";
import { loadStockTheme, nearestLength, type StockColor, type StockLength, type StockTheme } from "./stockTheme.js";
import { parseLengthPx, pxToRem, trimTrailingZeros } from "./units.js";
import type { CollectedValues } from "./collect.js";

export interface ClusterOptions {
  spacingTolerancePx: number;
  radiusTolerancePx: number;
  fontSizeTolerancePx: number;
  colorTolerance: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  spacingTolerancePx: 2,
  radiusTolerancePx: 2,
  fontSizeTolerancePx: 1,
  colorTolerance: 24,
};

/** Pass 1: snap observed values to the stock/custom theme scale where they fit, cluster the rest into new tokens. */
export function buildTokenTable(
  collected: CollectedValues,
  options: ClusterOptions = DEFAULT_CLUSTER_OPTIONS,
  stockTheme: StockTheme = loadStockTheme(),
): TokenTable {
  const stock = stockTheme;

  const spacing = clusterLengths(collected.spacing, stock.spacing, options.spacingTolerancePx, "spacing", (px) =>
    trimTrailingZeros(px / 4),
  );
  const radius = clusterLengths(collected.radius, stock.radius, options.radiusTolerancePx, "radius", (px) =>
    trimTrailingZeros(px),
  );
  const fontSize = clusterLengths(collected.fontSize, stock.fontSize, options.fontSizeTolerancePx, "fontSize", (px) =>
    trimTrailingZeros(px),
  );
  const color = clusterColors(collected.color, stock.colors, options.colorTolerance);

  return {
    stockMatches: { spacing: spacing.stockMatches, radius: radius.stockMatches, fontSize: fontSize.stockMatches, color: color.stockMatches },
    generated: { spacing: spacing.generated, radius: radius.generated, fontSize: fontSize.generated, color: color.generated },
    clamped: {
      spacing: spacing.clampedDistance,
      radius: radius.clampedDistance,
      fontSize: fontSize.clampedDistance,
      color: color.clampedDistance,
    },
  };
}

interface ClusterResult {
  stockMatches: Record<string, string>;
  /** raw value -> distance from the exact scale entry it snapped to, only for non-exact matches. */
  clampedDistance: Record<string, number>;
  generated: GeneratedToken[];
}

function clusterLengths(
  rawValues: Set<string>,
  stockScale: StockLength[],
  tolerancePx: number,
  category: TokenCategory,
  keyFromPx: (px: number) => string,
): ClusterResult {
  const stockMatches: Record<string, string> = {};
  const clampedDistance: Record<string, number> = {};
  const unmatched: Array<{ raw: string; px: number }> = [];

  for (const raw of rawValues) {
    const px = parseLengthPx(raw);
    if (px === null) continue; // non-numeric values (auto, none, ...) aren't part of the token pipeline
    const match = nearestLength(stockScale, px, tolerancePx);
    if (match) {
      stockMatches[raw] = match.key;
      const distance = Math.abs(match.px - px);
      if (distance > 0) clampedDistance[raw] = distance;
    } else {
      unmatched.push({ raw, px });
    }
  }

  unmatched.sort((a, b) => a.px - b.px);

  const generated: GeneratedToken[] = [];
  let bucket: Array<{ raw: string; px: number }> = [];
  const flush = () => {
    if (bucket.length === 0) return;
    const centroid = bucket.reduce((sum, v) => sum + v.px, 0) / bucket.length;
    generated.push({
      category,
      key: keyFromPx(centroid),
      value: pxToRem(centroid),
      sourceValues: bucket.map((v) => v.raw),
    });
    bucket = [];
  };

  for (const entry of unmatched) {
    const last = bucket[bucket.length - 1];
    if (last && entry.px - last.px > tolerancePx * 2) flush();
    bucket.push(entry);
  }
  flush();

  return { stockMatches, clampedDistance, generated };
}

function clusterColors(rawValues: Set<string>, stockColors: StockColor[], tolerance: number): ClusterResult {
  const stockMatches: Record<string, string> = {};
  const clampedDistance: Record<string, number> = {};
  const unmatched: Array<{ raw: string; rgb: Rgb255 }> = [];

  for (const raw of rawValues) {
    const rgb = parseColor(raw);
    if (!rgb) continue;
    let best: { key: string; dist: number; isCustom: boolean } | null = null;
    for (const stock of stockColors) {
      const dist = colorDistance(rgb, stock.rgb);
      // On an exact tie, a custom (caller-supplied) color wins over a stock one -- see the
      // matching comment on nearestLength in stockTheme.ts.
      const better = !best || dist < best.dist || (dist === best.dist && stock.isCustom && !best.isCustom);
      if (better) best = { key: stock.key, dist, isCustom: stock.isCustom };
    }
    if (best && best.dist <= tolerance) {
      stockMatches[raw] = best.key;
      if (best.dist > 0) clampedDistance[raw] = best.dist;
    } else {
      unmatched.push({ raw, rgb });
    }
  }

  const generated: GeneratedToken[] = [];
  const clusters: Array<{ centroid: Rgb255; members: Array<{ raw: string; rgb: Rgb255 }> }> = [];

  for (const entry of unmatched) {
    let cluster = clusters.find((c) => colorDistance(c.centroid, entry.rgb) <= tolerance);
    if (!cluster) {
      cluster = { centroid: entry.rgb, members: [] };
      clusters.push(cluster);
    }
    cluster.members.push(entry);
    cluster.centroid = averageRgb(cluster.members.map((m) => m.rgb));
  }

  let nextIndex = nextCustomColorIndex(stockColors);
  for (const cluster of clusters) {
    generated.push({
      category: "color",
      key: `custom-${nextIndex++}`,
      value: toHex(cluster.centroid),
      sourceValues: cluster.members.map((m) => m.raw),
    });
  }

  return { stockMatches, clampedDistance, generated };
}

/**
 * Freshly-minted colors are named `custom-N`. When a --theme-file from a prior run is passed back
 * in, its own `custom-N` entries land in stockColors alongside Tailwind's stock palette, so a naive
 * `index + 1` restart here would reissue an already-used name for a genuinely new color and
 * silently collide with (and overwrite) that earlier mapping. Continuing the counter past the
 * highest `custom-N` already present keeps names unique across runs that accumulate one theme file.
 */
function nextCustomColorIndex(stockColors: StockColor[]): number {
  let max = 0;
  for (const entry of stockColors) {
    const match = /^custom-(\d+)$/.exec(entry.key);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function averageRgb(colors: Rgb255[]): Rgb255 {
  const sum = colors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
  return { r: sum.r / colors.length, g: sum.g / colors.length, b: sum.b / colors.length };
}

/** Resolves a raw computed value to its token key (stock or generated) for a given category, or null if unmapped. */
export function resolveTokenKey(tokens: TokenTable, category: TokenCategory, raw: string): string | null {
  const stockKey = tokens.stockMatches[category][raw];
  if (stockKey) return stockKey;
  const generatedMatch = tokens.generated[category].find((t) => t.sourceValues.includes(raw));
  return generatedMatch?.key ?? null;
}
