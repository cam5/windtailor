import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTokenTable, DEFAULT_CLUSTER_OPTIONS } from "./cluster.js";
import type { StockTheme } from "./stockTheme.js";
import type { CollectedValues } from "./collect.js";

function emptyCollected(): CollectedValues {
  return { spacing: new Set(), color: new Set(), fontSize: new Set(), radius: new Set() };
}

test("resolves a color to a custom theme key over a stock key when they match the exact same RGB", () => {
  // gray-900 is #111827 in real Tailwind; this synthesizes the same tie without depending on it.
  const rgb = { r: 17, g: 24, b: 39 };
  const stockTheme: StockTheme = {
    spacing: [],
    fontSize: [],
    radius: [],
    colors: [
      { key: "gray-900", rgb, isCustom: false },
      { key: "brand-ink", rgb, isCustom: true },
    ],
  };
  const collected = emptyCollected();
  collected.color.add("#111827");

  const tokens = buildTokenTable(collected, DEFAULT_CLUSTER_OPTIONS, stockTheme);

  assert.equal(tokens.stockMatches.color["#111827"], "brand-ink");
});

test("keeps the first stock key on a tie between two stock colors (no custom entry involved)", () => {
  const rgb = { r: 17, g: 24, b: 39 };
  const stockTheme: StockTheme = {
    spacing: [],
    fontSize: [],
    radius: [],
    colors: [
      { key: "gray-900", rgb, isCustom: false },
      { key: "slate-900", rgb, isCustom: false },
    ],
  };
  const collected = emptyCollected();
  collected.color.add("#111827");

  const tokens = buildTokenTable(collected, DEFAULT_CLUSTER_OPTIONS, stockTheme);

  assert.equal(tokens.stockMatches.color["#111827"], "gray-900");
});
