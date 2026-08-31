#!/usr/bin/env node
/** IO wrapper around the doc drift rules — see ./drift.ts for the checks themselves. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDocDrift, formatFindings, type DocDriftInput, type DriftFinding } from "./drift.js";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function loadRepoDriftInput(root: string = repoRoot): DocDriftInput {
  const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
  return {
    readme: read("README.md"),
    cliSource: read("src/cli.ts"),
    indexSource: read("src/index.ts"),
    packageJson: read("package.json"),
    existingPaths: (relative) => existsSync(path.join(root, relative)),
  };
}

export function checkRepoDocDrift(root: string = repoRoot): DriftFinding[] {
  return checkDocDrift(loadRepoDriftInput(root));
}

function main(): void {
  const findings = checkRepoDocDrift();
  if (findings.length === 0) {
    console.log("No documentation drift detected.");
    return;
  }
  console.error(formatFindings(findings));
  console.error(`\n${findings.length} documentation drift finding(s).`);
  process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
