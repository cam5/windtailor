#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrowserSession, UnsupportedBackendError } from "./browser/session.js";
import { extractTree } from "./browser/extract.js";
import { parseHeaders } from "./browser/headers.js";
import { collectValues } from "./tokens/collect.js";
import { buildTokenTable, DEFAULT_CLUSTER_OPTIONS } from "./tokens/cluster.js";
import { loadThemeFromFile, loadThemeFromJson } from "./tokens/themeConfig.js";
import type { StockTheme } from "./tokens/stockTheme.js";
import { assignClasses } from "./assign/assign.js";
import { renderReportJson } from "./output/report.js";
import { renderReconciledHtml } from "./output/html.js";
import { redactUrl } from "./output/redact.js";
import { renderTailwindConfigModule } from "./output/tailwindConfig.js";
import type { ReconciliationReport } from "./model/types.js";

const program = new Command();

program
  .name("windtailor")
  .description("Fetch a webpage, capture a DOM node's computed styles, and reconcile them into Tailwind classes + generated design tokens.")
  .argument("<url>", "URL of the page to fetch — http(s):// or a local file:// path")
  .requiredOption("-s, --selector <selector>", "CSS selector for the target node")
  .option("-o, --out <dir>", "output directory", "./out")
  .option("--cdp-endpoint <wsUrl>", "connect to an existing CDP endpoint (e.g. Kitesurf / Browser Run) instead of launching locally")
  .option(
    "--cdp-header <header>",
    "extra 'Key: Value' header for the --cdp-endpoint connection (repeatable) — e.g. an Authorization bearer token",
    (value: string, previous: string[]) => [...previous, value],
    [] as string[],
  )
  .option("--executable-path <path>", "path to a local browser executable (ignored with --cdp-endpoint)")
  .option("--theme-file <path>", "load a custom Tailwind theme from a .js/.cjs/.mjs/.json config file (extend or full theme) instead of stock Tailwind")
  .option("--theme-json <json>", "inline JSON for a custom Tailwind theme (same shape as --theme-file); mutually exclusive with --theme-file")
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
        cdpHeaders: parseHeaders(opts.cdpHeader),
      });

      const tree = await extractTree(session.page, opts.selector);
      await session.close();
      session = undefined;

      if (opts.themeFile && opts.themeJson) {
        throw new Error("Pass only one of --theme-file / --theme-json, not both.");
      }
      const stockTheme: StockTheme | undefined = opts.themeFile
        ? await loadThemeFromFile(opts.themeFile)
        : opts.themeJson
          ? loadThemeFromJson(opts.themeJson)
          : undefined;
      const themeSource: string | undefined = opts.themeFile ?? (opts.themeJson ? "inline" : undefined);

      const collected = collectValues(tree);
      const tokens = buildTokenTable(
        collected,
        {
          spacingTolerancePx: opts.spacingTol,
          radiusTolerancePx: opts.radiusTol,
          fontSizeTolerancePx: opts.fontSizeTol,
          colorTolerance: opts.colorTol,
        },
        stockTheme,
      );
      const { classes, unhandled, suggestions } = assignClasses(tree, tokens);

      const report: ReconciliationReport = { sourceUrl: redactUrl(url), selector: opts.selector, tree, tokens, classes, unhandled, suggestions, themeSource };

      await mkdir(opts.out, { recursive: true });
      await writeFile(path.join(opts.out, "report.json"), renderReportJson(report));
      await writeFile(path.join(opts.out, "tailwind.config.tokens.js"), renderTailwindConfigModule(tokens));
      await writeFile(path.join(opts.out, "reconciled.html"), renderReconciledHtml(tree, classes));

      console.log(`Wrote report.json, tailwind.config.tokens.js, reconciled.html to ${opts.out}`);
      const generatedTokenCount = Object.values(tokens.generated).reduce((sum, entries) => sum + entries.length, 0);
      if (generatedTokenCount > 0) {
        console.log(
          `${generatedTokenCount} new design token(s) minted in tailwind.config.tokens.js — merge its "extend" into your real Tailwind config, or those classes in reconciled.html (e.g. rounded-33) won't resolve to anything.`,
        );
      }
      if (unhandled.length > 0) {
        console.log(`${unhandled.length} value(s) could not be mapped to a class — see "unhandled" in report.json`);
      }
      if (suggestions.length > 0) {
        const clamped = suggestions.filter((s) => s.kind === "clamped").length;
        const generated = suggestions.filter((s) => s.kind === "generated").length;
        const arbitrary = suggestions.filter((s) => s.kind === "arbitrary").length;
        console.log(
          `${suggestions.length} value(s) worth reviewing for your theme (${clamped} clamped, ${generated} newly minted, ${arbitrary} arbitrary) — see "suggestions" in report.json`,
        );
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
