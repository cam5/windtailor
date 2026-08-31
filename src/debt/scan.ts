/**
 * Mechanical tech-debt scanner.
 *
 * This finds the *countable* debt signals only — untested modules, marker comments, TypeScript
 * escape hatches, oversized files. It deliberately does not try to judge architectural debt
 * (testability seams, coupling, dependency pins); that lives in docs/TECH_DEBT.md, which is
 * authoritative wherever the two disagree. The scanner exists so the counts in that document
 * don't quietly go stale.
 *
 * Dependency-free on purpose: `npm run debt` should work with nothing installed but Node.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type DebtCategory = "test-coverage" | "marker" | "type-escape-hatch" | "file-size";

export type DebtPriority = "P0" | "P1" | "P2" | "P3";

export type Effort = "S" | "M" | "L";

export interface Finding {
  category: DebtCategory;
  priority: DebtPriority;
  /** Repo-relative path, POSIX separators, so output is stable across platforms. */
  file: string;
  /** 1-indexed. `null` for findings about a file as a whole rather than one line. */
  line: number | null;
  message: string;
  /** Impact 1-3: contributor friction < silent wrong output < user-visible breakage. */
  impact: 1 | 2 | 3;
  /** Likelihood 1-3 that this actually bites someone. */
  likelihood: 1 | 2 | 3;
  effort: Effort;
  /** impact x likelihood / effort weight — see docs/TECH_DEBT.md for the bands. */
  score: number;
}

export interface ScanOptions {
  /** Directory to walk, relative to `root`. Default "src". */
  sourceDir?: string;
  /** Files at or above this many lines are flagged as oversized. Default 250. */
  maxFileLines?: number;
}

export interface ScanResult {
  root: string;
  filesScanned: number;
  findings: Finding[];
  countsByCategory: Record<DebtCategory, number>;
  countsByPriority: Record<DebtPriority, number>;
}

const EFFORT_WEIGHT: Record<Effort, number> = { S: 1, M: 2, L: 3 };

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", "out"]);

/**
 * Marker and escape-hatch tokens are assembled from fragments rather than written out whole, so
 * that this file — which necessarily mentions all of them — does not flag itself on every run.
 */
const MARKER_WORDS = ["TO" + "DO", "FIX" + "ME", "HA" + "CK", "X" + "XX"];
const TS_IGNORE = "@ts-" + "ignore";
const TS_EXPECT_ERROR = "@ts-" + "expect-error";
const ANY_WORD = "an" + "y";

const MARKER_RE = new RegExp(`(?://|/\\*|^\\s*\\*)\\s*(${MARKER_WORDS.join("|")})\\b`);
const ANY_TYPE_RE = new RegExp(`(?::\\s*${ANY_WORD}\\b|\\bas\\s+${ANY_WORD}\\b|<${ANY_WORD}>)`);

/** Scores an item against the rubric in docs/TECH_DEBT.md and maps it into a P0-P3 band. */
export function score(impact: 1 | 2 | 3, likelihood: 1 | 2 | 3, effort: Effort): { score: number; priority: DebtPriority } {
  const raw = (impact * likelihood) / EFFORT_WEIGHT[effort];
  const rounded = Math.round(raw * 100) / 100;
  const priority: DebtPriority = rounded >= 6 ? "P0" : rounded >= 3 ? "P1" : rounded >= 1.5 ? "P2" : "P3";
  return { score: rounded, priority };
}

function makeFinding(
  category: DebtCategory,
  file: string,
  line: number | null,
  message: string,
  impact: 1 | 2 | 3,
  likelihood: 1 | 2 | 3,
  effort: Effort,
): Finding {
  const { score: s, priority } = score(impact, likelihood, effort);
  return { category, priority, file, line, message, impact, likelihood, effort, score: s };
}

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * A module with no function or class declaration has no behaviour to unit-test — a barrel of
 * re-exports (src/index.ts) or a declaration file of types and constant tables (src/model/types.ts).
 * Checking for declarations rather than "exports only types" matters: types.ts does export a real
 * const, but still holds nothing worth a test.
 */
function hasTestableCode(source: string): boolean {
  // Comments are stripped first, and the match is anchored to the start of a line: prose like
  // "falls back to an arbitrary-value class" must not read as a class declaration.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return /^\s*(export\s+)?(default\s+)?(declare\s+)?(abstract\s+)?(async\s+)?(function|class)\s/m.test(code);
}

export async function scanRepo(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const sourceDir = options.sourceDir ?? "src";
  const maxFileLines = options.maxFileLines ?? 250;
  const absSourceDir = path.resolve(root, sourceDir);

  const files = (await walk(absSourceDir)).sort();
  const present = new Set(files);
  const findings: Finding[] = [];
  let filesScanned = 0;

  for (const file of files) {
    const isTest = file.endsWith(".test.ts");
    const isDecl = file.endsWith(".d.ts");
    if (isDecl) continue;

    const source = await readFile(file, "utf8");
    const lines = source.split("\n");
    const rel = path.relative(root, file).split(path.sep).join("/");
    filesScanned++;

    if (!isTest && hasTestableCode(source) && !present.has(file.replace(/\.ts$/, ".test.ts"))) {
      const loc = lines.length;
      const likelihood: 1 | 2 | 3 = loc >= 100 ? 3 : loc >= 40 ? 2 : 1;
      const effort: Effort = loc >= 150 ? "L" : loc >= 50 ? "M" : "S";
      findings.push(
        makeFinding("test-coverage", rel, null, `No colocated test — ${rel.replace(/\.ts$/, ".test.ts")} does not exist (${loc} lines).`, 2, likelihood, effort),
      );
    }

    if (lines.length >= maxFileLines) {
      findings.push(makeFinding("file-size", rel, null, `${lines.length} lines — at or over the ${maxFileLines}-line threshold; consider splitting.`, 1, 2, "L"));
    }

    lines.forEach((text, index) => {
      const line = index + 1;

      const marker = MARKER_RE.exec(text);
      if (marker) {
        const word = marker[1];
        const [impact, likelihood]: [1 | 2 | 3, 1 | 2 | 3] =
          word === MARKER_WORDS[1] ? [2, 2] : word === MARKER_WORDS[0] ? [1, 1] : [1, 2];
        findings.push(makeFinding("marker", rel, line, `${word} marker comment: ${text.trim()}`, impact, likelihood, "S"));
      }

      if (text.includes(TS_IGNORE)) {
        findings.push(makeFinding("type-escape-hatch", rel, line, `${TS_IGNORE} suppresses a real type error without recording why.`, 3, 3, "S"));
      } else if (text.includes(TS_EXPECT_ERROR)) {
        findings.push(makeFinding("type-escape-hatch", rel, line, `${TS_EXPECT_ERROR} — narrower than ${TS_IGNORE}, but still an unchecked spot.`, 1, 1, "S"));
      } else if (ANY_TYPE_RE.test(text)) {
        findings.push(makeFinding("type-escape-hatch", rel, line, `\`${ANY_WORD}\` defeats strict mode here: ${text.trim()}`, 3, 2, "S"));
      }
    });
  }

  findings.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));

  const countsByCategory: Record<DebtCategory, number> = { "test-coverage": 0, marker: 0, "type-escape-hatch": 0, "file-size": 0 };
  const countsByPriority: Record<DebtPriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const finding of findings) {
    countsByCategory[finding.category]++;
    countsByPriority[finding.priority]++;
  }

  return { root, filesScanned, findings, countsByCategory, countsByPriority };
}

export function formatText(result: ScanResult): string {
  const out: string[] = [];
  out.push(`Scanned ${result.filesScanned} TypeScript file(s) under ${result.root}`);
  out.push(`${result.findings.length} mechanical finding(s): ` + (["P0", "P1", "P2", "P3"] as const).map((p) => `${p}=${result.countsByPriority[p]}`).join(" "));
  out.push("");
  if (result.findings.length === 0) {
    out.push("No mechanical debt signals found.");
  }
  for (const finding of result.findings) {
    const where = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    out.push(`${finding.priority}  [${finding.category}] ${where}`);
    out.push(`      ${finding.message}`);
  }
  out.push("");
  out.push("Architectural debt (testability, coupling, dependency pins) is not mechanically");
  out.push("detectable — see docs/TECH_DEBT.md for the full classified register.");
  return out.join("\n");
}

async function main(argv: string[]): Promise<number> {
  const asJson = argv.includes("--json");
  const result = await scanRepo(process.cwd());
  console.log(asJson ? JSON.stringify(result, null, 2) : formatText(result));
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
