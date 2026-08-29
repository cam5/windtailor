import { test } from "node:test";
import assert from "node:assert/strict";
import { assignClasses } from "./assign.js";
import type { DomNode, TokenTable } from "../model/types.js";

function emptyTokenTable(): TokenTable {
  return {
    stockMatches: { spacing: {}, color: {}, fontSize: {}, radius: {} },
    generated: { spacing: [], color: [], fontSize: [], radius: [] },
    clamped: { spacing: {}, color: {}, fontSize: {}, radius: {} },
  };
}

function node(style: DomNode["style"]): DomNode {
  return { id: "0", tag: "div", attributes: {}, children: [], style };
}

test("maps a scale property to its stock Tailwind class when the raw value is a known token", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["13px"] = "3.5";

  const { classes } = assignClasses(node({ marginTop: "13px" }), tokens);

  assert.deepEqual(classes["0"], ["mt-3.5"]);
});

test("falls back to an arbitrary-value class when a scale property matches no token", () => {
  const tokens = emptyTokenTable();

  const { classes } = assignClasses(node({ marginTop: "13px" }), tokens);

  assert.deepEqual(classes["0"], ["mt-[13px]"]);
});

test("a negative generated margin key moves the sign outside the class (-mt-1.25, not mt--1.25)", () => {
  const tokens = emptyTokenTable();
  tokens.generated.spacing.push({ category: "spacing", key: "-1.25", value: "-0.3125rem", sourceValues: ["-5px"] });

  const { classes } = assignClasses(node({ marginTop: "-5px" }), tokens);

  assert.deepEqual(classes["0"], ["-mt-1.25"]);
});

test("a negative generated inset key moves the sign outside the class (-top-1.25, not top--1.25)", () => {
  const tokens = emptyTokenTable();
  tokens.generated.spacing.push({ category: "spacing", key: "-1.25", value: "-0.3125rem", sourceValues: ["-5px"] });

  const { classes } = assignClasses(node({ top: "-5px" }), tokens);

  assert.deepEqual(classes["0"], ["-top-1.25"]);
});

test("width never goes negative in real CSS, so a (hypothetical) negative key is left untouched", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["-5px"] = "-1.25";

  const { classes } = assignClasses(node({ width: "-5px" }), tokens);

  assert.deepEqual(classes["0"], ["w--1.25"]);
});

test("maps a discrete-value property via its fixed lookup table", () => {
  const tokens = emptyTokenTable();

  const { classes } = assignClasses(node({ display: "inline-block", position: "relative" }), tokens);

  assert.deepEqual(classes["0"], ["inline-block", "relative"]);
});

test("records an unmappable discrete value in the unhandled ledger instead of dropping it", () => {
  const tokens = emptyTokenTable();

  const { classes, unhandled } = assignClasses(node({ display: "flow-root" }), tokens);

  assert.deepEqual(classes["0"], []);
  assert.deepEqual(unhandled, [{ nodeId: "0", property: "display", rawValue: "flow-root" }]);
});

test("a node with no captured style produces an empty class list and no unhandled entries", () => {
  const tokens = emptyTokenTable();

  const { classes, unhandled } = assignClasses(node({}), tokens);

  assert.deepEqual(classes["0"], []);
  assert.deepEqual(unhandled, []);
});
