import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTailwindConfigModule } from "./tailwindConfig.js";
import type { TokenTable } from "../model/types.js";

function emptyTokenTable(): TokenTable {
  return {
    stockMatches: { spacing: {}, color: {}, fontSize: {}, radius: {} },
    generated: { spacing: [], color: [], fontSize: [], radius: [] },
    clamped: { spacing: {}, color: {}, fontSize: {}, radius: {} },
  };
}

test("renders an empty extend when no tokens were generated", () => {
  const module = renderTailwindConfigModule(emptyTokenTable());

  assert.match(module, /module\.exports = \{/);
  assert.match(module, /extend: \{\}/);
});

test("maps categories with generated tokens to their corresponding theme keys", () => {
  const tokens = emptyTokenTable();
  tokens.generated.spacing = [{ category: "spacing", key: "8.5", value: "2.125rem", sourceValues: ["34px"] }];
  tokens.generated.color = [{ category: "color", key: "brand-500", value: "#5e1b02", sourceValues: ["#5e1b02"] }];

  const module = renderTailwindConfigModule(tokens);

  assert.match(module, /spacing/);
  assert.match(module, /"8\.5": "2\.125rem"/);
  assert.match(module, /colors/);
  assert.match(module, /"brand-500": "#5e1b02"/);
});

test("omits categories with zero generated tokens from extend", () => {
  const tokens = emptyTokenTable();
  tokens.generated.radius = [{ category: "radius", key: "5", value: "1.25rem", sourceValues: ["20px"] }];

  const module = renderTailwindConfigModule(tokens);

  assert.match(module, /borderRadius/);
  assert.doesNotMatch(module, /spacing:/);
  assert.doesNotMatch(module, /fontSize:/);
  assert.doesNotMatch(module, /colors:/);
});
