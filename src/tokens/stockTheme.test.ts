import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestLength, type StockLength } from "./stockTheme.js";

function length(key: string, px: number, isCustom = false): StockLength {
  return { key, px, isCustom };
}

test("nearestLength keeps the first-encountered stock entry on an exact tie between two stock entries", () => {
  // Regression guard: an earlier version of this tie-break used a blunt "prefer the later
  // entry" rule, which accidentally flipped ties between two *equally stock* entries too
  // (e.g. real Tailwind spacing "2" (8px) and "2.5" (10px) are both 1px from 9px).
  const scale = [length("2", 8), length("2.5", 10)];

  const match = nearestLength(scale, 9, 2);

  assert.equal(match?.key, "2");
});

test("nearestLength prefers a custom entry over a stock entry on an exact tie, regardless of array order", () => {
  const customFirst = [length("brand", 10, true), length("2.5", 10, false)];
  const stockFirst = [length("2.5", 10, false), length("brand", 10, true)];

  assert.equal(nearestLength(customFirst, 9, 2)?.key, "brand");
  assert.equal(nearestLength(stockFirst, 9, 2)?.key, "brand");
});
