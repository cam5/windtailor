import type { CapturedProperty, DomNode, Suggestion, SuggestionKind, TokenCategory, TokenTable } from "../model/types.js";
import { formatArbitrary, SCALE_PROPERTIES } from "./propertyMap.js";

interface Classification {
  resolvedKey: string;
  kind: SuggestionKind;
  distance?: number;
}

/** Same lookup order as resolveTokenKey (cluster.ts), but keeping track of *which* branch matched. */
function classifyScaleValue(category: TokenCategory, rawValue: string, tokens: TokenTable): Classification | null {
  const generatedMatch = tokens.generated[category].find((t) => t.sourceValues.includes(rawValue));
  if (generatedMatch) return { resolvedKey: generatedMatch.key, kind: "generated" };

  const stockKey = tokens.stockMatches[category][rawValue];
  if (stockKey) {
    const distance = tokens.clamped[category][rawValue];
    return distance === undefined ? null : { resolvedKey: stockKey, kind: "clamped", distance };
  }

  return { resolvedKey: rawValue, kind: "arbitrary" };
}

function noteFor(category: TokenCategory | undefined, kind: SuggestionKind, rawValue: string, resolvedClass: string, distance?: number): string {
  switch (kind) {
    case "clamped":
      return category === "color"
        ? `Snapped to "${resolvedClass}" — source color ${rawValue} was ${distance!.toFixed(1)} RGB units from an exact match.`
        : `Snapped to "${resolvedClass}" — source value ${rawValue} was ${distance}px off the exact scale value.`;
    case "generated":
      return `Minted a new token for ${rawValue} ("${resolvedClass}") — written to this run's tailwind.config.tokens.js, not your own config.`;
    case "arbitrary":
      return `No scale value matched ${rawValue} — emitted as a raw arbitrary-value class.`;
  }
}

/**
 * Pass 3 (advisory, doesn't affect output classes): flags a node's scale-property values that
 * got clamped to a nearby stock/custom entry, minted a brand-new token, or fell back to a raw
 * arbitrary-value class — the same categories --theme-file/--theme-json feed in, so a caller can
 * decide what's worth hoisting into their own theme before the next run.
 */
export function suggestionsForNode(node: DomNode, tokens: TokenTable): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const [property, rawValue] of Object.entries(node.style)) {
    const scaleProp = SCALE_PROPERTIES[property as CapturedProperty];
    if (scaleProp) {
      const result = classifyScaleValue(scaleProp.category, rawValue, tokens);
      if (result) {
        const resolvedClass =
          result.kind === "arbitrary" ? formatArbitrary(scaleProp.prefix, rawValue) : `${scaleProp.prefix}${result.resolvedKey}`;
        suggestions.push({
          nodeId: node.id,
          property: property as CapturedProperty,
          category: scaleProp.category,
          rawValue,
          resolvedClass,
          kind: result.kind,
          distance: result.distance,
          note: noteFor(scaleProp.category, result.kind, rawValue, resolvedClass, result.distance),
        });
      }
      continue;
    }

    if (property === "lineHeight" && rawValue !== "normal") {
      const resolvedClass = formatArbitrary("leading-", rawValue);
      suggestions.push({
        nodeId: node.id,
        property: "lineHeight",
        rawValue,
        resolvedClass,
        kind: "arbitrary",
        note: noteFor(undefined, "arbitrary", rawValue, resolvedClass),
      });
    }
  }

  return suggestions;
}
