/**
 * Parses repeated `--cdp-header "Key: Value"` args into a header map.
 *
 * The values here are routinely credentials (an Authorization bearer token for a remote CDP
 * endpoint), so the error path deliberately does not echo the offending argument back — a
 * mistyped header would otherwise print the token into the terminal, shell history's scrollback,
 * and any CI log capturing stderr. The 1-based position is enough to identify which one is wrong.
 */
export function parseHeaders(headerArgs: string[]): Record<string, string> | undefined {
  if (headerArgs.length === 0) return undefined;
  const headers: Record<string, string> = {};
  for (const [index, arg] of headerArgs.entries()) {
    const sep = arg.indexOf(":");
    if (sep === -1) {
      throw new Error(
        `Invalid --cdp-header at position ${index + 1} — expected "Key: Value". (The argument is not echoed here; it may contain a secret.)`,
      );
    }
    headers[arg.slice(0, sep).trim()] = arg.slice(sep + 1).trim();
  }
  return headers;
}
