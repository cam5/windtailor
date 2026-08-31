import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanRepo, score, formatText, type Finding } from "./scan.js";

/**
 * Seeded markers and escape hatches are assembled from fragments for the same reason scan.ts
 * does it: written out whole, this fixture text would make the scanner flag its own test file
 * every time `npm run debt` runs against the real repo.
 */
const TODO_MARKER = "TO" + "DO";
const AS_ANY = "as " + "an" + "y";
const TS_IGNORE = "@ts-" + "ignore";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "windtailor-debt-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const find = (findings: Finding[], category: string, file: string) =>
  findings.filter((f) => f.category === category && f.file === file);

test("flags a module with a function declaration and no colocated test", async () => {
  await withRepo({ "src/thing.ts": "export function thing() {\n  return 1;\n}\n" }, async (root) => {
    const result = await scanRepo(root);
    assert.equal(find(result.findings, "test-coverage", "src/thing.ts").length, 1);
  });
});

test("does not flag a module that has a colocated test", async () => {
  await withRepo(
    {
      "src/thing.ts": "export function thing() {\n  return 1;\n}\n",
      "src/thing.test.ts": "// a test lives here\n",
    },
    async (root) => {
      const result = await scanRepo(root);
      assert.equal(find(result.findings, "test-coverage", "src/thing.ts").length, 0);
    },
  );
});

test("skips .d.ts files entirely", async () => {
  await withRepo({ "src/types/shim.d.ts": "declare module 'x' {\n  export function y(): void;\n}\n" }, async (root) => {
    const result = await scanRepo(root);
    assert.equal(result.findings.filter((f) => f.file.endsWith(".d.ts")).length, 0);
    assert.equal(result.filesScanned, 0, ".d.ts files are not counted as scanned");
  });
});

test("skips a module with no function or class declaration, even when it exports a const", async () => {
  // This is the src/model/types.ts case: a real value export, but nothing worth a unit test.
  await withRepo(
    {
      "src/model/types.ts": [
        "export const CAPTURED = ['a', 'b'] as const;",
        "/** A value that falls back to an arbitrary-value class with no token. */",
        "export interface Report {",
        "  classes: string[];",
        "}",
      ].join("\n"),
    },
    async (root) => {
      const result = await scanRepo(root);
      assert.equal(
        find(result.findings, "test-coverage", "src/model/types.ts").length,
        0,
        "prose mentioning 'class' must not read as a class declaration",
      );
    },
  );
});

test("skips a barrel of re-exports", async () => {
  await withRepo({ "src/index.ts": "export { thing } from './thing.js';\n" }, async (root) => {
    const result = await scanRepo(root);
    assert.equal(find(result.findings, "test-coverage", "src/index.ts").length, 0);
  });
});

test("catches a seeded marker comment and reports its line", async () => {
  await withRepo({ "src/thing.ts": `const a = 1;\n// ${TODO_MARKER}: revisit this\nexport function f() { return a; }\n` }, async (root) => {
    const result = await scanRepo(root);
    const markers = find(result.findings, "marker", "src/thing.ts");
    assert.equal(markers.length, 1);
    assert.equal(markers[0].line, 2);
    assert.match(markers[0].message, new RegExp(TODO_MARKER));
  });
});

test("does not treat the word inside an identifier as a marker", async () => {
  await withRepo({ "src/thing.ts": `export function f() { return "${TODO_MARKER}LIST"; }\n` }, async (root) => {
    const result = await scanRepo(root);
    assert.equal(find(result.findings, "marker", "src/thing.ts").length, 0);
  });
});

test("catches an any-typed escape hatch", async () => {
  await withRepo({ "src/thing.ts": `export function f(v: unknown) {\n  return (v ${AS_ANY}).q;\n}\n` }, async (root) => {
    const result = await scanRepo(root);
    const hatches = find(result.findings, "type-escape-hatch", "src/thing.ts");
    assert.equal(hatches.length, 1);
    assert.equal(hatches[0].line, 2);
  });
});

test("rates a ts-ignore suppression P0", async () => {
  await withRepo({ "src/thing.ts": `export function f() {\n  // ${TS_IGNORE}\n  return broken();\n}\n` }, async (root) => {
    const result = await scanRepo(root);
    const hatches = find(result.findings, "type-escape-hatch", "src/thing.ts");
    assert.equal(hatches.length, 1);
    assert.equal(hatches[0].priority, "P0");
  });
});

test("flags a file at or over the line threshold", async () => {
  const body = "export function f() {\n" + "  // filler\n".repeat(30) + "}\n";
  await withRepo({ "src/big.ts": body, "src/big.test.ts": "" }, async (root) => {
    const result = await scanRepo(root, { maxFileLines: 20 });
    assert.equal(find(result.findings, "file-size", "src/big.ts").length, 1);
    const loose = await scanRepo(root, { maxFileLines: 500 });
    assert.equal(find(loose.findings, "file-size", "src/big.ts").length, 0);
  });
});

test("ignores node_modules and dist", async () => {
  await withRepo(
    {
      "src/node_modules/dep/index.ts": `// ${TODO_MARKER}: not ours\nexport function d() {}\n`,
      "src/dist/built.ts": `// ${TODO_MARKER}: generated\nexport function b() {}\n`,
    },
    async (root) => {
      const result = await scanRepo(root);
      assert.deepEqual(result.findings, []);
      assert.equal(result.filesScanned, 0);
    },
  );
});

test("score maps the rubric onto P0-P3 bands", () => {
  assert.deepEqual(score(3, 3, "S"), { score: 9, priority: "P0" });
  assert.equal(score(3, 2, "S").priority, "P0");
  assert.equal(score(2, 3, "M").priority, "P1");
  assert.equal(score(2, 1, "S").priority, "P2");
  assert.equal(score(1, 2, "L").priority, "P3");
});

test("scan result shape is stable and JSON-serialisable", async () => {
  await withRepo({ "src/thing.ts": "export function thing() {\n  return 1;\n}\n" }, async (root) => {
    const result = await scanRepo(root);
    const round = JSON.parse(JSON.stringify(result));
    assert.deepEqual(Object.keys(round).sort(), ["countsByCategory", "countsByPriority", "filesScanned", "findings", "root"]);
    assert.deepEqual(Object.keys(round.findings[0]).sort(), [
      "category",
      "effort",
      "file",
      "impact",
      "likelihood",
      "line",
      "message",
      "priority",
      "score",
    ]);
    assert.equal(round.countsByCategory["test-coverage"], 1);
    assert.equal(round.countsByPriority.P2, 1);
    assert.equal(round.findings[0].file, "src/thing.ts", "paths are repo-relative with POSIX separators");
  });
});

test("findings are ordered worst-first", async () => {
  await withRepo(
    {
      "src/a.ts": `export function a() {}\n// ${TODO_MARKER}: low priority\n`,
      "src/b.ts": `export function b() {\n  // ${TS_IGNORE}\n}\n`,
    },
    async (root) => {
      const result = await scanRepo(root);
      const scores = result.findings.map((f) => f.score);
      assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
      assert.equal(result.findings[0].priority, "P0");
    },
  );
});

test("formatText reports a clean tree without listing findings", async () => {
  await withRepo({ "src/index.ts": "export {};\n" }, async (root) => {
    const result = await scanRepo(root);
    const text = formatText(result);
    assert.match(text, /No mechanical debt signals found\./);
    assert.match(text, /docs\/TECH_DEBT\.md/);
  });
});
