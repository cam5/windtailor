import { test } from "node:test";
import assert from "node:assert/strict";
import { diffReports } from "./diff.js";
import { classFamily } from "./families.js";
import { parseReport } from "./loadReport.js";
import type { AssignedClasses, DomNode, ReconciliationReport, StyleRecord, Suggestion, TokenTable } from "../model/types.js";

function emptyTokenTable(): TokenTable {
  return {
    stockMatches: { spacing: {}, color: {}, fontSize: {}, radius: {} },
    generated: { spacing: [], color: [], fontSize: [], radius: [] },
    clamped: { spacing: {}, color: {}, fontSize: {}, radius: {} },
  };
}

function node(id: string, tag: string, style: StyleRecord, children: DomNode[] = []): DomNode {
  return { id, tag, attributes: {}, children, style };
}

function report(overrides: Partial<ReconciliationReport> = {}): ReconciliationReport {
  return {
    sourceUrl: "file:///page.html",
    selector: "#card",
    tree: node("0", "div", {}),
    tokens: emptyTokenTable(),
    classes: {},
    unhandled: [],
    suggestions: [],
    ...overrides,
  };
}

function classesFor(entries: AssignedClasses): AssignedClasses {
  return entries;
}

test("a padding increase reports direction, magnitude and both classes", () => {
  const before = report({ tree: node("0", "div", { paddingTop: "8px" }), classes: classesFor({ "0": ["pt-2"] }) });
  const after = report({ tree: node("0", "div", { paddingTop: "24px" }), classes: classesFor({ "0": ["pt-6"] }) });

  const diff = diffReports(before, after);

  assert.equal(diff.nodes.length, 1);
  const change = diff.nodes[0];
  assert.equal(change.family, "padding");
  assert.equal(change.direction, "increased");
  assert.equal(change.magnitude, 16);
  assert.equal(change.unit, "px");
  assert.deepEqual(change.beforeClasses, ["pt-2"]);
  assert.deepEqual(change.afterClasses, ["pt-6"]);
  assert.equal(change.explanation, "padding grew 8px → 24px (pt-2 → pt-6)");
});

test("a padding decrease reads as shrank", () => {
  const before = report({ tree: node("0", "div", { paddingTop: "24px" }), classes: classesFor({ "0": ["pt-6"] }) });
  const after = report({ tree: node("0", "div", { paddingTop: "8px" }), classes: classesFor({ "0": ["pt-2"] }) });

  const [change] = diffReports(before, after).nodes;

  assert.equal(change.direction, "decreased");
  assert.equal(change.magnitude, -16);
  assert.match(change.explanation, /padding shrank 24px → 8px/);
});

test("a color change reports both hexes and how big the shift is", () => {
  const before = report({ tree: node("0", "div", { backgroundColor: "#111827" }), classes: classesFor({ "0": ["bg-gray-900"] }) });
  const after = report({ tree: node("0", "div", { backgroundColor: "#1f2937" }), classes: classesFor({ "0": ["bg-gray-800"] }) });

  const [change] = diffReports(before, after).nodes;

  assert.equal(change.family, "background");
  assert.equal(change.unit, "rgb");
  assert.match(change.explanation, /#111827 → #1f2937/);
  assert.match(change.explanation, /shift|distinct color/);
});

test("a class rename with no rendered change says so instead of inventing a magnitude", () => {
  const style = { backgroundColor: "#111827" };
  const before = report({ tree: node("0", "div", style), classes: classesFor({ "0": ["bg-gray-900"] }) });
  const after = report({
    tree: node("0", "div", style),
    themeSource: "fixtures/custom-theme.json",
    classes: classesFor({ "0": ["bg-brand-ink"] }),
  });

  const [change] = diffReports(before, after).nodes;

  assert.equal(change.direction, "changed");
  assert.equal(change.magnitude, undefined);
  assert.match(change.explanation, /kept the same rendered values but the classes changed \(bg-gray-900 → bg-brand-ink\)/);
});

test("a family that only appears in the later run is an addition, not a swap", () => {
  const before = report({ tree: node("0", "div", {}), classes: classesFor({ "0": [] }) });
  const after = report({ tree: node("0", "div", { borderTopLeftRadius: "33px" }), classes: classesFor({ "0": ["rounded-tl-33"] }) });

  const [change] = diffReports(before, after).nodes;

  assert.equal(change.family, "radius");
  assert.equal(change.direction, "added");
  assert.equal(change.afterValue, "33px");
});

test("sides that moved differently are explained per side rather than averaged away", () => {
  const before = report({
    tree: node("0", "div", { paddingTop: "8px", paddingLeft: "16px" }),
    classes: classesFor({ "0": ["pt-2", "pl-4"] }),
  });
  const after = report({
    tree: node("0", "div", { paddingTop: "12px", paddingLeft: "40px" }),
    classes: classesFor({ "0": ["pt-3", "pl-10"] }),
  });

  const [change] = diffReports(before, after).nodes;

  assert.equal(change.direction, "increased");
  assert.equal(change.magnitude, undefined);
  assert.match(change.explanation, /paddingTop 8px → 12px, paddingLeft 16px → 40px/);
});

test("added and removed nodes show up as structure changes", () => {
  const before = report({ tree: node("0", "div", {}, [node("0.0", "span", {})]) });
  const after = report({ tree: node("0", "div", {}, [node("0.1", "button", {})]) });

  const diff = diffReports(before, after);

  assert.deepEqual(diff.structure, [
    { kind: "removed", nodeId: "0.0", tag: "span" },
    { kind: "added", nodeId: "0.1", tag: "button" },
  ]);
});

test("a node that changed tag at the same position is retagged, not added and removed", () => {
  const before = report({ tree: node("0", "div", {}, [node("0.0", "span", {})]) });
  const after = report({ tree: node("0", "div", {}, [node("0.0", "a", {})]) });

  assert.deepEqual(diffReports(before, after).structure, [{ kind: "retagged", nodeId: "0.0", tag: "a", beforeTag: "span" }]);
});

test("generated tokens minted and dropped are both reported", () => {
  const before = report();
  before.tokens.generated.radius.push({ category: "radius", key: "33", value: "2.0625rem", sourceValues: ["33px"] });
  const after = report();
  after.tokens.generated.spacing.push({ category: "spacing", key: "4.25", value: "1.0625rem", sourceValues: ["17px"] });

  const diff = diffReports(before, after);
  const minted = diff.tokens.find((t) => t.kind === "minted");
  const dropped = diff.tokens.find((t) => t.kind === "dropped");

  assert.equal(minted?.key, "4.25");
  assert.equal(minted?.category, "spacing");
  assert.match(minted!.explanation, /minted for 17px/);
  assert.equal(dropped?.key, "33");
  assert.equal(dropped?.category, "radius");
});

test("a generated token whose value moved is redefined, not minted twice", () => {
  const before = report();
  before.tokens.generated.spacing.push({ category: "spacing", key: "4.25", value: "1.0625rem", sourceValues: ["17px"] });
  const after = report();
  after.tokens.generated.spacing.push({ category: "spacing", key: "4.25", value: "1.125rem", sourceValues: ["18px"] });

  const [change] = diffReports(before, after).tokens;

  assert.equal(change.kind, "redefined");
  assert.equal(change.beforeValue, "1.0625rem");
  assert.equal(change.afterValue, "1.125rem");
});

test("a value that stops clamping is reported as an exact match now", () => {
  const before = report();
  before.tokens.stockMatches.spacing["9px"] = "2";
  before.tokens.clamped.spacing["9px"] = 1;
  const after = report();
  after.tokens.stockMatches.spacing["9px"] = "snug";

  const diff = diffReports(before, after);
  const tightened = diff.tokens.find((t) => t.kind === "clamp-tightened");

  assert.equal(tightened?.key, "9px");
  assert.match(tightened!.explanation, /now an exact theme match/);
});

test("a value that starts snapping further away is reported as loosened", () => {
  const before = report();
  before.tokens.stockMatches.spacing["9px"] = "2";
  before.tokens.clamped.spacing["9px"] = 1;
  const after = report();
  after.tokens.stockMatches.spacing["9px"] = "3";
  after.tokens.clamped.spacing["9px"] = 3;

  const loosened = diffReports(before, after).tokens.find((t) => t.kind === "clamp-loosened");

  assert.equal(loosened?.key, "9px");
  assert.match(loosened!.explanation, /1 → 3 px away/);
});

test("an arbitrary value that a token now covers shows up as debt resolved", () => {
  const arbitrary: Suggestion = {
    nodeId: "0",
    property: "borderTopLeftRadius",
    category: "radius",
    rawValue: "33px",
    resolvedClass: "rounded-tl-[33px]",
    kind: "arbitrary",
    note: "No scale entry matched.",
  };
  const before = report({ suggestions: [arbitrary] });
  const after = report({ suggestions: [] });

  const diff = diffReports(before, after);

  assert.deepEqual(diff.debt, [
    {
      kind: "arbitrary",
      resolved: 1,
      introduced: 0,
      before: 1,
      after: 0,
      explanation: "1 arbitrary value(s) resolved (1 → 0 total).",
    },
  ]);
  assert.match(diff.headline, /token debt down 1/);
});

test("unmapped values are counted as debt too", () => {
  const before = report();
  const after = report({ unhandled: [{ nodeId: "0", property: "display", rawValue: "ruby" }] });

  const [change] = diffReports(before, after).debt;

  assert.equal(change.kind, "unhandled");
  assert.equal(change.introduced, 1);
});

test("runs that targeted different pages or selectors are flagged before anything else", () => {
  const before = report({ sourceUrl: "file:///a.html", selector: "#card" });
  const after = report({ sourceUrl: "file:///b.html", selector: "#panel" });

  const diff = diffReports(before, after);

  assert.deepEqual(
    diff.contextWarnings.map((w) => w.field),
    ["sourceUrl", "selector"],
  );
  assert.match(diff.contextWarnings[0].message, /different pages/);
});

test("a theme swap is flagged even when both runs read the same page", () => {
  const diff = diffReports(report(), report({ themeSource: "tailwind.config.js" }));

  assert.deepEqual(
    diff.contextWarnings.map((w) => [w.before, w.after]),
    [["stock Tailwind", "tailwind.config.js"]],
  );
});

test("two identical runs produce an empty diff and a plain headline", () => {
  const diff = diffReports(report(), report());

  assert.deepEqual(diff.structure, []);
  assert.deepEqual(diff.nodes, []);
  assert.deepEqual(diff.tokens, []);
  assert.deepEqual(diff.debt, []);
  assert.equal(diff.headline, "The two runs describe the same design.");
});

test("text runs are ignored — only element nodes are compared", () => {
  const before = report({ tree: node("0", "div", {}, [{ id: "0.0", tag: "#text", attributes: {}, textContent: "hi", children: [], style: {} }]) });
  const after = report({ tree: node("0", "div", {}, []) });

  assert.deepEqual(diffReports(before, after).structure, []);
});

test("classFamily resolves Tailwind's overloaded prefixes", () => {
  assert.equal(classFamily("p-6"), "padding");
  assert.equal(classFamily("-mt-4"), "margin");
  assert.equal(classFamily("p-[9px]"), "padding");
  assert.equal(classFamily("inset-x-2"), "inset");
  assert.equal(classFamily("rounded-tl-33"), "radius");
  assert.equal(classFamily("border"), "border-width");
  assert.equal(classFamily("border-t-2"), "border-width");
  assert.equal(classFamily("border-x-red-500"), "border-color");
  assert.equal(classFamily("border-[#abcdef]"), "border-color");
  assert.equal(classFamily("text-center"), "text-align");
  assert.equal(classFamily("text-lg"), "font-size");
  assert.equal(classFamily("text-[17px]"), "font-size");
  assert.equal(classFamily("text-gray-900"), "text-color");
  assert.equal(classFamily("font-bold"), "font-weight");
  assert.equal(classFamily("leading-[1.375]"), "line-height");
  assert.equal(classFamily("inline-block"), "display");
  assert.equal(classFamily("absolute"), "position");
  assert.equal(classFamily("opacity-50"), "opacity");
});

test("parseReport rejects JSON that is not a windtailor report, naming the file", () => {
  assert.throws(() => parseReport('{"hello":"world"}', "stale.json"), /stale\.json is not a windtailor report\.json — it has no "tree"/);
  assert.throws(() => parseReport("not json", "broken.json"), /broken\.json is not a windtailor report\.json — it is not valid JSON/);
});

test("parseReport tolerates a report with no suggestions or unhandled arrays", () => {
  const legacy: Record<string, unknown> = { ...report() };
  delete legacy.suggestions;
  delete legacy.unhandled;

  const { suggestions, unhandled } = parseReport(JSON.stringify(legacy), "old.json");

  assert.deepEqual(suggestions, []);
  assert.deepEqual(unhandled, []);
});
