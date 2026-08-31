import type { ReconciliationReport } from "../model/types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(label: string, what: string): never {
  throw new Error(`${label} is not a windtailor report.json — ${what}`);
}

/**
 * Parses a report.json written by a windtailor run. The structural guard is shallow on purpose:
 * it exists so a stale file, a hand-edited fragment or some unrelated JSON fails loudly with the
 * offending filename, rather than diffing into nonsense against a real report.
 */
export function parseReport(json: string, label: string): ReconciliationReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    fail(label, `it is not valid JSON (${(err as Error).message})`);
  }

  if (!isObject(parsed)) fail(label, "the top level is not an object");
  if (!isObject(parsed.tree)) fail(label, 'it has no "tree"');
  if (typeof (parsed.tree as Record<string, unknown>).id !== "string") fail(label, '"tree" has no node id');
  if (!isObject(parsed.classes)) fail(label, 'it has no "classes"');

  const tokens = parsed.tokens;
  if (!isObject(tokens) || !isObject(tokens.stockMatches) || !isObject(tokens.generated) || !isObject(tokens.clamped)) {
    fail(label, 'it has no "tokens" with stockMatches/generated/clamped');
  }

  // suggestions/unhandled are tolerated when missing — older runs, or a caller that trimmed them.
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const unhandled = Array.isArray(parsed.unhandled) ? parsed.unhandled : [];

  return { ...(parsed as unknown as ReconciliationReport), suggestions, unhandled };
}
