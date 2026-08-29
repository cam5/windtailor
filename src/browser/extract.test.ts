import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { extractTree } from "./extract.js";

// Locally this resolves the system Chrome via `channel`. CI has no such install, so it sets
// CHROME_PATH (from browser-actions/setup-chrome) to point at an explicit binary instead.
async function withPage(html: string, run: (page: Page) => Promise<void>): Promise<void> {
  const chromePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch({
    channel: chromePath ? undefined : "chrome",
    executablePath: chromePath,
    headless: true,
  });
  try {
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    await page.setContent(html);
    await run(page);
  } finally {
    await browser.close();
  }
}

test("captures a property set by an author stylesheet rule", async () => {
  await withPage(`<style>#card { margin-top: 13px; }</style><div id="card"></div>`, async (page) => {
    const tree = await extractTree(page, "#card");
    assert.equal(tree.style.marginTop, "13px");
  });
});

test("drops a property that matches no rule at all, author or user-agent", async () => {
  await withPage(`<div id="card"></div>`, async (page) => {
    const tree = await extractTree(page, "#card");
    assert.equal(tree.style.position, undefined);
    assert.equal(tree.style.top, undefined);
    assert.equal(tree.style.width, undefined);
  });
});

test("keeps a property backed by a genuine user-agent rule (display: block on a div)", async () => {
  await withPage(`<div id="card"></div>`, async (page) => {
    const tree = await extractTree(page, "#card");
    assert.equal(tree.style.display, "block");
  });
});

test("propagates an inheritable property from an ancestor's rule to a child with no rule of its own", async () => {
  await withPage(
    `<style>#card { color: #f0f2f5; }</style><div id="card"><div class="child">hi</div></div>`,
    async (page) => {
      const tree = await extractTree(page, "#card");
      const child = tree.children.find((c) => c.tag === "div");
      assert.ok(child, "expected a child div node");
      assert.equal(child!.style.color, "rgb(240, 242, 245)");
    },
  );
});

test("does not propagate a non-inheritable property from an ancestor's rule to a child", async () => {
  await withPage(
    `<style>#card { background-color: #3a81f5; }</style><div id="card"><div class="child">hi</div></div>`,
    async (page) => {
      const tree = await extractTree(page, "#card");
      const child = tree.children.find((c) => c.tag === "div");
      assert.ok(child, "expected a child div node");
      assert.equal(child!.style.backgroundColor, undefined);
    },
  );
});
