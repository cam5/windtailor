import { resolveTokenKey } from "../tokens/cluster.js";
import type { AssignedClasses, CapturedProperty, DomNode, Suggestion, TokenTable, UnhandledValue } from "../model/types.js";
import { formatArbitrary, mapDiscreteValue, SCALE_PROPERTIES } from "./propertyMap.js";
import { collapseGroupedClasses } from "./groups.js";
import { suggestionsForNode } from "./suggestions.js";

function classesForNode(node: DomNode, tokens: TokenTable, unhandled: UnhandledValue[]): string[] {
  const { classes: groupedClasses, consumed } = collapseGroupedClasses(node.style, tokens);
  const classes: string[] = [...groupedClasses];

  for (const [property, rawValue] of Object.entries(node.style)) {
    if (consumed.has(property as CapturedProperty)) continue;

    const scaleProp = SCALE_PROPERTIES[property as CapturedProperty];
    if (scaleProp) {
      // Scale properties always resolve to a class, stock/generated token or arbitrary-value fallback.
      const key = resolveTokenKey(tokens, scaleProp.category, rawValue);
      classes.push(key ? `${scaleProp.prefix}${key}` : formatArbitrary(scaleProp.prefix, rawValue));
      continue;
    }

    if (property === "lineHeight") {
      classes.push(rawValue === "normal" ? "leading-normal" : formatArbitrary("leading-", rawValue));
      continue;
    }

    const discrete = mapDiscreteValue(property as CapturedProperty, rawValue);
    if (discrete) {
      classes.push(discrete);
    } else {
      // Discrete-value properties have no arbitrary-value escape hatch (unlike scale properties),
      // so an unrecognized value can't become a class today. Record it rather than dropping it
      // silently — see UnhandledValue and the plan's v2 note on a fuller "account for everything" pass.
      unhandled.push({ nodeId: node.id, property, rawValue });
    }
  }

  return classes;
}

/** Pass 2: walk the tree, resolving every node's captured styles into a Tailwind class list. */
export function assignClasses(
  root: DomNode,
  tokens: TokenTable,
): { classes: AssignedClasses; unhandled: UnhandledValue[]; suggestions: Suggestion[] } {
  const classes: AssignedClasses = {};
  const unhandled: UnhandledValue[] = [];
  const suggestions: Suggestion[] = [];

  function visit(node: DomNode): void {
    if (node.tag !== "#text") {
      classes[node.id] = classesForNode(node, tokens, unhandled);
      suggestions.push(...suggestionsForNode(node, tokens));
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return { classes, unhandled, suggestions };
}
