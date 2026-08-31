# Tech debt register

This document classifies and prioritises windtailor's technical debt. **It does not fix any of it.**
Every item below is a description of a problem and a sketch of a remedy, not a change that has
landed. Fixes belong in their own focused PRs, one item at a time.

Two things produce this register:

- **Judgement** — the items in the table below, each pinned to a `file:line`. Architectural debt
  (missing seams, duplicated invariants, dependency pins) is not mechanically detectable, so it is
  read out of the source by hand.
- **`npm run debt`** — a dependency-free scanner (`src/debt/scan.ts`) that re-counts the *mechanical*
  signals: modules with no colocated test, marker comments, TypeScript escape hatches, and oversized
  files. Run it to check whether the counts here have gone stale. Add `--json` for machine output.

Where the two disagree, **this document wins on judgement and the scanner wins on counts.** The
scanner cannot tell that a file's logic is thoroughly covered through its callers; see WT-15.

## What is *not* debt here

Worth stating plainly, because it shapes the priorities: this is a small and unusually disciplined
codebase. 2,041 lines across 26 TypeScript files (excluding the `src/debt/` tooling added alongside
this document), `strict: true`, and — verified by the scanner — **zero** `TODO`/`FIXME`/`HACK`/`XXX`
markers, **zero** uses of `any`, and **zero** `@ts-ignore` or `@ts-expect-error` suppressions. There
is no marker-comment backlog to harvest. The debt that exists is structural: what is untested, what
cannot be tested, and what is unenforced.

## Rubric

Each item is scored on three axes, then banded. Scoring is deliberately mechanical so that new items
get ranked the same way rather than by vibe.

**Impact** — how bad is it when this bites?

| | |
|---|---|
| 3 | User-visible breakage, or silently *wrong* output the user ships |
| 2 | Wrong or misleading behaviour that a maintainer would likely catch first |
| 1 | Contributor friction only; no effect on output |

**Likelihood** — how likely is it to actually bite?

| | |
|---|---|
| 3 | On a normal path; will happen in routine use |
| 2 | Plausible; needs an unusual input or a specific change |
| 1 | Only under a change nobody is currently planning |

**Effort** — cost to remediate, used as a divisor so cheap fixes rank above expensive ones of equal severity.

| | | |
|---|---|---|
| S | weight 1 | under an hour |
| M | weight 2 | half a day |
| L | weight 3 | multi-day, or needs a design decision |

**Score** = `impact × likelihood ÷ effort weight`. Bands:

| Score | Priority | Meaning |
|---|---|---|
| ≥ 6 | **P0** | Fix next. Cheap and likely to bite. |
| ≥ 3 | **P1** | Schedule deliberately. |
| ≥ 1.5 | **P2** | Worth doing; no urgency. |
| < 1.5 | **P3** | Track only. Revisit if circumstances change. |

**Categories**: `correctness`, `test-coverage`, `testability`, `tooling`, `coupling`, `dependency`.

Note the interaction the divisor creates: an S-effort item that is likely and moderately harmful
outranks an L-effort item that is severe but unlikely. That is intentional — WT-11 (the Tailwind v4
blocker) is the most *severe* item here and still sits at P2, because it is a multi-day migration
that nothing is currently forcing.

## Register

| ID | Category | P | Effort | I×L | Evidence | Remediation sketch |
|---|---|---|---|---|---|---|
| WT-01 | correctness | **P0** | S | 3×2 | `src/cli.ts:46-49` | Replace bare `parseFloat` with a validating coercion that rejects `NaN`. |
| WT-02 | test-coverage | **P0** | S | 3×2 | `src/output/report.ts`, `html.ts`, `tailwindConfig.ts` | Add colocated tests for the three files the user actually consumes. |
| WT-03 | tooling | **P0** | S | 2×3 | `tsconfig.json:18` | Test files are excluded from typecheck. Add a `tsconfig.test.json` that includes them. |
| WT-04 | correctness | **P0** | S | 2×3 | `src/cli.ts:111-117` | Catch block handles one error type; map bad selector/URL/theme-file to real messages. |
| WT-05 | testability | P1 | M | 2×3 | `src/cli.ts:50-121` | Extract an exported `run(url, options)`; leave `.action()` as a thin shell. |
| WT-06 | coupling | P1 | M | 3×2 | `src/assign/propertyMap.ts:14`, `src/assign/groups.ts:23` | `signAware` declared twice, linked only by prose. Derive one from the other. |
| WT-07 | test-coverage | P1 | S | 2×2 | `src/tokens/units.ts`, `color.ts`, `collect.ts` | Pure parsers with no tests; wrong parsing corrupts everything downstream. |
| WT-08 | tooling | P1 | S | 2×2 | `package.json` (no `engines`) | Requires Node 22 (`node --test --import`); nothing declares it. |
| WT-09 | tooling | P1 | S | 1×3 | no eslint/prettier/editorconfig | Style enforced only by review. Add a formatter at minimum. |
| WT-10 | correctness | P2 | S | 1×2 | `src/cli.ts:63-65` | Mutually-exclusive flags validated *after* a full page load. Move to parse time. |
| WT-11 | dependency | P2 | L | 3×2 | `src/tokens/stockTheme.ts:1-2` | Imports Tailwind v3 deep internals that v4 removed. Hard upgrade blocker. |
| WT-12 | tooling | P2 | S | 1×2 | `.github/workflows/ci.yml` | CI runs tests but measures no coverage. Add `--experimental-test-coverage`. |
| WT-13 | test-coverage | P2 | M | 2×2 | `src/browser/session.ts` | Untested; needs a fake CDP transport to test meaningfully. |
| WT-14 | tooling | P2 | S | 1×2 | `package.json:21` | `"prepare": "npm run build"` runs a full `tsc` on every install. |
| WT-15 | test-coverage | P3 | S | 1×1 | `src/assign/propertyMap.ts` | Flagged by the scanner, but covered transitively — see below. |
| WT-16 | tooling | P3 | S | 1×1 | `package.json:28` | `"license": "UNLICENSED"` with a public-facing README; no CHANGELOG. |

## Items

### WT-01 — `--*-tol` flags turn a typo into `NaN` and silently change the output — P0

`src/cli.ts:46-49` passes bare `parseFloat` as commander's coercion for all four tolerance flags.
`parseFloat("abc")` is `NaN`, and commander accepts it without complaint. Every downstream snap
comparison is a `<=` against that `NaN`, and every such comparison is `false` — so nothing snaps to
the stock scale and windtailor mints spurious tokens instead.

This is not theoretical. Feeding `9px` through `buildTokenTable` with the default tolerance mints
nothing (it snaps to the stock scale). With `spacingTolerancePx: NaN` — exactly what `--spacing-tol abc`
produces — the same input mints a bogus token:

```
default tol -> generated spacing: []
NaN tol     -> generated spacing: [{"key":"2.25","value":"0.5625rem","sourceValues":["9px"]}]
```

The run exits 0 and writes three plausible-looking files. The user ships a different design system
than the one they asked for, with no warning anywhere. That is impact 3: silently wrong output.

**Fix:** a small coercion helper that throws `InvalidArgumentError` on a non-finite or negative
result. Roughly ten lines, and it closes the whole class for all four flags at once.

### WT-02 — the entire `src/output/` layer is untested — P0

`report.ts`, `html.ts`, and `tailwindConfig.ts` are the three files that produce everything the user
actually reads, and none has a colocated test. `tailwindConfig.ts` in particular emits JavaScript
source as text — the failure mode is a syntactically invalid config that only surfaces when the user
imports it into their own build. This is the same shape as the bug fixed in `d9f720b` (negative
margin classes emitting invalid Tailwind syntax), which reached `main` precisely because nothing
asserted on emitted output.

**Fix:** three snapshot-ish tests asserting emitted text for a small known token table. No browser
needed, so they cost nothing in CI.

### WT-03 — test files are never typechecked — P0

`tsconfig.json:18` sets `"exclude": ["src/**/*.test.ts"]`, and the runner is `tsx`, which strips types
without checking them. The result is that **test code has no type checking at all**. Verified
directly: appending `const deliberate: number = "not a number";` to a test file and running
`npm run typecheck` exits 0 and reports nothing.

This quietly undermines the suite. A test can assert against a misspelled property or a wrong-shaped
fixture and still pass, checking something other than what it claims to. With 56 tests and growing,
that is a real and compounding risk.

**Fix:** a `tsconfig.test.json` extending the base config, including tests, `noEmit: true`; wire it
into the `typecheck` script and CI.

### WT-04 — the catch block rethrows almost everything as a raw stack trace — P0

`src/cli.ts:111-117` special-cases exactly one error type, `UnsupportedBackendError`, and rethrows
everything else. A mistyped selector, an unreachable URL, or an unreadable `--theme-file` all reach
the user as an unhandled Node exception with a full stack trace. A bad selector is the single most
likely mistake a user of this tool will make, which is what puts likelihood at 3.

**Fix:** widen the catch into a small error-to-message map, exit non-zero with a one-line diagnostic,
and keep stack traces behind a `--verbose` flag.

### WT-05 — the whole pipeline is sealed inside commander's `.action()` closure — P1

`src/cli.ts:50-121` performs the entire orchestration — session open, DOM extract, theme load,
cluster, assign, three file writes — inline inside the `.action()` callback. Nothing is exported, so
there is no seam at which the pipeline can be driven from a test. The only way to exercise it
end-to-end is to spawn the built binary.

This is what keeps WT-02 and WT-13 expensive, and it is why the fixture at `fixtures/simple.html`,
which is exactly the input an end-to-end test would want, currently has no test using it.

**Fix:** extract `export async function run(url: string, options: RunOptions): Promise<RunResult>`
and reduce `.action()` to argument marshalling. This is the highest-leverage structural item here —
it unblocks the coverage work rather than just adding tests.

### WT-06 — the `signAware` invariant is declared twice — P1

`ScaleProperty.signAware` (`src/assign/propertyMap.ts:14`) and `PropertyGroup.signAware`
(`src/assign/groups.ts:23`) are independent declarations of the same rule: *only margin and inset may
go negative.* They are tied together by nothing but a comment reading `See ScaleProperty.signAware in
propertyMap.ts`. Two hand-maintained lists that must agree, with no mechanism enforcing it.

The risk is concrete: commit `d9f720b` fixed negative margin/inset classes emitting invalid Tailwind
syntax. That is this exact family of bug. Adding a new negative-capable property means remembering to
edit both files, and forgetting produces a class like `top--1.25` that silently fails to resolve.

**Fix:** derive the group flag from `SCALE_PROPERTIES` rather than restating it — or, cheaper as a
stopgap, a test asserting the two lists agree.

### WT-07 — the token primitives have no tests — P1

`units.ts` (23 lines), `color.ts` (31), and `collect.ts` (25) are small, pure, and trivially testable,
and every token decision in the program flows through them. A parsing bug here does not crash; it
produces subtly wrong numbers that propagate into every emitted class. Small effort, broad blast
radius.

### WT-08 — no `engines` field — P1

`package.json` declares no `engines` despite `node --test --import tsx` requiring Node 22 (which is
what CI pins). A contributor on Node 18 or 20 gets a confusing failure from the test runner rather
than a clear "unsupported Node version" from npm.

### WT-09 — no linter or formatter of any kind — P1

No eslint, prettier, or editorconfig anywhere in the repo. The existing code is consistent, which
means the cost has been paid by reviewers rather than avoided. That does not scale, and consistency
is easiest to lock in while the codebase is still uniform.

### WT-10 — mutually-exclusive theme flags are validated after the browser has run — P2

The `--theme-file` + `--theme-json` conflict check sits at `src/cli.ts:63-65`, *after*
`BrowserSession.open()` and `extractTree()` have already completed. The user waits through a full
browser launch and page load to be told about an argument mistake that was knowable before any work
started. Wasted time, not wrong output — hence impact 1.

**Fix:** move the check into option parsing, alongside WT-01's coercion.

### WT-11 — Tailwind v3 deep internals block any v4 upgrade — P2

`src/tokens/stockTheme.ts:1-2` imports `tailwindcss/resolveConfig.js` and `tailwindcss/defaultConfig.js`.
These are deep internal entrypoints that Tailwind v4 **removed**; v4 also replaced JS-config theme
resolution with CSS-first `@theme`. The `^3.4.14` dependency is therefore a hard ceiling, not a
routine bump — `npm update` can never cross it, and a v4 migration means rebuilding stock-theme
resolution from scratch.

This is the most severe item in the register (impact 3) and still lands at P2, because it is L-effort
and nothing is forcing the move today. Recorded so that the decision is deliberate when it arrives
rather than discovered mid-upgrade.

### WT-12 — CI measures no coverage — P2

`.github/workflows/ci.yml` runs typecheck, build, and test, but nothing reports what fraction of the
code those tests touch. The gaps in WT-02 and WT-07 are invisible from CI output alone. Node 22's
`--experimental-test-coverage` makes this nearly free; start by reporting, not gating.

### WT-13 — `src/browser/session.ts` is untested — P2

`BrowserSession` owns launch, CDP connection, header injection, and teardown, and has no tests. It is
genuinely harder than the rest — it needs a fake transport or a launch-arguments-only test — which is
what puts it at M effort and below the cheaper coverage items.

### WT-14 — `prepare` rebuilds on every install — P2

`package.json:21` runs `npm run build` from `prepare`, so a full `tsc` fires on every `npm install`,
including for consumers who only want the prebuilt `dist`. `prepack` (or `prepublishOnly`) expresses
the actual intent — build before publishing — without taxing every install.

### WT-15 — `propertyMap.ts` has no colocated test, but is covered transitively — P3

`npm run debt` flags this file as untested, and by the mechanical rule it is. Judgement says
otherwise: its only real logic is `formatArbitrary` and `formatScaleClass`, and the negative-sign
behaviour of the latter is directly asserted by three tests in `assign.test.ts` (lines 35, 44, 53)
plus the group-level cases in `groups.test.ts`. The rest of the file is a declarative data table.

Kept at P3 rather than removed, as a worked example of the scanner overstating risk. A colocated test
would still be marginally nicer than relying on coverage through callers.

### WT-16 — licensing and changelog — P3

`"license": "UNLICENSED"` (`package.json:28`) sits alongside a README written for public consumption,
complete with `npm install windtailor` instructions. Either the license or the README is wrong about
this project's intent. There is also no CHANGELOG despite a published `bin`. Low urgency, but it will
need an answer before any real release.

## Keeping this current

```sh
npm run debt          # human-readable
npm run debt -- --json
```

The scanner's own scope is deliberately narrow — it counts what can be counted. When you fix an item,
delete its row here. When you add an item, score it with the rubric above rather than guessing at a
priority.

### Reconciliation, as of this document

The scanner currently reports **9 findings, all `test-coverage`** (no markers, no escape hatches, no
oversized files). Each maps onto a row above:

| Scanner finding | Register row |
|---|---|
| `src/output/report.ts`, `html.ts`, `tailwindConfig.ts` | WT-02 |
| `src/tokens/units.ts`, `color.ts`, `collect.ts` | WT-07 |
| `src/cli.ts` | WT-05 — untested *because* it has no seam; the seam is the real item |
| `src/browser/session.ts` | WT-13 |
| `src/assign/propertyMap.ts` | WT-15 — flagged mechanically, covered transitively |

Two files a naive "no colocated test" check would also flag are deliberately exempt, and the scanner
handles both: `src/index.ts` is a barrel of re-exports, and `src/model/types.ts` holds types and one
constant table. Neither declares a function or class, so neither has behaviour to unit-test. The
scanner strips comments before making that judgement — `types.ts` contains the *word* "class" in
prose, which an unanchored check reads as a declaration.

The remaining eleven register rows (WT-01, WT-03, WT-04, WT-06, WT-08 through WT-12, WT-14, WT-16)
are architectural or process debt and are invisible to the scanner by design. Do not treat a clean
`npm run debt` as a clean bill of health.
