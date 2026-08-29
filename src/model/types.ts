/** CSS properties captured per node. Kept narrow on purpose — see plan's MVP scope. */
export const CAPTURED_PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "color",
  "textAlign",
  "backgroundColor",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "opacity",
] as const;

export type CapturedProperty = (typeof CAPTURED_PROPERTIES)[number];

export type StyleRecord = Partial<Record<CapturedProperty, string>>;

export interface DomNode {
  /** Stable path-based id, e.g. "0.2.1", rooted at the selected target node. */
  id: string;
  tag: string;
  attributes: Record<string, string>;
  /** Present (and children omitted) when this "node" is a text run. */
  textContent?: string;
  children: DomNode[];
  style: StyleRecord;
}

export type TokenCategory = "spacing" | "color" | "fontSize" | "radius";

export interface GeneratedToken {
  category: TokenCategory;
  /** Key as it will appear under theme.extend, e.g. "8.5" or "brand-500". */
  key: string;
  /** CSS value for the token, e.g. "2.125rem" or "#111827". */
  value: string;
  /** Raw observed values that clustered into this token, for debugging. */
  sourceValues: string[];
}

export interface TokenTable {
  /** category -> (raw computed value -> Tailwind theme scale key, e.g. "3.5" or "blue-500") */
  stockMatches: Record<TokenCategory, Record<string, string>>;
  /** category -> generated tokens minted for values that didn't fit the stock scale */
  generated: Record<TokenCategory, GeneratedToken[]>;
}

export interface AssignedClasses {
  [nodeId: string]: string[];
}

/**
 * A captured property that pass 2 could not turn into a class at all (as opposed to scale
 * properties, which always fall back to an arbitrary-value class). Surfaced so nothing is
 * silently dropped — see plan's v2 note on a fuller "account for everything" pass.
 */
export interface UnhandledValue {
  nodeId: string;
  property: string;
  rawValue: string;
}

export interface ReconciliationReport {
  sourceUrl: string;
  selector: string;
  tree: DomNode;
  tokens: TokenTable;
  classes: AssignedClasses;
  unhandled: UnhandledValue[];
}
