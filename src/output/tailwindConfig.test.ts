import { test } from "node:test";
import assert from "node:assert/strict";
import type { GeneratedToken, TokenCategory, TokenTable } from "../model/types.js";
import { renderTailwindConfigModule } from "./tailwindConfig.js";

/**
 * tailwind.config.tokens.js is generated JavaScript that an operator is invited to require() or
 * paste into their real config, so anything that reached it from the scraped page and escaped its
 * string literal would be code execution in the operator's build.
 *
 * Today it cannot: token keys are machine-derived (keyFromPx, custom-N) and values are pxToRem /
 * hex, and both go through JSON.stringify. These tests pin that property rather than fixing a live
 * bug — they exist so that a future change to key or value derivation can't quietly regress it.
 */

function tableWith(category: TokenCategory, tokens: GeneratedToken[]): TokenTable {
  const empty = <T,>(value: () => T): Record<TokenCategory, T> => ({
    spacing: value(), color: value(), fontSize: value(), radius: value(),
  });

  const table: TokenTable = {
    stockMatches: empty(() => ({}) as Record<string, string>),
    generated: empty(() => [] as GeneratedToken[]),
    clamped: empty(() => ({}) as Record<string, number>),
  };
  table.generated[category] = tokens;
  return table;
}

/** Evaluates the generated CommonJS source the same way an operator's config would. */
function evalModule(source: string): { theme: { extend: Record<string, Record<string, string>> } } {
  const module = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", source)(module, module.exports);
  return module.exports as { theme: { extend: Record<string, Record<string, string>> } };
}

test("a benign token round-trips into a requirable module", () => {
  const source = renderTailwindConfigModule(
    tableWith("radius", [{ category: "radius", key: "33", value: "2.0625rem", sourceValues: ["33px"] }]),
  );

  assert.deepEqual(evalModule(source).theme.extend, { borderRadius: { "33": "2.0625rem" } });
});

test("a token key or value carrying quotes, braces or newlines cannot break out of its string literal", () => {
  const hostileKey = `x": "y", "injected`;
  const hostileValue = `1rem"};\nglobalThis.pwned = true;\nmodule.exports = {"theme":{"extend":{"a":"b`;

  const source = renderTailwindConfigModule(
    tableWith("color", [{ category: "color", key: hostileKey, value: hostileValue, sourceValues: ["#000000"] }]),
  );

  assert.ok(!source.includes("globalThis.pwned = true;\n"), "expected the payload's newlines to be escaped, not emitted raw");

  const extend = evalModule(source).theme.extend;
  assert.deepEqual(Object.keys(extend), ["colors"]);
  assert.deepEqual(extend.colors, { [hostileKey]: hostileValue }, "expected the payload to survive only as inert data");
  assert.equal((globalThis as Record<string, unknown>).pwned, undefined, "expected nothing from the payload to have executed");
});

test("a token key containing a backslash stays escaped", () => {
  const source = renderTailwindConfigModule(
    tableWith("spacing", [{ category: "spacing", key: String.raw`a\", "b`, value: "1rem", sourceValues: ["16px"] }]),
  );

  assert.deepEqual(Object.keys(evalModule(source).theme.extend.spacing), [String.raw`a\", "b`]);
});

test("an empty token table produces an empty extend rather than invalid syntax", () => {
  const extend = evalModule(renderTailwindConfigModule(tableWith("spacing", []))).theme.extend;
  assert.deepEqual(extend, {});
});
