import type { SuggestionKind, TokenCategory } from "../model/types.js";

/**
 * The semantic families a Tailwind class can belong to. Two classes in the same family on the
 * same node describe the same design decision, so a removal and an addition that share a family
 * are one change ("padding grew"), not two ("p-2 gone, p-6 arrived").
 */
export type StyleFamily =
  | "padding"
  | "margin"
  | "inset"
  | "size"
  | "radius"
  | "border-width"
  | "border-color"
  | "background"
  | "text-color"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "text-align"
  | "display"
  | "position"
  | "opacity"
  | "other";

/** One way the two runs did not target the same thing — reported before anything else. */
export interface RunContextChange {
  field: "sourceUrl" | "selector" | "themeSource";
  before: string;
  after: string;
  message: string;
}

export interface StructureChange {
  kind: "added" | "removed" | "retagged";
  nodeId: string;
  tag: string;
  /** Only set for "retagged". */
  beforeTag?: string;
}

export type ChangeDirection = "increased" | "decreased" | "changed" | "added" | "removed";

export interface NodeStyleChange {
  nodeId: string;
  tag: string;
  family: StyleFamily;
  beforeClasses: string[];
  afterClasses: string[];
  /** The underlying computed value behind the class, when one property drove the family. */
  beforeValue?: string;
  afterValue?: string;
  direction: ChangeDirection;
  /** Signed delta in `unit` (px for lengths, RGB distance for colors), when measurable. */
  magnitude?: number;
  unit?: "px" | "rgb";
  explanation: string;
}

export type TokenChangeKind = "minted" | "dropped" | "redefined" | "clamp-tightened" | "clamp-loosened" | "stock-gained" | "stock-lost";

export interface TokenChange {
  category: TokenCategory;
  /** Token key for generated tokens, raw computed value for stock matches and clamp movement. */
  key: string;
  kind: TokenChangeKind;
  beforeValue?: string;
  afterValue?: string;
  explanation: string;
}

/** Net movement in the compromises windtailor had to make — suggestions plus unmapped values. */
export interface DebtChange {
  kind: SuggestionKind | "unhandled";
  resolved: number;
  introduced: number;
  before: number;
  after: number;
  explanation: string;
}

export interface DiffRunSummary {
  sourceUrl: string;
  selector: string;
  themeSource?: string;
  nodeCount: number;
}

export interface SemanticDiff {
  before: DiffRunSummary;
  after: DiffRunSummary;
  contextWarnings: RunContextChange[];
  structure: StructureChange[];
  nodes: NodeStyleChange[];
  tokens: TokenChange[];
  debt: DebtChange[];
  /** One-line gist of the whole diff, so a caller does not have to walk the structure. */
  headline: string;
}
