/**
 * Doc drift detection: does README.md still describe the code that ships?
 *
 * The core is IO-free on purpose — it takes source files as plain strings, so the
 * rules can be unit-tested with synthetic inputs and then pointed at the repo's own
 * files as a regression guard. All parsing is regex over the TypeScript source; the
 * surfaces we check (a commander chain, a flat re-export barrel) are regular enough
 * that an AST dependency would not buy anything.
 */

export type DriftRule =
  | "undocumented-flag"
  | "stale-flag"
  | "stale-export"
  | "output-file-mismatch"
  | "missing-path"
  | "stale-npm-script";

export type DriftSeverity = "error" | "warning";

export interface DriftFinding {
  rule: DriftRule;
  severity: DriftSeverity;
  /** The thing the finding is about — a flag, an export name, a path. Also the `doc-drift-ignore` key. */
  subject: string;
  message: string;
  detail?: string;
}

export interface DocDriftInput {
  readme: string;
  cliSource: string;
  indexSource: string;
  packageJson: string;
  /** Repo-relative path predicate. Injected so the core stays IO-free. */
  existingPaths: (repoRelativePath: string) => boolean;
}

/** Gitignored build output. README legitimately points at these before anyone runs a build. */
const UNBUILT_PREFIXES = ["dist/", "out/", "node_modules/"];

// ---------------------------------------------------------------------------
// Code-side parsers
// ---------------------------------------------------------------------------

/** Long-form flags declared on a commander chain: `.option("-o, --out <dir>", ...)`. */
export function parseCliFlags(cliSource: string): Set<string> {
  const flags = new Set<string>();
  const decl = /\.(?:option|requiredOption)\(\s*(['"])(.*?)\1/g;
  for (const match of cliSource.matchAll(decl)) {
    const long = /--([a-z][\w-]*)/.exec(match[2]);
    if (long) flags.add(`--${long[1]}`);
  }
  return flags;
}

/** Filenames the CLI actually writes: `writeFile(path.join(opts.out, "report.json"), ...)`. */
export function parseCliOutputFiles(cliSource: string): Set<string> {
  const files = new Set<string>();
  const write = /writeFile\(\s*path\.join\([^,]+,\s*(['"])([^'"]+)\1/g;
  for (const match of cliSource.matchAll(write)) files.add(match[2]);
  return files;
}

/** Names re-exported from the package entry point, values and types alike. */
export function parseNamedExports(indexSource: string): Set<string> {
  const names = new Set<string>();
  const block = /export\s+(?:type\s+)?\{([^}]*)\}\s*from/g;
  for (const match of indexSource.matchAll(block)) {
    for (const raw of match[1].split(",")) {
      const specifier = raw.trim().replace(/^type\s+/, "");
      if (!specifier) continue;
      // `foo as bar` is imported by consumers as `bar`.
      const alias = /\bas\s+([\w$]+)$/.exec(specifier);
      names.add(alias ? alias[1] : specifier);
    }
  }
  return names;
}

export function parseNpmScripts(packageJson: string): Set<string> {
  const parsed = JSON.parse(packageJson) as { scripts?: Record<string, unknown> };
  return new Set(Object.keys(parsed.scripts ?? {}));
}

// ---------------------------------------------------------------------------
// README-side parsers
// ---------------------------------------------------------------------------

/** Every `--flag` token, in prose and in fenced examples alike. */
export function parseReadmeFlags(readme: string): Set<string> {
  const flags = new Set<string>();
  for (const match of readme.matchAll(/--([a-z][a-z0-9-]*)/g)) flags.add(`--${match[1]}`);
  return flags;
}

/** Identifiers pulled out of `import { ... } from "windtailor"` examples. */
export function parseReadmeImportedNames(readme: string): Set<string> {
  const names = new Set<string>();
  const block = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]windtailor['"]/g;
  for (const match of readme.matchAll(block)) {
    for (const raw of match[1].split(",")) {
      const specifier = raw.trim().replace(/^type\s+/, "");
      if (!specifier) continue;
      // `import { exported as local }` — the entry point has to export the left-hand name.
      names.add(specifier.replace(/\s+as\s+[\w$]+$/, ""));
    }
  }
  return names;
}

/**
 * Output filenames the README promises: the bullet list under "writes N files to the
 * output directory", plus anything referenced as `out/<file>`.
 */
export function parseReadmeOutputFiles(readme: string): Set<string> {
  const files = new Set<string>();

  const lines = readme.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/writes\b[^\n]*\bfiles\b[^\n]*\boutput directory/i.test(lines[i])) continue;
    let sawBullet = false;
    for (let j = i + 1; j < lines.length; j++) {
      const bullet = /^\s*[-*]\s+`([^`]+)`/.exec(lines[j]);
      if (bullet) {
        sawBullet = true;
        files.add(bullet[1]);
        continue;
      }
      if (lines[j].trim() === "" && !sawBullet) continue;
      break;
    }
  }

  for (const match of readme.matchAll(/(?<![\w./-])out\/([\w.-]+\.[a-z0-9]+)/gi)) files.add(match[1]);

  return files;
}

/** Repo-relative file paths referenced from code spans and fenced blocks. */
export function parseReadmeRepoPaths(readme: string): Set<string> {
  const paths = new Set<string>();
  const token = /(?<![\w./-])[\w.-]+(?:\/[\w.-]+)+/g;

  for (const snippet of codeSpans(readme)) {
    for (const match of snippet.matchAll(token)) {
      const candidate = match[0].replace(/^\.\//, "");
      // Only file-shaped tokens — a trailing extension keeps `m-`/`mx-` style prose out.
      if (!/\/[\w.-]*\.[a-z0-9]{1,5}$/i.test(candidate)) continue;
      paths.add(candidate);
    }
  }

  return paths;
}

export function parseReadmeNpmScripts(readme: string): Set<string> {
  const scripts = new Set<string>();
  for (const match of readme.matchAll(/npm run\s+([\w:.-]+)/g)) scripts.add(match[1]);
  return scripts;
}

/**
 * `<!-- doc-drift-ignore: <subject> -->` anywhere in the README silences findings about
 * that subject. The escape hatch lives in the doc being checked rather than in an
 * allowlist here, so the reason it exists is visible next to the thing it excuses.
 */
export function parseIgnores(readme: string): Set<string> {
  const ignores = new Set<string>();
  for (const match of readme.matchAll(/<!--\s*doc-drift-ignore:\s*([^\s>]+)\s*-->/g)) ignores.add(match[1]);
  return ignores;
}

function codeSpans(readme: string): string[] {
  const spans: string[] = [];
  let prose = readme;

  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  for (const match of readme.matchAll(fence)) spans.push(match[1]);
  prose = readme.replace(fence, "\n");

  for (const match of prose.matchAll(/`([^`\n]+)`/g)) spans.push(match[1]);

  return spans;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function checkDocDrift(input: DocDriftInput): DriftFinding[] {
  const findings: DriftFinding[] = [];

  const cliFlags = parseCliFlags(input.cliSource);
  const readmeFlags = parseReadmeFlags(input.readme);

  for (const flag of cliFlags) {
    if (readmeFlags.has(flag)) continue;
    findings.push({
      rule: "undocumented-flag",
      severity: "warning",
      subject: flag,
      message: `CLI flag ${flag} is not mentioned anywhere in README.md`,
      detail: "Document it, or silence it with a doc-drift-ignore marker.",
    });
  }

  for (const flag of readmeFlags) {
    if (cliFlags.has(flag)) continue;
    findings.push({
      rule: "stale-flag",
      severity: "error",
      subject: flag,
      message: `README.md documents ${flag}, which the CLI does not declare`,
    });
  }

  const exports = parseNamedExports(input.indexSource);
  for (const name of parseReadmeImportedNames(input.readme)) {
    if (exports.has(name)) continue;
    findings.push({
      rule: "stale-export",
      severity: "error",
      subject: name,
      message: `README.md imports "${name}" from "windtailor", which src/index.ts does not export`,
    });
  }

  const cliOutputs = parseCliOutputFiles(input.cliSource);
  const readmeOutputs = parseReadmeOutputFiles(input.readme);
  for (const file of cliOutputs) {
    if (readmeOutputs.has(file)) continue;
    findings.push({
      rule: "output-file-mismatch",
      severity: "error",
      subject: file,
      message: `The CLI writes "${file}" to the output directory, but README.md does not list it`,
    });
  }
  for (const file of readmeOutputs) {
    if (cliOutputs.has(file)) continue;
    findings.push({
      rule: "output-file-mismatch",
      severity: "error",
      subject: file,
      message: `README.md describes output file "${file}", which the CLI never writes`,
    });
  }

  for (const repoPath of parseReadmeRepoPaths(input.readme)) {
    // Build artifacts are gitignored; a fresh checkout has not run `npm run build` yet.
    if (UNBUILT_PREFIXES.some((prefix) => repoPath.startsWith(prefix))) continue;
    if (input.existingPaths(repoPath)) continue;
    findings.push({
      rule: "missing-path",
      severity: "error",
      subject: repoPath,
      message: `README.md references "${repoPath}", which does not exist in the repo`,
    });
  }

  const npmScripts = parseNpmScripts(input.packageJson);
  for (const script of parseReadmeNpmScripts(input.readme)) {
    if (npmScripts.has(script)) continue;
    findings.push({
      rule: "stale-npm-script",
      severity: "error",
      subject: script,
      message: `README.md tells the reader to run "npm run ${script}", which package.json does not define`,
    });
  }

  const ignores = parseIgnores(input.readme);
  return findings.filter((finding) => !ignores.has(finding.subject));
}

export function formatFindings(findings: DriftFinding[]): string {
  const byRule = new Map<DriftRule, DriftFinding[]>();
  for (const finding of findings) {
    const bucket = byRule.get(finding.rule) ?? [];
    bucket.push(finding);
    byRule.set(finding.rule, bucket);
  }

  const lines: string[] = [];
  for (const [rule, bucket] of byRule) {
    for (const finding of bucket) lines.push(`${rule}: ${finding.message}`);
  }
  return lines.join("\n");
}
