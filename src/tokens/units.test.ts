import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLengthPx, pxToRem, trimTrailingZeros } from "./units.js";

test("parseLengthPx parses px values", () => {
  assert.equal(parseLengthPx("16px"), 16);
  assert.equal(parseLengthPx("-4px"), -4);
});

test("parseLengthPx parses rem values as pixels", () => {
  assert.equal(parseLengthPx("1rem"), 16);
  assert.equal(parseLengthPx("2.5rem"), 40);
  assert.equal(parseLengthPx("-1rem"), -16);
});

test("parseLengthPx treats bare '0' as zero", () => {
  assert.equal(parseLengthPx("0"), 0);
});

test("parseLengthPx returns null for unparseable/non-length units", () => {
  assert.equal(parseLengthPx("auto"), null);
  assert.equal(parseLengthPx("none"), null);
  assert.equal(parseLengthPx("50%"), null);
  assert.equal(parseLengthPx(""), null);
});

test("pxToRem formats whole numbers without trailing zeros", () => {
  assert.equal(pxToRem(16), "1rem");
  assert.equal(pxToRem(32), "2rem");
});

test("pxToRem formats fractional rem values", () => {
  assert.equal(pxToRem(8), "0.5rem");
  assert.equal(pxToRem(36), "2.25rem");
});

test("trimTrailingZeros strips trailing zeros but keeps significant digits", () => {
  assert.equal(trimTrailingZeros(2), "2");
  assert.equal(trimTrailingZeros(2.5), "2.5");
  assert.equal(trimTrailingZeros(2.25), "2.25");
  assert.equal(trimTrailingZeros(0), "0");
});
