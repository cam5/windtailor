import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestionsForNode } from "./suggestions.js";
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

test("an exact stock match produces no suggestion", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["8px"] = "2";

  assert.deepEqual(suggestionsForNode(node({ marginTop: "8px" }), tokens), []);
});

test("a clamped stock match is flagged with its distance and a note", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.spacing["9px"] = "2";
  tokens.clamped.spacing["9px"] = 1;

  const suggestions = suggestionsForNode(node({ paddingTop: "9px" }), tokens);

  assert.deepEqual(suggestions, [
    {
      nodeId: "0",
      property: "paddingTop",
      category: "spacing",
      rawValue: "9px",
      resolvedClass: "pt-2",
      kind: "clamped",
      distance: 1,
      note: 'Snapped to "pt-2" — source value 9px was 1px off the exact scale value.',
    },
  ]);
});

test("a clamped color match reports RGB distance, not px", () => {
  const tokens = emptyTokenTable();
  tokens.stockMatches.color["#101828"] = "gray-900";
  tokens.clamped.color["#101828"] = 2.4;

  const [suggestion] = suggestionsForNode(node({ backgroundColor: "#101828" }), tokens);

  assert.equal(suggestion.kind, "clamped");
  assert.equal(suggestion.distance, 2.4);
  assert.match(suggestion.note, /RGB units/);
});

test("a value that minted a brand-new token is flagged as generated", () => {
  const tokens = emptyTokenTable();
  tokens.generated.radius.push({ category: "radius", key: "33", value: "2.0625rem", sourceValues: ["33px"] });

  const suggestions = suggestionsForNode(node({ borderTopLeftRadius: "33px" }), tokens);

  assert.deepEqual(suggestions, [
    {
      nodeId: "0",
      property: "borderTopLeftRadius",
      category: "radius",
      rawValue: "33px",
      resolvedClass: "rounded-tl-33",
      kind: "generated",
      distance: undefined,
      note: 'Minted a new token for 33px ("rounded-tl-33") — written to this run\'s tailwind.config.tokens.js, not your own config.',
    },
  ]);
});

test("a scale value with no match at all is flagged as arbitrary", () => {
  const tokens = emptyTokenTable();

  const suggestions = suggestionsForNode(node({ top: "auto" }), tokens);

  assert.deepEqual(suggestions, [
    {
      nodeId: "0",
      property: "top",
      category: "spacing",
      rawValue: "auto",
      resolvedClass: "top-[auto]",
      kind: "arbitrary",
      distance: undefined,
      note: "No scale value matched auto — emitted as a raw arbitrary-value class.",
    },
  ]);
});

test("a non-normal line-height is flagged as arbitrary", () => {
  const tokens = emptyTokenTable();

  const suggestions = suggestionsForNode(node({ lineHeight: "1.375" }), tokens);

  assert.deepEqual(suggestions, [
    {
      nodeId: "0",
      property: "lineHeight",
      rawValue: "1.375",
      resolvedClass: "leading-[1.375]",
      kind: "arbitrary",
      note: "No scale value matched 1.375 — emitted as a raw arbitrary-value class.",
    },
  ]);
});

test("line-height 'normal' produces no suggestion", () => {
  const tokens = emptyTokenTable();

  assert.deepEqual(suggestionsForNode(node({ lineHeight: "normal" }), tokens), []);
});
