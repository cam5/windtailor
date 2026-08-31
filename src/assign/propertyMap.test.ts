import { test } from "node:test";
import assert from "node:assert/strict";
import { formatArbitrary, formatScaleClass, nearestBorderWidthSuffix, mapDiscreteValue } from "./propertyMap.js";

test("formatArbitrary wraps the raw value in brackets and replaces whitespace with underscores", () => {
  assert.equal(formatArbitrary("w-", "437px"), "w-[437px]");
  assert.equal(formatArbitrary("bg-", "rgb(1 2 3)"), "bg-[rgb(1_2_3)]");
});

test("formatScaleClass places the sign in front of the prefix for negative scale keys", () => {
  assert.equal(formatScaleClass("mt-", "-1.25"), "-mt-1.25");
  assert.equal(formatScaleClass("top-", "3"), "top-3");
});

test("formatScaleClass leaves arbitrary bracket values untouched, sign and all", () => {
  assert.equal(formatScaleClass("top-", "[-17px]"), "top-[-17px]");
});

test("nearestBorderWidthSuffix snaps to the nearest scale entry", () => {
  assert.equal(nearestBorderWidthSuffix("0px"), "-0");
  assert.equal(nearestBorderWidthSuffix("1px"), "");
  assert.equal(nearestBorderWidthSuffix("2px"), "-2");
  assert.equal(nearestBorderWidthSuffix("3px"), "-2");
  assert.equal(nearestBorderWidthSuffix("6px"), "-4");
  assert.equal(nearestBorderWidthSuffix("100px"), "-8");
});

test("nearestBorderWidthSuffix returns null for unparseable input", () => {
  assert.equal(nearestBorderWidthSuffix("auto"), null);
});

test("mapDiscreteValue resolves display, position, textAlign, fontWeight branches", () => {
  assert.equal(mapDiscreteValue("display", "flex"), "flex");
  assert.equal(mapDiscreteValue("display", "none"), "hidden");
  assert.equal(mapDiscreteValue("position", "absolute"), "absolute");
  assert.equal(mapDiscreteValue("textAlign", "center"), "text-center");
  assert.equal(mapDiscreteValue("fontWeight", "700"), "font-bold");
  assert.equal(mapDiscreteValue("fontWeight", "bold"), "font-bold");
});

test("mapDiscreteValue resolves opacity to the nearest stock step", () => {
  assert.equal(mapDiscreteValue("opacity", "1"), "opacity-100");
  assert.equal(mapDiscreteValue("opacity", "0"), "opacity-0");
  assert.equal(mapDiscreteValue("opacity", "0.47"), "opacity-50");
});

test("mapDiscreteValue resolves per-side border-width using the nearest suffix", () => {
  assert.equal(mapDiscreteValue("borderTopWidth", "2px"), "border-t-2");
  assert.equal(mapDiscreteValue("borderLeftWidth", "1px"), "border-l");
  assert.equal(mapDiscreteValue("borderBottomWidth", "auto"), null);
});

test("mapDiscreteValue returns null for unmapped properties or values", () => {
  assert.equal(mapDiscreteValue("width", "10px"), null);
  assert.equal(mapDiscreteValue("display", "not-a-display-value"), null);
});
