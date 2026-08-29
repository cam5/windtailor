/** Parses a CSS length (px or rem) into a pixel number. Returns null for anything else (e.g. "auto", "none"). */
export function parseLengthPx(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "0") return 0;

  const remMatch = /^(-?[\d.]+)rem$/.exec(trimmed);
  if (remMatch) return parseFloat(remMatch[1]) * 16;

  const pxMatch = /^(-?[\d.]+)px$/.exec(trimmed);
  if (pxMatch) return parseFloat(pxMatch[1]);

  return null;
}

/** Formats a pixel number back to a CSS rem value, matching Tailwind's convention. */
export function pxToRem(px: number): string {
  const rem = px / 16;
  return `${trimTrailingZeros(rem)}rem`;
}

export function trimTrailingZeros(n: number): string {
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}
