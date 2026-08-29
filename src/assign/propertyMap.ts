import type { CapturedProperty, TokenCategory } from "../model/types.js";

export interface ScaleProperty {
  category: TokenCategory;
  /** Utility class prefix this property's resolved token key gets appended to, e.g. "mt-" + "3.5" -> "mt-3.5". */
  prefix: string;
  /**
   * True only for properties that can genuinely go negative in real CSS (margin, inset) — never
   * padding/width/height/font-size/color/radius. A generated token minted from a negative
   * computed value (e.g. "top: -5px") gets a negative key ("-1.25"); Tailwind's negative
   * utilities move that sign in front of the whole class ("-top-1.25"), not inline after the
   * prefix ("top--1.25", which isn't a real Tailwind class and silently fails to resolve).
   */
  signAware?: boolean;
}

/** The raw-value escape hatch for a scale property with no scale match at all, e.g. "w-[437px]". */
export function formatArbitrary(prefix: string, rawValue: string): string {
  return `${prefix}[${rawValue.replace(/\s+/g, "_")}]`;
}

/** See ScaleProperty.signAware. `key` may be a real token key (possibly negative) or an arbitrary-value bracket fragment (left untouched — Tailwind writes the sign inside the brackets there, e.g. "[-17px]"). */
export function formatScaleClass(prefix: string, key: string): string {
  if (key.startsWith("[")) return `${prefix}${key}`;
  return key.startsWith("-") ? `-${prefix}${key.slice(1)}` : `${prefix}${key}`;
}

/** Properties whose value comes from a clustered/snapped numeric or color scale (the two-pass token pipeline). */
export const SCALE_PROPERTIES: Partial<Record<CapturedProperty, ScaleProperty>> = {
  width: { category: "spacing", prefix: "w-" },
  height: { category: "spacing", prefix: "h-" },
  marginTop: { category: "spacing", prefix: "mt-", signAware: true },
  marginRight: { category: "spacing", prefix: "mr-", signAware: true },
  marginBottom: { category: "spacing", prefix: "mb-", signAware: true },
  marginLeft: { category: "spacing", prefix: "ml-", signAware: true },
  paddingTop: { category: "spacing", prefix: "pt-" },
  paddingRight: { category: "spacing", prefix: "pr-" },
  paddingBottom: { category: "spacing", prefix: "pb-" },
  paddingLeft: { category: "spacing", prefix: "pl-" },
  top: { category: "spacing", prefix: "top-", signAware: true },
  right: { category: "spacing", prefix: "right-", signAware: true },
  bottom: { category: "spacing", prefix: "bottom-", signAware: true },
  left: { category: "spacing", prefix: "left-", signAware: true },
  fontSize: { category: "fontSize", prefix: "text-" },
  color: { category: "color", prefix: "text-" },
  backgroundColor: { category: "color", prefix: "bg-" },
  borderTopColor: { category: "color", prefix: "border-t-" },
  borderRightColor: { category: "color", prefix: "border-r-" },
  borderBottomColor: { category: "color", prefix: "border-b-" },
  borderLeftColor: { category: "color", prefix: "border-l-" },
  borderTopLeftRadius: { category: "radius", prefix: "rounded-tl-" },
  borderTopRightRadius: { category: "radius", prefix: "rounded-tr-" },
  borderBottomRightRadius: { category: "radius", prefix: "rounded-br-" },
  borderBottomLeftRadius: { category: "radius", prefix: "rounded-bl-" },
};

const DISPLAY_MAP: Record<string, string> = {
  block: "block",
  inline: "inline",
  "inline-block": "inline-block",
  flex: "flex",
  "inline-flex": "inline-flex",
  grid: "grid",
  "inline-grid": "inline-grid",
  none: "hidden",
  contents: "contents",
  table: "table",
  "inline-table": "inline-table",
  "table-caption": "table-caption",
  "table-cell": "table-cell",
  "table-column": "table-column",
  "table-column-group": "table-column-group",
  "table-footer-group": "table-footer-group",
  "table-header-group": "table-header-group",
  "table-row-group": "table-row-group",
  "table-row": "table-row",
  "flow-root": "flow-root",
  "list-item": "list-item",
};

const POSITION_MAP: Record<string, string> = {
  static: "static",
  relative: "relative",
  absolute: "absolute",
  fixed: "fixed",
  sticky: "sticky",
};

const TEXT_ALIGN_MAP: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
  start: "text-start",
  end: "text-end",
};

const FONT_WEIGHT_MAP: Record<string, string> = {
  "100": "font-thin",
  "200": "font-extralight",
  "300": "font-light",
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
  normal: "font-normal",
  bold: "font-bold",
};

const BORDER_WIDTH_SCALE: Array<{ px: number; suffix: string }> = [
  { px: 0, suffix: "-0" },
  { px: 1, suffix: "" },
  { px: 2, suffix: "-2" },
  { px: 4, suffix: "-4" },
  { px: 8, suffix: "-8" },
];

/** Snaps a border-width value to the nearest stock class suffix, e.g. "2px" -> "-2", "1px" -> "" (Tailwind's bare `border`/`border-t`/... means 1px). */
export function nearestBorderWidthSuffix(rawValue: string): string | null {
  const px = parseFloat(rawValue);
  if (Number.isNaN(px)) return null;
  return BORDER_WIDTH_SCALE.reduce((best, entry) => (Math.abs(entry.px - px) < Math.abs(best.px - px) ? entry : best)).suffix;
}

const OPACITY_SCALE = [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100];

const BORDER_SIDE_PREFIX: Partial<Record<CapturedProperty, string>> = {
  borderTopWidth: "border-t",
  borderRightWidth: "border-r",
  borderBottomWidth: "border-b",
  borderLeftWidth: "border-l",
};

/**
 * Resolves the small set of MVP properties whose Tailwind class comes from a fixed/enumerable
 * mapping rather than the clustered token scales (display, position, text-align, font-weight,
 * border-width, opacity). Line-height is intentionally left out of scope here (see plan) and
 * falls back to an arbitrary-value class upstream.
 */
export function mapDiscreteValue(property: CapturedProperty, rawValue: string): string | null {
  switch (property) {
    case "display":
      return DISPLAY_MAP[rawValue] ?? null;
    case "position":
      return POSITION_MAP[rawValue] ?? null;
    case "textAlign":
      return TEXT_ALIGN_MAP[rawValue] ?? null;
    case "fontWeight":
      return FONT_WEIGHT_MAP[rawValue] ?? null;
    case "opacity": {
      const pct = Math.round(parseFloat(rawValue) * 100);
      const nearest = OPACITY_SCALE.reduce((best, val) => (Math.abs(val - pct) < Math.abs(best - pct) ? val : best));
      return `opacity-${nearest}`;
    }
    case "borderTopWidth":
    case "borderRightWidth":
    case "borderBottomWidth":
    case "borderLeftWidth": {
      const suffix = nearestBorderWidthSuffix(rawValue);
      return suffix === null ? null : `${BORDER_SIDE_PREFIX[property]}${suffix}`;
    }
    default:
      return null;
  }
}
