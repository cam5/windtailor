import { resolveTokenKey } from "../tokens/cluster.js";
import { nearestBorderWidthSuffix } from "./propertyMap.js";
import type { CapturedProperty, StyleRecord, TokenCategory, TokenTable } from "../model/types.js";

function arbitraryFragment(rawValue: string): string {
  return `[${rawValue.replace(/\s+/g, "_")}]`;
}

/** Fragment resolver for a token-scale category (spacing, color, radius): stock/generated key, or an arbitrary-value fallback. */
function scaleFragment(category: TokenCategory, tokens: TokenTable): (rawValue: string) => string {
  return (rawValue) => resolveTokenKey(tokens, category, rawValue) ?? arbitraryFragment(rawValue);
}

interface XYGroup {
  kind: "xy";
  /** [top, right, bottom, left]. */
  members: [CapturedProperty, CapturedProperty, CapturedProperty, CapturedProperty];
  resolveFragment: (rawValue: string) => string | null;
  allPrefix: string;
  xPrefix: string;
  yPrefix: string;
}

interface CornerGroup {
  kind: "corners";
  /** [topLeft, topRight, bottomRight, bottomLeft]. */
  members: [CapturedProperty, CapturedProperty, CapturedProperty, CapturedProperty];
  resolveFragment: (rawValue: string) => string | null;
  allPrefix: string;
  topPrefix: string;
  rightPrefix: string;
  bottomPrefix: string;
  leftPrefix: string;
}

type Group = XYGroup | CornerGroup;

/**
 * Property quads Tailwind lets you collapse into a shorter class (or pair of classes) when the
 * four sides agree, rather than always emitting one class per longhand. Margin/padding/inset/
 * border-width/border-color follow Tailwind's all/x/y convention; border-radius instead follows
 * an all/top/right/bottom/left *side* convention (there's no x/y for corners).
 */
function buildGroups(tokens: TokenTable): Group[] {
  return [
    {
      kind: "xy",
      members: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
      resolveFragment: scaleFragment("spacing", tokens),
      allPrefix: "m-",
      xPrefix: "mx-",
      yPrefix: "my-",
    },
    {
      kind: "xy",
      members: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
      resolveFragment: scaleFragment("spacing", tokens),
      allPrefix: "p-",
      xPrefix: "px-",
      yPrefix: "py-",
    },
    {
      kind: "xy",
      members: ["top", "right", "bottom", "left"],
      resolveFragment: scaleFragment("spacing", tokens),
      allPrefix: "inset-",
      xPrefix: "inset-x-",
      yPrefix: "inset-y-",
    },
    {
      kind: "xy",
      members: ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"],
      resolveFragment: scaleFragment("color", tokens),
      allPrefix: "border-",
      xPrefix: "border-x-",
      yPrefix: "border-y-",
    },
    {
      kind: "xy",
      members: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
      resolveFragment: nearestBorderWidthSuffix,
      allPrefix: "border",
      xPrefix: "border-x",
      yPrefix: "border-y",
    },
    {
      kind: "corners",
      members: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"],
      resolveFragment: scaleFragment("radius", tokens),
      allPrefix: "rounded-",
      topPrefix: "rounded-t-",
      rightPrefix: "rounded-r-",
      bottomPrefix: "rounded-b-",
      leftPrefix: "rounded-l-",
    },
  ];
}

function collapseXY(group: XYGroup, style: StyleRecord): { classes: string[]; consumed: CapturedProperty[] } | null {
  const [top, right, bottom, left] = group.members;
  if (!(top in style) || !(right in style) || !(bottom in style) || !(left in style)) return null;

  const ft = group.resolveFragment(style[top]!);
  const fr = group.resolveFragment(style[right]!);
  const fb = group.resolveFragment(style[bottom]!);
  const fl = group.resolveFragment(style[left]!);
  if (ft === null || fr === null || fb === null || fl === null) return null;

  if (ft === fr && fr === fb && fb === fl) {
    return { classes: [`${group.allPrefix}${ft}`], consumed: group.members };
  }
  if (ft === fb && fr === fl) {
    return { classes: [`${group.yPrefix}${ft}`, `${group.xPrefix}${fr}`], consumed: group.members };
  }
  return null;
}

function collapseCorners(group: CornerGroup, style: StyleRecord): { classes: string[]; consumed: CapturedProperty[] } | null {
  const [topLeft, topRight, bottomRight, bottomLeft] = group.members;
  if (!(topLeft in style) || !(topRight in style) || !(bottomRight in style) || !(bottomLeft in style)) return null;

  const ftl = group.resolveFragment(style[topLeft]!);
  const ftr = group.resolveFragment(style[topRight]!);
  const fbr = group.resolveFragment(style[bottomRight]!);
  const fbl = group.resolveFragment(style[bottomLeft]!);
  if (ftl === null || ftr === null || fbr === null || fbl === null) return null;

  if (ftl === ftr && ftr === fbr && fbr === fbl) {
    return { classes: [`${group.allPrefix}${ftl}`], consumed: group.members };
  }
  if (ftl === ftr && fbl === fbr) {
    return { classes: [`${group.topPrefix}${ftl}`, `${group.bottomPrefix}${fbl}`], consumed: group.members };
  }
  if (ftl === fbl && ftr === fbr) {
    return { classes: [`${group.leftPrefix}${ftl}`, `${group.rightPrefix}${ftr}`], consumed: group.members };
  }
  return null;
}

/**
 * Folds four-sided property quads into Tailwind's shorter all/x/y (or all/t/r/b/l, for radius)
 * classes wherever all four sides are present and agree — instead of always emitting one class
 * per longhand. Only collapses when all four members of a quad are actually present (declared or
 * a genuine UA default, per extract.ts); a partial quad is left untouched for the normal
 * per-property path to handle.
 */
export function collapseGroupedClasses(style: StyleRecord, tokens: TokenTable): { classes: string[]; consumed: Set<CapturedProperty> } {
  const classes: string[] = [];
  const consumed = new Set<CapturedProperty>();

  for (const group of buildGroups(tokens)) {
    const result = group.kind === "xy" ? collapseXY(group, style) : collapseCorners(group, style);
    if (!result) continue;
    classes.push(...result.classes);
    for (const prop of result.consumed) consumed.add(prop);
  }

  return { classes, consumed };
}
