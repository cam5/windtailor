import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDocDrift, type DocDriftInput, type DriftRule } from "./drift.js";
import { checkRepoDocDrift } from "./check.js";

const README = [
  "# demo",
  "",
  "Run `windtailor <url> --selector <sel> --out ./out`.",
  "",
  "windtailor writes two files to the output directory:",
  "",
  "- `report.json` — the record.",
  "- `reconciled.html` — the markup.",
  "",
  "Build with `npm run build`, then try it against `fixtures/simple.html`.",
  "",
  "```js",
  'import { collectValues } from "windtailor";',
  "```",
  "",
].join("\n");

const CLI_SOURCE = [
  "program",
  '  .requiredOption("-s, --selector <selector>", "CSS selector")',
  '  .option("-o, --out <dir>", "output directory", "./out")',
  "  .action(async (url, opts) => {",
  '    await writeFile(path.join(opts.out, "report.json"), renderReportJson(report));',
  '    await writeFile(path.join(opts.out, "reconciled.html"), renderReconciledHtml(tree));',
  "  });",
].join("\n");

const INDEX_SOURCE = [
  'export { collectValues } from "./tokens/collect.js";',
  'export type { DomNode } from "./model/types.js";',
].join("\n");

const PACKAGE_JSON = JSON.stringify({ scripts: { build: "tsc", test: "node --test" } });

function baseInput(overrides: Partial<DocDriftInput> = {}): DocDriftInput {
  return {
    readme: README,
    cliSource: CLI_SOURCE,
    indexSource: INDEX_SOURCE,
    packageJson: PACKAGE_JSON,
    existingPaths: (p) => p === "fixtures/simple.html",
    ...overrides,
  };
}

function rules(input: DocDriftInput): DriftRule[] {
  return checkDocDrift(input).map((f) => f.rule);
}

test("a README that matches its code produces no findings", () => {
  assert.deepEqual(checkDocDrift(baseInput()), []);
});

test("undocumented-flag fires for a CLI flag the README never mentions", () => {
  const findings = checkDocDrift(
    baseInput({ cliSource: `${CLI_SOURCE}\n  .option("--color-tol <n>", "color tolerance")` }),
  );

  assert.deepEqual(
    findings.map((f) => [f.rule, f.subject]),
    [["undocumented-flag", "--color-tol"]],
  );
});

test("stale-flag fires for a README flag the CLI dropped", () => {
  const findings = checkDocDrift(baseInput({ readme: `${README}\nPass \`--legacy-mode\` to opt in.\n` }));

  assert.deepEqual(
    findings.map((f) => [f.rule, f.subject]),
    [["stale-flag", "--legacy-mode"]],
  );
});

test("stale-export fires when the README imports a name the entry point no longer exports", () => {
  const readme = README.replace(
    'import { collectValues } from "windtailor";',
    'import { collectValues, buildTokenTable } from "windtailor";',
  );

  assert.deepEqual(
    checkDocDrift(baseInput({ readme })).map((f) => [f.rule, f.subject]),
    [["stale-export", "buildTokenTable"]],
  );
});

test("stale-export stays quiet for an aliased import of a real export", () => {
  const readme = README.replace(
    'import { collectValues } from "windtailor";',
    'import { collectValues as collect } from "windtailor";',
  );

  assert.deepEqual(checkDocDrift(baseInput({ readme })), []);
});

test("output-file-mismatch fires in both directions", () => {
  const undocumented = checkDocDrift(
    baseInput({
      cliSource: `${CLI_SOURCE}\nawait writeFile(path.join(opts.out, "tailwind.config.tokens.js"), mod);`,
    }),
  );
  assert.deepEqual(
    undocumented.map((f) => [f.rule, f.subject]),
    [["output-file-mismatch", "tailwind.config.tokens.js"]],
  );

  const invented = checkDocDrift(
    baseInput({ readme: README.replace("- `reconciled.html`", "- `rebuilt.html`") }),
  );
  assert.deepEqual(
    invented.map((f) => [f.rule, f.subject]).sort(),
    [
      ["output-file-mismatch", "rebuilt.html"],
      ["output-file-mismatch", "reconciled.html"],
    ].sort(),
  );
});

test("missing-path fires for a referenced file that is not on disk", () => {
  const findings = checkDocDrift(baseInput({ readme: `${README}\nSee \`fixtures/gone.html\` for more.\n` }));

  assert.deepEqual(
    findings.map((f) => [f.rule, f.subject]),
    [["missing-path", "fixtures/gone.html"]],
  );
});

test("missing-path skips gitignored build artifacts so a fresh checkout stays green", () => {
  const readme = `${README}\nThe binary lands in \`dist/cli.js\`; open \`out/reconciled.html\` afterwards.\n`;

  assert.deepEqual(checkDocDrift(baseInput({ readme })), []);
});

test("stale-npm-script fires for an npm run invocation package.json does not define", () => {
  const findings = checkDocDrift(baseInput({ readme: `${README}\nRun \`npm run lint\` first.\n` }));

  assert.deepEqual(
    findings.map((f) => [f.rule, f.subject]),
    [["stale-npm-script", "lint"]],
  );
});

test("a doc-drift-ignore marker suppresses a finding for its subject", () => {
  const cliSource = `${CLI_SOURCE}\n  .option("--debug-dump <dir>", "internal, deliberately undocumented")`;

  assert.deepEqual(rules(baseInput({ cliSource })), ["undocumented-flag"]);
  assert.deepEqual(
    checkDocDrift(baseInput({ cliSource, readme: `${README}\n<!-- doc-drift-ignore: --debug-dump -->\n` })),
    [],
  );
});

test("the repo's own README is in sync with its code", () => {
  const findings = checkRepoDocDrift();

  assert.deepEqual(
    findings.map((f) => `${f.rule}: ${f.message}`),
    [],
  );
});
