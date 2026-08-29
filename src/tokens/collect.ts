import { SCALE_PROPERTIES } from "../assign/propertyMap.js";
import type { DomNode, TokenCategory } from "../model/types.js";

export type CollectedValues = Record<TokenCategory, Set<string>>;

/** Pass 1: walk the tree and gather every distinct raw computed value per token category. */
export function collectValues(root: DomNode): CollectedValues {
  const collected: CollectedValues = {
    spacing: new Set(),
    color: new Set(),
    fontSize: new Set(),
    radius: new Set(),
  };

  function visit(node: DomNode): void {
    for (const [property, meta] of Object.entries(SCALE_PROPERTIES)) {
      const value = node.style[property as keyof typeof node.style];
      if (value) collected[meta.category].add(value);
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return collected;
}
