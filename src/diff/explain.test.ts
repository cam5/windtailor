import { test } from "node:test";
import assert from "node:assert/strict";
import { explainDiff } from "./explain.js";
import type { SemanticDiff } from "./types.js";

function emptyDiff(overrides: Partial<SemanticDiff> = {}): SemanticDiff {
  return {
    before: { sourceUrl: "file:///page.html", selector: "#card", nodeCount: 2 },
    after: { sourceUrl: "file:///page.html", selector: "#card", nodeCount: 2 },
    contextWarnings: [],
    structure: [],
    nodes: [],
    tokens: [],
    debt: [],
    headline: "The two runs describe the same design.",
    ...overrides,
  };
}

test("an empty diff says so explicitly", () => {
  assert.equal(explainDiff(emptyDiff()), "The two runs describe the same design.\n\nNo semantic changes.");
});

test("the headline leads and the four sections follow in a fixed order", () => {
  const output = explainDiff(
    emptyDiff({
      headline: "1 node(s) restyled, 1 added, 1 token(s) minted, token debt down 1.",
      structure: [{ kind: "added", nodeId: "0.1", tag: "button" }],
      nodes: [
        {
          nodeId: "0",
          tag: "div",
          family: "padding",
          beforeClasses: ["p-2"],
          afterClasses: ["p-6"],
          beforeValue: "8px",
          afterValue: "24px",
          direction: "increased",
          magnitude: 16,
          unit: "px",
          explanation: "padding grew 8px → 24px (p-2 → p-6)",
        },
      ],
      tokens: [{ category: "radius", key: "33", kind: "minted", afterValue: "2.0625rem", explanation: 'New radius token "33" minted.' }],
      debt: [{ kind: "arbitrary", resolved: 1, introduced: 0, before: 1, after: 0, explanation: "1 arbitrary value(s) resolved (1 → 0 total)." }],
    }),
  );

  assert.equal(
    output,
    [
      "1 node(s) restyled, 1 added, 1 token(s) minted, token debt down 1.",
      "",
      "Structure",
      "  + 0.1 <button> is new.",
      "",
      "Styles",
      "  0 <div>",
      "    padding grew 8px → 24px (p-2 → p-6)",
      "",
      "Tokens",
      '  New radius token "33" minted.',
      "",
      "Token debt",
      "  arbitrary: 1 arbitrary value(s) resolved (1 → 0 total).",
    ].join("\n"),
  );
});

test("run-context warnings come before every section", () => {
  const lines = explainDiff(
    emptyDiff({
      contextWarnings: [
        { field: "selector", before: "#card", after: "#panel", message: "The two runs targeted different selectors." },
      ],
      structure: [{ kind: "removed", nodeId: "0.0", tag: "span" }],
    }),
  ).split("\n");

  assert.equal(lines[0], "The two runs describe the same design.");
  assert.equal(lines[2], "Warning: The two runs targeted different selectors.");
  assert.ok(lines.indexOf("Structure") > 2);
});

test("each node's changes are listed once under a single node heading", () => {
  const lines = explainDiff(
    emptyDiff({
      nodes: [
        { nodeId: "0", tag: "div", family: "padding", beforeClasses: ["p-2"], afterClasses: ["p-6"], direction: "increased", explanation: "padding grew" },
        { nodeId: "0", tag: "div", family: "background", beforeClasses: [], afterClasses: ["bg-gray-900"], direction: "added", explanation: "background added" },
      ],
    }),
  ).split("\n");

  assert.deepEqual(lines.filter((l) => l === "  0 <div>").length, 1);
  assert.deepEqual(lines.slice(-2), ["    padding grew", "    background added"]);
});

test("a retagged node reads as a tag swap", () => {
  const output = explainDiff(emptyDiff({ structure: [{ kind: "retagged", nodeId: "0.0", tag: "a", beforeTag: "span" }] }));

  assert.match(output, /\+ |- |~ 0\.0 became <a> \(was <span>\)\./);
});
