import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, colorDistance, toHex } from "./color.js";

test("parseColor parses hex colors", () => {
  assert.deepEqual(parseColor("#111827"), { r: 17, g: 24, b: 39 });
});

test("parseColor parses rgb()/rgba()", () => {
  assert.deepEqual(parseColor("rgb(17, 24, 39)"), { r: 17, g: 24, b: 39 });
  assert.deepEqual(parseColor("rgba(17, 24, 39, 0.5)"), { r: 17, g: 24, b: 39 });
});

test("parseColor parses named colors", () => {
  assert.deepEqual(parseColor("white"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("black"), { r: 0, g: 0, b: 0 });
});

test("parseColor returns null for unparseable input", () => {
  assert.equal(parseColor("not-a-color"), null);
  assert.equal(parseColor(""), null);
});

test("colorDistance is zero for identical colors", () => {
  assert.equal(colorDistance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }), 0);
});

test("colorDistance weights channel differences (green weighted heaviest, then blue, then red)", () => {
  const base = { r: 0, g: 0, b: 0 };
  const redOnly = colorDistance(base, { r: 10, g: 0, b: 0 });
  const greenOnly = colorDistance(base, { r: 0, g: 10, b: 0 });
  const blueOnly = colorDistance(base, { r: 0, g: 0, b: 10 });

  assert.ok(greenOnly > blueOnly);
  assert.ok(blueOnly > redOnly);
});

test("toHex round-trips rgb channels", () => {
  assert.equal(toHex({ r: 17, g: 24, b: 39 }), "#111827");
  assert.equal(toHex({ r: 255, g: 255, b: 255 }), "#ffffff");
  assert.equal(toHex({ r: 0, g: 0, b: 0 }), "#000000");
});

test("toHex clamps out-of-range channel values", () => {
  assert.equal(toHex({ r: -10, g: 300, b: 128 }), "#00ff80");
});
