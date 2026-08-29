#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrowserSession, UnsupportedBackendError } from "./browser/session.js";
import { extractTree } from "./browser/extract.js";
import { collectValues } from "./tokens/collect.js";
import { buildTokenTable, DEFAULT_CLUSTER_OPTIONS } from "./tokens/cluster.js";
import { assignClasses } from "./assign/assign.js";
import { renderReportJson } from "./output/report.js";
import { renderReconciledHtml } from "./output/html.js";
import { renderTailwindConfigModule } from "./output/tailwindConfig.js";
import type { ReconciliationReport } from "./model/types.js";

const program = new Command();

program
  .name("windtailor")
  .description("Fetch a webpage, capture a DOM node's computed styles, and reconcile them into Tailwind classes + generated design tokens.")
  .argument("<url>", "URL of the page to fetch")
  .requiredOption("-s, --selector <selector>", "CSS selector for the target node")
  .option("-o, --out <dir>", "output directory", "./out")
  .option("--cdp-endpoint <wsUrl>", "connect to an existing CDP endpoint (e.g. Kitesurf / Browser Run) instead of launching locally")
  .option("--executable-path <path>", "path to a local browser executable (ignored with --cdp-endpoint)")
  .option("--spacing-tol <px>", "px tolerance for snapping to the stock spacing scale", parseFloat, DEFAULT_CLUSTER_OPTIONS.spacingTolerancePx)
  .option("--radius-tol <px>", "px tolerance for snapping to the stock radius scale", parseFloat, DEFAULT_CLUSTER_OPTIONS.radiusTolerancePx)
  .option("--font-size-tol <px>", "px tolerance for snapping to the stock font-size scale", parseFloat, DEFAULT_CLUSTER_OPTIONS.fontSizeTolerancePx)
  .option("--color-tol <n>", "distance tolerance for snapping to the stock color palette", parseFloat, DEFAULT_CLUSTER_OPTIONS.colorTolerance)
  .action(async (url: string, opts) => {
    let session: BrowserSession | undefined;
    try {
      session = await BrowserSession.open(url, {
        cdpEndpoint: opts.cdpEndpoint,
        executablePath: opts.executablePath,
      });

      const tree = await extractTree(session.page, opts.selector);
      await session.close();
      session = undefined;

      const collected = collectValues(tree);
      const tokens = buildTokenTable(collected, {
        spacingTolerancePx: opts.spacingTol,
        radiusTolerancePx: opts.radiusTol,
        fontSizeTolerancePx: opts.fontSizeTol,
        colorTolerance: opts.colorTol,
      });
      const { classes, unhandled } = assignClasses(tree, tokens);

      const report: ReconciliationReport = { sourceUrl: url, selector: opts.selector, tree, tokens, classes, unhandled };

      await mkdir(opts.out, { recursive: true });
      await writeFile(path.join(opts.out, "report.json"), renderReportJson(report));
      await writeFile(path.join(opts.out, "tailwind.config.tokens.js"), renderTailwindConfigModule(tokens));
      await writeFile(path.join(opts.out, "reconciled.html"), renderReconciledHtml(tree, classes));

      console.log(`Wrote report.json, tailwind.config.tokens.js, reconciled.html to ${opts.out}`);
      if (unhandled.length > 0) {
        console.log(`${unhandled.length} value(s) could not be mapped to a class — see "unhandled" in report.json`);
      }
    } catch (err) {
      if (err instanceof UnsupportedBackendError) {
        console.error(`Rendering backend unsupported: ${err.message}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    } finally {
      await session?.close();
    }
  });

program.parseAsync();
