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

test("collapses a margin quad to a single class when all four sides agree", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["13px"] = "3";

  const { classes } = assignClasses(
    node({ marginTop: "13px", marginRight: "13px", marginBottom: "13px", marginLeft: "13px" }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["m-3"]);
});

test("collapses a negative margin quad to a single sign-aware class (-m-1.25, not m--1.25)", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["-5px"] = "-1.25";

  const { classes } = assignClasses(
    node({ marginTop: "-5px", marginRight: "-5px", marginBottom: "-5px", marginLeft: "-5px" }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["-m-1.25"]);
});

test("collapses a negative inset quad to sign-aware -inset-y-/-inset-x- classes when axes agree but differ from each other", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["-5px"] = "-1.25";
  tokens.stockMatches.spacing["7px"] = "1.75";

  const { classes } = assignClasses(
    node({ top: "-5px", right: "7px", bottom: "-5px", left: "7px" }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["-inset-y-1.25", "inset-x-1.75"]);
});

test("collapses a padding quad to px/py when top=bottom and left=right but the axes differ", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["9px"] = "2";
  tokens.stockMatches.spacing["17px"] = "4";

  const { classes } = assignClasses(
    node({ paddingTop: "9px", paddingRight: "17px", paddingBottom: "9px", paddingLeft: "17px" }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["py-2", "px-4"]);
});

test("falls back to four individual classes when no side of a quad matches another", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["1px"] = "px";
  tokens.stockMatches.spacing["2px"] = "0.5";
  tokens.stockMatches.spacing["3px"] = "1";
  tokens.stockMatches.spacing["4px"] = "1.5";

  const { classes } = assignClasses(
    node({ marginTop: "1px", marginRight: "2px", marginBottom: "3px", marginLeft: "4px" }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["mt-px", "mr-0.5", "mb-1", "ml-1.5"]);
});

test("leaves a partial quad untouched — only the declared side gets a class", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["14px"] = "3.5";

  const { classes } = assignClasses(node({ marginTop: "14px" }), tokens);

  assert.deepEqual(classes["0"], ["mt-3.5"]);
});

test("collapses border-width to bare `border` for a 1px border on all four sides", () => {
  const tokens = emptyTokenTable();

  const { classes } = assignClasses(
    node({ borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px" }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["border"]);
});

test("collapses a border-radius quad to `rounded-*` when all four corners agree", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.radius["9px"] = "lg";

  const { classes } = assignClasses(
    node({
      borderTopLeftRadius: "9px",
      borderTopRightRadius: "9px",
      borderBottomRightRadius: "9px",
      borderBottomLeftRadius: "9px",
    }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["rounded-lg"]);
});

test("collapses a border-radius quad to rounded-t-*/rounded-b-* when the top corners and bottom corners each agree", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.radius["4px"] = "sm";
  tokens.stockMatches.radius["9px"] = "lg";

  const { classes } = assignClasses(
    node({
      borderTopLeftRadius: "4px",
      borderTopRightRadius: "4px",
      borderBottomRightRadius: "9px",
      borderBottomLeftRadius: "9px",
    }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["rounded-t-sm", "rounded-b-lg"]);
});

test("collapses a border-radius quad to rounded-l-*/rounded-r-* when the left corners and right corners each agree", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.radius["4px"] = "sm";
  tokens.stockMatches.radius["9px"] = "lg";

  const { classes } = assignClasses(
    node({
      borderTopLeftRadius: "4px",
      borderTopRightRadius: "9px",
      borderBottomRightRadius: "9px",
      borderBottomLeftRadius: "4px",
    }),
    tokens,
  );

  assert.deepEqual(classes["0"], ["rounded-l-sm", "rounded-r-lg"]);
});
