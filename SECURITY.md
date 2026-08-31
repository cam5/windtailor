# Security

windtailor's job is to point a real browser at a page you do not control and turn what it renders
into files on your disk. That makes its trust model worth writing down explicitly.

## Trust model

**The operator is trusted.** The person running the CLI chooses the URL, the selector, the output
directory and the theme file. windtailor does not defend against its own operator, and the output
directory is written to without sandboxing.

**The scraped page is not trusted.** Anything reachable from `--url` — its markup, its attributes,
its scripts — is hostile input. Everything below follows from that one line.

## What windtailor does about it

### `reconciled.html` is sanitized, not faithful

`reconciled.html` is built from the markup of the page you scraped, and you open it from disk —
which means it runs on a `file://` origin, where a surviving script has considerably more reach
than it did on the original site. So the serializer in `src/output/html.ts` is a sanitizer:

- `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<link>`, `<meta>` and `<style>`
  elements are dropped along with their subtrees. `<style>` is in that list because its `@import`
  and `url()` rules fetch remote content the moment you open the file — a beacon channel sourced
  from untrusted markup — and because its rules would otherwise re-apply the scraped page's own
  styling over the reconciled Tailwind classes.
- The SVG SMIL animation elements `<animate>`, `<set>` and `<animateTransform>` are dropped too.
  They rewrite another element's attribute at runtime through `attributeName`/`to`/`values`, which
  are not URL-valued attribute names, so the scheme allow-list below would never see the payload.
- `on*` event-handler attributes (`onerror`, `onclick`, …) are stripped.
- URL-bearing attributes (`href`, `src`, `srcset`, `action`, `formaction`, `poster`, `background`,
  `xlink:href`, …) are checked against a scheme allow-list: relative URLs, `http`, `https`,
  `mailto`, `tel`, and `data:` URLs that are images. `javascript:` and `vbscript:` are dropped,
  including the obfuscated spellings browsers still honour (leading whitespace, embedded tabs,
  mixed case).
- Attribute names that aren't well-formed are skipped rather than emitted raw.
- Attribute values escape `&`, `"`, `'`, `<` and `>`.

**This is deliberately lossy.** `reconciled.html` is a styling artifact for you to read and adapt,
not a mirror of the source page. If a scraped page's behaviour disappears in the output, that is
the sanitizer working, not a bug. Do not route `reconciled.html` back into a pipeline that expects
a faithful copy of the original.

Sanitizing at serialization is a backstop, not a licence to open the file carelessly: treat
`reconciled.html` from an untrusted target the way you'd treat any other artifact derived from one.

### The source URL is redacted in `report.json`

`report.json` gets committed, pasted into tickets and handed to agents. `sourceUrl` therefore runs
through `redactUrl` (`src/output/redact.ts`), which strips HTTP basic-auth userinfo
(`https://user:pass@host` → `https://host`) and replaces the values of credential-shaped query
parameters (`token`, `access_token`, `api_key`, `secret`, `password`, `sig`, …) with `[redacted]`.

The **unredacted** URL is still what the browser navigates to — redaction only affects what lands
on disk. And it is a fixed list of parameter names, not a general secret detector: a credential
passed under an unusual parameter name will still be written out. Prefer not putting credentials in
the URL at all.

### A malformed `--cdp-header` is not echoed

`parseHeaders` (`src/browser/headers.ts`) reports the *position* of a bad header argument rather
than its contents, so a typo in an `Authorization: Bearer …` argument doesn't print the token to
your terminal or into a CI log.

## Risks that are inherent, not bugs

- **`--theme-file` with a `.js`/`.cjs`/`.mjs` config executes arbitrary code**, in your shell, with
  your privileges. This is by design — it is how Tailwind's own CLI loads a config, and it is the
  only way to support real project configs. Only point `--theme-file` at a config you trust. Use
  `.json` (or `--theme-json`) for anything you don't. Extensions outside that allow-list are
  rejected outright, so a mistyped path fails loudly instead of being handed to the module loader.
- **Secrets passed via `--cdp-header` are visible to other users on the host**, via `ps` and
  `/proc`, for as long as the process runs. That is true of any process argument. On a shared host,
  prefer an endpoint whose credential is not passed on the command line.
- **The local browser is launched without `--no-sandbox`**, and it should stay that way. The
  Chromium sandbox is the primary boundary between a hostile page and your machine; adding
  `--no-sandbox` to get windtailor running in a container would remove it.
- **`tailwind.config.tokens.js` is generated JavaScript.** Its keys and values are machine-derived
  (`keyFromPx`, `custom-N`, `pxToRem`, hex) and interpolated via `JSON.stringify`, so page content
  cannot break out of a string literal there; `src/output/tailwindConfig.test.ts` pins that
  property. Still, it is a `.js` file you are invited to `require()` — read it before you do.

## Reporting

This is an early-stage project with no published release. Open an issue for anything you find.
