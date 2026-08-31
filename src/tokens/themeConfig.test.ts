import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadThemeFromFile, loadThemeFromJson } from "./themeConfig.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");

test("inline JSON extend adds a custom color without dropping the stock scale", () => {
  const theme = loadThemeFromJson('{"extend":{"colors":{"brand-blue":"#3a81f5"}}}');

  const brand = theme.colors.find((c) => c.key === "brand-blue");
  assert.ok(brand, "expected the custom color to be present");
  assert.deepEqual(brand!.rgb, { r: 58, g: 129, b: 245 });

  assert.ok(theme.colors.some((c) => c.key === "blue-500"), "expected stock colors to still be present under extend");
});

test("loading a bare-object JSON file (no `theme` wrapper) matches the equivalent inline JSON", async () => {
  const fromFile = await loadThemeFromFile(path.join(fixturesDir, "custom-theme.json"));
  const fromJson = loadThemeFromJson(
    '{"extend":{"colors":{"brand-ink":"#111827","brand-blue":"#3a81f5"},"borderRadius":{"pill":"33px"}}}',
  );

  assert.deepEqual(fromFile.colors, fromJson.colors);
  assert.deepEqual(fromFile.radius, fromJson.radius);
});

test("loading a real config-shaped .cjs file (module.exports = { theme: { extend } }) resolves the same theme", async () => {
  const theme = await loadThemeFromFile(path.join(fixturesDir, "custom-theme.cjs"));

  assert.ok(theme.colors.some((c) => c.key === "brand-ink"));
  assert.ok(theme.radius.some((r) => r.key === "pill" && r.px === 33));
});

test("malformed inline JSON throws rather than silently producing an empty theme", () => {
  assert.throws(() => loadThemeFromJson("{not valid json"));
});

test("a --theme-file with an unrecognized extension is rejected rather than handed to import()", async () => {
  await assert.rejects(
    () => loadThemeFromFile(path.join(fixturesDir, "not-a-theme.txt")),
    (err: Error) => /\.json/.test(err.message) && /\.cjs/.test(err.message),
    "expected an error naming the accepted extensions, not a module-loader error",
  );
});

test("a --theme-file with no extension at all is rejected", async () => {
  await assert.rejects(
    () => loadThemeFromFile(path.join(fixturesDir, "not-a-theme")),
    (err: Error) => /\.json/.test(err.message) && /\.cjs/.test(err.message),
  );
});
