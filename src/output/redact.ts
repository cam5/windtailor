/**
 * Query parameters whose value is commonly a credential. Matched case-insensitively against the
 * whole parameter name — deliberately a small, obvious list rather than a heuristic, so a benign
 * parameter is never silently mangled.
 */
const SECRET_PARAMS = new Set([
  "token", "access_token", "refresh_token", "id_token", "api_key", "apikey", "key",
  "secret", "client_secret", "password", "pwd", "passwd", "sig", "signature", "auth", "session",
]);

const REDACTED = "[redacted]";

/**
 * Strips credentials from a URL before it is written to disk. `--url` is recorded verbatim as
 * `sourceUrl` in report.json, and report.json routinely gets committed, pasted into a ticket, or
 * handed to an agent — so a `https://user:pass@host` or `?token=…` in the target URL would
 * otherwise be persisted in plaintext.
 *
 * Anything that isn't a parseable absolute URL (a relative path, a typo) is returned unchanged:
 * this is a redaction pass, not a validator, and it must never throw on the way to writing output.
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  let changed = false;

  if (parsed.username !== "" || parsed.password !== "") {
    parsed.username = "";
    parsed.password = "";
    changed = true;
  }

  for (const name of [...parsed.searchParams.keys()]) {
    if (!SECRET_PARAMS.has(name.toLowerCase())) continue;
    parsed.searchParams.set(name, REDACTED);
    changed = true;
  }

  // Round-tripping through URL normalizes things we have no business rewriting (trailing slashes,
  // percent-encoding), so only hand back the reserialized form when something was actually removed.
  return changed ? parsed.toString() : url;
}
