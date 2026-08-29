declare module "culori" {
  export function parse(input: string): unknown;
  export function converter(mode: "rgb"): (color: unknown) => { r: number; g: number; b: number } | undefined;
}
