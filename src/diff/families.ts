import type { CapturedProperty } from "../model/types.js";
import { parseColor } from "../tokens/color.js";
import { parseLengthPx } from "../tokens/units.js";
import type { StyleFamily } from "./types.js";

/** Fixed report order, roughly box model outward-in then typography, so two diffs read the same way. */
export const FAMILY_ORDER: StyleFamily[] = [
  "display",
  "position",
  "size",
  "margin",
  "padding",
  "inset",
  "background",
  "border-width",
  "border-color",
  "radius",
  "text-color",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "opacity",
  "other",
];

/** Human label used in the prose explanations. */
export const FAMILY_LABEL: Record<StyleFamily, string> = {
  padding: "padding",
  margin: "margin",
  inset: "inset",
  size: "size",
  radius: "corner radius",
  "border-width": "border width",
  "border-color": "border color",
  background: "background",
  "text-color": "text color",
  "font-size": "font size",
  "font-weight": "font weight",
  "line-height": "line height",
  "text-align": "text alignment",
  display: "display",
  position: "position",
  opacity: "opacity",
  other: "other",
};

/** The captured properties whose computed values back each family — the source of direction and magnitude. */
export const FAMILY_PROPERTIES: Record<StyleFamily, CapturedProperty[]> = {
  padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
  margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
  inset: ["top", "right", "bottom", "left"],
  size: ["width", "height"],
  radius: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"],
  "border-width": ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
  "border-color": ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"],
  background: ["backgroundColor"],
  "text-color": ["color"],
  "font-size": ["fontSize"],
  "font-weight": ["fontWeight"],
  "line-height": ["lineHeight"],
  "text-align": ["textAlign"],
  display: ["display"],
  position: ["position"],
  opacity: ["opacity"],
  other: [],
};

/** Families whose values are colors rather than lengths — reported as a hex pair plus perceptual distance. */
export const COLOR_FAMILIES = new Set<StyleFamily>(["background", "text-color", "border-color"]);

const DISPLAY_CLASSES = new Set([
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "hidden",
  "contents",
  "table",
  "inline-table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row-group",
  "table-row",
  "flow-root",
  "list-item",
]);

const POSITION_CLASSES = new Set(["static", "relative", "absolute", "fixed", "sticky"]);

const TEXT_ALIGN_CLASSES = new Set(["text-left", "text-center", "text-right", "text-justify", "text-start", "text-end"]);

const FONT_WEIGHT_CLASSES = new Set([
  "font-thin",
  "font-extralight",
  "font-light",
  "font-normal",
  "font-medium",
  "font-semibold",
  "font-bold",
  "font-extrabold",
  "font-black",
]);

/** Tailwind's stock font-size scale keys. Generated font-size tokens are bare px numbers instead (see cluster.ts). */
const FONT_SIZE_KEYS = new Set(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"]);

const PREFIX_FAMILIES: Array<[string, StyleFamily]> = [
  ["px-", "padding"],
  ["py-", "padding"],
  ["pt-", "padding"],
  ["pr-", "padding"],
  ["pb-", "padding"],
  ["pl-", "padding"],
  ["p-", "padding"],
  ["mx-", "margin"],
  ["my-", "margin"],
  ["mt-", "margin"],
  ["mr-", "margin"],
  ["mb-", "margin"],
  ["ml-", "margin"],
  ["m-", "margin"],
  ["inset-", "inset"],
  ["top-", "inset"],
  ["right-", "inset"],
  ["bottom-", "inset"],
  ["left-", "inset"],
  ["w-", "size"],
  ["h-", "size"],
  ["rounded-", "radius"],
  ["bg-", "background"],
  ["leading-", "line-height"],
  ["opacity-", "opacity"],
];

/** Unwraps a Tailwind arbitrary-value fragment ("[9px]" -> "9px"), restoring the underscore escaping. */
function arbitraryContent(fragment: string): string | null {
  if (!fragment.startsWith("[") || !fragment.endsWith("]")) return null;
  return fragment.slice(1, -1).replace(/_/g, " ");
}

/** `border`, `border-t`, `border-2`, `border-x-4` are widths; `border-red-500`, `border-t-[#fff]` are colors. */
function borderFamily(cls: string): StyleFamily {
  let rest = cls.slice("border".length);
  if (rest === "") return "border-width"; // bare `border` is Tailwind's 1px width
  rest = rest.slice(1); // drop the separating "-"

  const sideMatch = /^([trblxy])(?:-(.*))?$/.exec(rest);
  if (sideMatch) {
    if (sideMatch[2] === undefined) return "border-width"; // `border-t` is 1px on that side
    rest = sideMatch[2];
  }

  if (/^\d+$/.test(rest)) return "border-width";
  const arbitrary = arbitraryContent(rest);
  if (arbitrary !== null) return parseColor(arbitrary) ? "border-color" : "border-width";
  return "border-color";
}

/** `text-` is overloaded across alignment, font size and color — resolve it by what follows. */
function textFamily(cls: string): StyleFamily {
  if (TEXT_ALIGN_CLASSES.has(cls)) return "text-align";
  const rest = cls.slice("text-".length);

  const arbitrary = arbitraryContent(rest);
  if (arbitrary !== null) {
    if (parseLengthPx(arbitrary) !== null) return "font-size";
    return parseColor(arbitrary) ? "text-color" : "other";
  }

  if (FONT_SIZE_KEYS.has(rest)) return "font-size";
  if (/^\d+(\.\d+)?$/.test(rest)) return "font-size"; // a generated font-size token key
  return "text-color";
}

/**
 * Maps one Tailwind class emitted by src/assign/ to the design decision it expresses. This is what
 * makes the diff semantic: `p-2` leaving and `p-6` arriving are one change to a node's padding,
 * not two unrelated class edits.
 */
export function classFamily(rawClass: string): StyleFamily {
  // Negative utilities carry the sign in front of the whole class (`-mt-4`), see propertyMap.ts.
  const cls = rawClass.startsWith("-") ? rawClass.slice(1) : rawClass;

  if (DISPLAY_CLASSES.has(cls)) return "display";
  if (POSITION_CLASSES.has(cls)) return "position";
  if (FONT_WEIGHT_CLASSES.has(cls)) return "font-weight";
  if (cls === "border" || cls.startsWith("border-")) return borderFamily(cls);
  if (cls.startsWith("text-")) return textFamily(cls);

  for (const [prefix, family] of PREFIX_FAMILIES) {
    if (cls.startsWith(prefix)) return family;
  }
  return "other";
}
