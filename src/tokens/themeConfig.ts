import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import resolveConfig from "tailwindcss/resolveConfig.js";
import {
  loadStockTheme,
  themeFromResolvedConfig,
  type ResolvedThemeShape,
  type StockColor,
  type StockLength,
  type StockTheme,
} from "./stockTheme.js";

/**
 * A real tailwind.config.js's `module.exports` has a `theme` key alongside `content`/`plugins`/etc.
 * A minimal file/inline value can skip that wrapper and just be the theme object directly
 * (e.g. `{"extend": {...}}}`). Both shapes are accepted, for both --theme-file and --theme-json.
 */
function extractThemeValue(parsed: unknown): unknown {
  if (parsed && typeof parsed === "object" && "theme" in (parsed as Record<string, unknown>)) {
    return (parsed as Record<string, unknown>).theme;
  }
  return parsed;
}

function markCustomLengths(resolved: StockLength[], stock: StockLength[]): StockLength[] {
  return resolved.map((entry) => {
    const stockEntry = stock.find((s) => s.key === entry.key);
    return { ...entry, isCustom: stockEntry === undefined || stockEntry.px !== entry.px };
  });
}

function markCustomColors(resolved: StockColor[], stock: StockColor[]): StockColor[] {
  return resolved.map((entry) => {
    const stockEntry = stock.find((s) => s.key === entry.key);
    const sameRgb =
      stockEntry !== undefined &&
      stockEntry.rgb.r === entry.rgb.r &&
      stockEntry.rgb.g === entry.rgb.g &&
      stockEntry.rgb.b === entry.rgb.b;
    return { ...entry, isCustom: !sameRgb };
  });
}

/**
 * A caller's theme is resolved (extend-merged) against Tailwind's own defaults by resolveConfig,
 * same as the stock path, so this just flags which resulting entries are actually different from
 * stock — new key, or same key with a different value — so nearestLength/clusterColors can prefer
 * them on an exact-distance tie against a stock entry (see the comments there).
 */
function markCustomEntries(theme: StockTheme): StockTheme {
  const stock = loadStockTheme();
  return {
    spacing: markCustomLengths(theme.spacing, stock.spacing),
    fontSize: markCustomLengths(theme.fontSize, stock.fontSize),
    radius: markCustomLengths(theme.radius, stock.radius),
    colors: markCustomColors(theme.colors, stock.colors),
  };
}

/** Same resolveConfig() path the stock theme uses — Tailwind's own extend-adds/bare-key-replaces semantics, for free. */
function resolveThemeObject(theme: unknown): StockTheme {
  const full = resolveConfig({ theme } as Parameters<typeof resolveConfig>[0]) as unknown as ResolvedThemeShape;
  return markCustomEntries(themeFromResolvedConfig(full));
}

/** .json is parsed as data; .js/.cjs/.mjs is dynamically imported, mirroring how Tailwind's own CLI loads user configs. */
export async function loadThemeFromFile(filePath: string): Promise<StockTheme> {
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;
  if (ext === ".json") {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } else {
    const mod: unknown = await import(pathToFileURL(path.resolve(filePath)).href);
    parsed = (mod as { default?: unknown }).default ?? mod;
  }
  return resolveThemeObject(extractThemeValue(parsed));
}

export function loadThemeFromJson(json: string): StockTheme {
  return resolveThemeObject(extractThemeValue(JSON.parse(json)));
}
