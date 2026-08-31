import type {
  CapturedProperty,
  DomNode,
  GeneratedToken,
  ReconciliationReport,
  Suggestion,
  SuggestionKind,
  TokenCategory,
  UnhandledValue,
} from "../model/types.js";
import { DEFAULT_CLUSTER_OPTIONS } from "../tokens/cluster.js";
import { colorDistance, parseColor, toHex } from "../tokens/color.js";
import { parseLengthPx, trimTrailingZeros } from "../tokens/units.js";
import { classFamily, COLOR_FAMILIES, FAMILY_LABEL, FAMILY_ORDER, FAMILY_PROPERTIES } from "./families.js";
import type {
  ChangeDirection,
  DebtChange,
  DiffRunSummary,
  NodeStyleChange,
  RunContextChange,
  SemanticDiff,
  StructureChange,
  StyleFamily,
  TokenChange,
} from "./types.js";

const TOKEN_CATEGORIES: TokenCategory[] = ["spacing", "color", "fontSize", "radius"];
const SUGGESTION_KINDS: SuggestionKind[] = ["clamped", "generated", "arbitrary"];

/** Element nodes only — text runs carry no styles, and their ids shift with any content edit. */
function flattenElements(root: DomNode): Map<string, DomNode> {
  const byId = new Map<string, DomNode>();
  const visit = (node: DomNode) => {
    if (node.tag !== "#text") byId.set(node.id, node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return byId;
}

function summarize(report: ReconciliationReport): DiffRunSummary {
  return {
    sourceUrl: report.sourceUrl,
    selector: report.selector,
    themeSource: report.themeSource,
    nodeCount: flattenElements(report.tree).size,
  };
}

function px(n: number): string {
  return `${trimTrailingZeros(n)}px`;
}

function diffRunContext(before: ReconciliationReport, after: ReconciliationReport): RunContextChange[] {
  const warnings: RunContextChange[] = [];

  if (before.sourceUrl !== after.sourceUrl) {
    warnings.push({
      field: "sourceUrl",
      before: before.sourceUrl,
      after: after.sourceUrl,
      message: `The two runs read different pages (${before.sourceUrl} → ${after.sourceUrl}). Everything below compares two different things.`,
    });
  }
  if (before.selector !== after.selector) {
    warnings.push({
      field: "selector",
      before: before.selector,
      after: after.selector,
      message: `The two runs targeted different selectors (${before.selector} → ${after.selector}). Node ids line up by position, not by identity.`,
    });
  }
  const beforeTheme = before.themeSource ?? "stock Tailwind";
  const afterTheme = after.themeSource ?? "stock Tailwind";
  if (beforeTheme !== afterTheme) {
    warnings.push({
      field: "themeSource",
      before: beforeTheme,
      after: afterTheme,
      message: `The theme changed (${beforeTheme} → ${afterTheme}). Class names can differ even where the rendered value did not.`,
    });
  }

  return warnings;
}

function diffStructure(before: Map<string, DomNode>, after: Map<string, DomNode>): StructureChange[] {
  const changes: StructureChange[] = [];

  for (const [id, node] of before) {
    const other = after.get(id);
    if (!other) {
      changes.push({ kind: "removed", nodeId: id, tag: node.tag });
    } else if (other.tag !== node.tag) {
      changes.push({ kind: "retagged", nodeId: id, tag: other.tag, beforeTag: node.tag });
    }
  }
  for (const [id, node] of after) {
    if (!before.has(id)) changes.push({ kind: "added", nodeId: id, tag: node.tag });
  }

  return changes;
}

interface ValuePair {
  property: CapturedProperty;
  before?: string;
  after?: string;
}

/** The captured properties in this family whose computed value actually moved between the runs. */
function changedProperties(family: StyleFamily, before: DomNode, after: DomNode): ValuePair[] {
  const pairs: ValuePair[] = [];
  for (const property of FAMILY_PROPERTIES[family]) {
    const b = before.style?.[property];
    const a = after.style?.[property];
    if (b !== a) pairs.push({ property, before: b, after: a });
  }
  return pairs;
}

function describeColorShift(distance: number): string {
  if (distance === 0) return "the same color under a different name";
  if (distance < DEFAULT_CLUSTER_OPTIONS.colorTolerance / 3) return "an imperceptible shift";
  if (distance < DEFAULT_CLUSTER_OPTIONS.colorTolerance) return "a subtle shift";
  return "a distinct color";
}

function classList(classes: string[]): string {
  return classes.length > 0 ? classes.join(" ") : "nothing";
}

/**
 * Attaches direction and magnitude from the underlying computed values rather than the class
 * names, so the diff can say "padding grew 8px → 24px" even when both runs happened to land on
 * the same token key, or when a theme change renamed a class without changing what it renders.
 */
function describeChange(
  family: StyleFamily,
  pairs: ValuePair[],
  beforeClasses: string[],
  afterClasses: string[],
): Pick<NodeStyleChange, "direction" | "magnitude" | "unit" | "beforeValue" | "afterValue" | "explanation"> {
  const label = FAMILY_LABEL[family];
  const transition = `${classList(beforeClasses)} → ${classList(afterClasses)}`;

  if (beforeClasses.length === 0 && afterClasses.length > 0) {
    const value = pairs.find((p) => p.after !== undefined)?.after;
    return {
      direction: "added",
      beforeValue: undefined,
      afterValue: value,
      explanation: `${label} added${value ? ` — ${value}` : ""} (${afterClasses.join(" ")})`,
    };
  }
  if (afterClasses.length === 0 && beforeClasses.length > 0) {
    const value = pairs.find((p) => p.before !== undefined)?.before;
    return {
      direction: "removed",
      beforeValue: value,
      afterValue: undefined,
      explanation: `${label} removed${value ? ` — was ${value}` : ""} (was ${beforeClasses.join(" ")})`,
    };
  }

  // Every side that moved moved the same way: one clean before/after pair to report.
  const uniform =
    pairs.length > 0 &&
    pairs.every((p) => p.before === pairs[0].before && p.after === pairs[0].after) &&
    pairs[0].before !== undefined &&
    pairs[0].after !== undefined;

  if (uniform) {
    const beforeValue = pairs[0].before!;
    const afterValue = pairs[0].after!;

    if (COLOR_FAMILIES.has(family)) {
      const b = parseColor(beforeValue);
      const a = parseColor(afterValue);
      if (b && a) {
        const distance = colorDistance(b, a);
        return {
          direction: "changed",
          magnitude: Number(distance.toFixed(2)),
          unit: "rgb",
          beforeValue,
          afterValue,
          explanation: `${label} shifted ${toHex(b)} → ${toHex(a)}, ${describeColorShift(distance)} (${transition})`,
        };
      }
    } else {
      const b = parseLengthPx(beforeValue);
      const a = parseLengthPx(afterValue);
      if (b !== null && a !== null && a !== b) {
        const delta = a - b;
        return {
          direction: delta > 0 ? "increased" : "decreased",
          magnitude: Number(delta.toFixed(4)),
          unit: "px",
          beforeValue,
          afterValue,
          explanation: `${label} ${delta > 0 ? "grew" : "shrank"} ${px(b)} → ${px(a)} (${transition})`,
        };
      }
      const bNum = Number.parseFloat(beforeValue);
      const aNum = Number.parseFloat(afterValue);
      if (family === "opacity" && Number.isFinite(bNum) && Number.isFinite(aNum) && bNum !== aNum) {
        return {
          direction: aNum > bNum ? "increased" : "decreased",
          magnitude: Number((aNum - bNum).toFixed(4)),
          beforeValue,
          afterValue,
          explanation: `${label} ${aNum > bNum ? "rose" : "fell"} ${beforeValue} → ${afterValue} (${transition})`,
        };
      }
    }

    return {
      direction: "changed",
      beforeValue,
      afterValue,
      explanation: `${label} changed ${beforeValue} → ${afterValue} (${transition})`,
    };
  }

  if (pairs.length === 0) {
    // Classes moved but nothing rendered differently — a theme rename, or a collapse into a
    // shorter Tailwind form (py-2 px-4 -> p-2). Worth saying so explicitly.
    return {
      direction: "changed",
      explanation: `${label} kept the same rendered values but the classes changed (${transition})`,
    };
  }

  const detail = pairs
    .map((p) => `${p.property} ${p.before ?? "unset"} → ${p.after ?? "unset"}`)
    .join(", ");
  const lengths = pairs.map((p) => ({
    before: p.before === undefined ? null : parseLengthPx(p.before),
    after: p.after === undefined ? null : parseLengthPx(p.after),
  }));
  const deltas = lengths.every((l) => l.before !== null && l.after !== null)
    ? lengths.map((l) => l.after! - l.before!)
    : [];
  const direction: ChangeDirection =
    deltas.length > 0 && deltas.every((d) => d > 0)
      ? "increased"
      : deltas.length > 0 && deltas.every((d) => d < 0)
        ? "decreased"
        : "changed";

  return {
    direction,
    explanation: `${label} changed per side — ${detail} (${transition})`,
  };
}

function diffNodeStyles(
  before: ReconciliationReport,
  after: ReconciliationReport,
  beforeNodes: Map<string, DomNode>,
  afterNodes: Map<string, DomNode>,
): NodeStyleChange[] {
  const changes: NodeStyleChange[] = [];

  for (const [id, beforeNode] of beforeNodes) {
    const afterNode = afterNodes.get(id);
    if (!afterNode) continue;

    const beforeClasses = before.classes[id] ?? [];
    const afterClasses = after.classes[id] ?? [];
    const beforeSet = new Set(beforeClasses);
    const afterSet = new Set(afterClasses);

    const removed = beforeClasses.filter((c) => !afterSet.has(c));
    const added = afterClasses.filter((c) => !beforeSet.has(c));
    if (removed.length === 0 && added.length === 0) continue;

    // Group both sides by family so a removal and its replacement land in one change.
    const byFamily = new Map<StyleFamily, { before: string[]; after: string[] }>();
    const bucket = (family: StyleFamily) => {
      let entry = byFamily.get(family);
      if (!entry) byFamily.set(family, (entry = { before: [], after: [] }));
      return entry;
    };
    for (const cls of removed) bucket(classFamily(cls)).before.push(cls);
    for (const cls of added) bucket(classFamily(cls)).after.push(cls);

    for (const family of FAMILY_ORDER) {
      const entry = byFamily.get(family);
      if (!entry) continue;
      const pairs = changedProperties(family, beforeNode, afterNode);
      changes.push({
        nodeId: id,
        tag: afterNode.tag,
        family,
        beforeClasses: entry.before,
        afterClasses: entry.after,
        ...describeChange(family, pairs, entry.before, entry.after),
      });
    }
  }

  return changes;
}

function generatedByKey(tokens: GeneratedToken[]): Map<string, GeneratedToken> {
  return new Map(tokens.map((token) => [token.key, token]));
}

function diffTokens(before: ReconciliationReport, after: ReconciliationReport): TokenChange[] {
  const changes: TokenChange[] = [];

  for (const category of TOKEN_CATEGORIES) {
    const beforeGenerated = generatedByKey(before.tokens.generated[category] ?? []);
    const afterGenerated = generatedByKey(after.tokens.generated[category] ?? []);

    for (const [key, token] of afterGenerated) {
      const prior = beforeGenerated.get(key);
      if (!prior) {
        changes.push({
          category,
          key,
          kind: "minted",
          afterValue: token.value,
          explanation: `New ${category} token "${key}" (${token.value}) minted for ${token.sourceValues.join(", ")}.`,
        });
      } else if (prior.value !== token.value) {
        changes.push({
          category,
          key,
          kind: "redefined",
          beforeValue: prior.value,
          afterValue: token.value,
          explanation: `${category} token "${key}" was redefined ${prior.value} → ${token.value}.`,
        });
      }
    }
    for (const [key, token] of beforeGenerated) {
      if (afterGenerated.has(key)) continue;
      changes.push({
        category,
        key,
        kind: "dropped",
        beforeValue: token.value,
        explanation: `${category} token "${key}" (${token.value}) is no longer minted — the theme covers that value now, or nothing uses it.`,
      });
    }

    const beforeStock = before.tokens.stockMatches[category] ?? {};
    const afterStock = after.tokens.stockMatches[category] ?? {};
    for (const [raw, key] of Object.entries(afterStock)) {
      const prior = beforeStock[raw];
      if (prior === undefined) {
        changes.push({
          category,
          key: raw,
          kind: "stock-gained",
          afterValue: key,
          explanation: `${raw} now resolves to the theme's "${key}".`,
        });
      } else if (prior !== key) {
        changes.push({
          category,
          key: raw,
          kind: "redefined",
          beforeValue: prior,
          afterValue: key,
          explanation: `${raw} moved from the theme's "${prior}" to "${key}".`,
        });
      }
    }
    for (const [raw, key] of Object.entries(beforeStock)) {
      if (raw in afterStock) continue;
      changes.push({
        category,
        key: raw,
        kind: "stock-lost",
        beforeValue: key,
        explanation: `${raw} no longer appears on the page (it matched the theme's "${key}").`,
      });
    }

    const beforeClamped = before.tokens.clamped[category] ?? {};
    const afterClamped = after.tokens.clamped[category] ?? {};
    const unit = category === "color" ? "RGB units" : "px";
    for (const raw of new Set([...Object.keys(beforeClamped), ...Object.keys(afterClamped)])) {
      // Only compare values both runs actually matched; a value that vanished is reported above.
      if (!(raw in beforeStock) || !(raw in afterStock)) continue;
      const b = beforeClamped[raw] ?? 0;
      const a = afterClamped[raw] ?? 0;
      if (a === b) continue;
      changes.push({
        category,
        key: raw,
        kind: a < b ? "clamp-tightened" : "clamp-loosened",
        beforeValue: String(b),
        afterValue: String(a),
        explanation:
          a === 0
            ? `${raw} is now an exact theme match (it used to snap ${b} ${unit} away).`
            : `${raw} snaps ${a < b ? "closer to" : "further from"} the theme — ${b} → ${a} ${unit} away.`,
      });
    }
  }

  return changes;
}

function suggestionKey(s: Suggestion): string {
  return [s.nodeId, s.property, s.kind, s.rawValue].join("|");
}

function unhandledKey(u: UnhandledValue): string {
  return [u.nodeId, u.property, u.rawValue].join("|");
}

function debtEntry(
  kind: DebtChange["kind"],
  beforeKeys: Set<string>,
  afterKeys: Set<string>,
  noun: string,
): DebtChange | null {
  const resolved = [...beforeKeys].filter((k) => !afterKeys.has(k)).length;
  const introduced = [...afterKeys].filter((k) => !beforeKeys.has(k)).length;
  if (resolved === 0 && introduced === 0) return null;

  const parts: string[] = [];
  if (resolved > 0) parts.push(`${resolved} ${noun} resolved`);
  if (introduced > 0) parts.push(`${introduced} new ${noun}`);

  return {
    kind,
    resolved,
    introduced,
    before: beforeKeys.size,
    after: afterKeys.size,
    explanation: `${parts.join(", ")} (${beforeKeys.size} → ${afterKeys.size} total).`,
  };
}

function diffDebt(before: ReconciliationReport, after: ReconciliationReport): DebtChange[] {
  const changes: DebtChange[] = [];

  for (const kind of SUGGESTION_KINDS) {
    const beforeKeys = new Set(before.suggestions.filter((s) => s.kind === kind).map(suggestionKey));
    const afterKeys = new Set(after.suggestions.filter((s) => s.kind === kind).map(suggestionKey));
    const entry = debtEntry(kind, beforeKeys, afterKeys, `${kind} value(s)`);
    if (entry) changes.push(entry);
  }

  const entry = debtEntry(
    "unhandled",
    new Set(before.unhandled.map(unhandledKey)),
    new Set(after.unhandled.map(unhandledKey)),
    "unmapped value(s)",
  );
  if (entry) changes.push(entry);

  return changes;
}

function buildHeadline(diff: Omit<SemanticDiff, "headline">): string {
  const parts: string[] = [];

  const restyled = new Set(diff.nodes.map((n) => n.nodeId)).size;
  if (restyled > 0) parts.push(`${restyled} node(s) restyled`);

  const added = diff.structure.filter((s) => s.kind === "added").length;
  const removed = diff.structure.filter((s) => s.kind === "removed").length;
  const retagged = diff.structure.filter((s) => s.kind === "retagged").length;
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (retagged > 0) parts.push(`${retagged} retagged`);

  const minted = diff.tokens.filter((t) => t.kind === "minted").length;
  const dropped = diff.tokens.filter((t) => t.kind === "dropped").length;
  if (minted > 0) parts.push(`${minted} token(s) minted`);
  if (dropped > 0) parts.push(`${dropped} token(s) dropped`);

  const resolved = diff.debt.reduce((sum, d) => sum + d.resolved, 0);
  const introduced = diff.debt.reduce((sum, d) => sum + d.introduced, 0);
  if (resolved !== introduced) {
    const net = Math.abs(resolved - introduced);
    parts.push(`token debt ${resolved > introduced ? "down" : "up"} ${net}`);
  } else if (resolved > 0) {
    parts.push(`token debt level (${resolved} traded)`);
  }

  if (parts.length === 0) return "The two runs describe the same design.";
  return `${parts.join(", ")}.`;
}

/**
 * Compares two windtailor runs and explains what the change means for the design system, rather
 * than which bytes of report.json moved. Comparing runs of different URLs or selectors is allowed
 * but reported as a context warning first — node ids line up by position, not by identity.
 */
export function diffReports(before: ReconciliationReport, after: ReconciliationReport): SemanticDiff {
  const beforeNodes = flattenElements(before.tree);
  const afterNodes = flattenElements(after.tree);

  const partial: Omit<SemanticDiff, "headline"> = {
    before: summarize(before),
    after: summarize(after),
    contextWarnings: diffRunContext(before, after),
    structure: diffStructure(beforeNodes, afterNodes),
    nodes: diffNodeStyles(before, after, beforeNodes, afterNodes),
    tokens: diffTokens(before, after),
    debt: diffDebt(before, after),
  };

  return { ...partial, headline: buildHeadline(partial) };
}
