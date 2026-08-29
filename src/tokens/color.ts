import { converter, parse } from "culori";

export interface Rgb255 {
  r: number;
  g: number;
  b: number;
}

const toRgb = converter("rgb");

/** Parses any CSS color (hex, rgb()/rgba(), named) into 0-255 sRGB channels. Returns null if unparseable. */
export function parseColor(value: string): Rgb255 | null {
  const parsed = parse(value);
  if (!parsed) return null;
  const rgb = toRgb(parsed);
  if (!rgb) return null;
  return { r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255 };
}

/** Simple weighted Euclidean distance in sRGB space (good enough for v0 clustering; see plan's stretch goals for ΔE/OKLab). */
export function colorDistance(a: Rgb255, b: Rgb255): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

export function toHex(c: Rgb255): string {
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}
