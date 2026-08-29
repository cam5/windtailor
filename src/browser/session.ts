import puppeteer, { type Browser, type Page } from "puppeteer-core";

export interface SessionOptions {
  /** Connect to an existing CDP endpoint (e.g. a Kitesurf / Browser Run websocket URL) instead of launching locally. */
  cdpEndpoint?: string;
  /** Path to a local browser executable. Ignored when cdpEndpoint is set. */
  executablePath?: string;
  /** Extra headers for the CDP connection handshake (e.g. Authorization for an authenticated remote endpoint). Ignored unless cdpEndpoint is set. */
  cdpHeaders?: Record<string, string>;
}

export class UnsupportedBackendError extends Error {}

/**
 * Abstraction over "however we got a CDP-speaking page." Puppeteer-core talks CDP either way,
 * so a local Chromium and a remote Kitesurf/Browser Run endpoint are the same code path here —
 * only the connect step differs.
 */
export class BrowserSession {
  private constructor(
    private readonly browser: Browser,
    public readonly page: Page,
  ) {}

  static async open(url: string, options: SessionOptions = {}): Promise<BrowserSession> {
    const browser = options.cdpEndpoint
      ? await puppeteer.connect({ browserWSEndpoint: options.cdpEndpoint, headers: options.cdpHeaders })
      : await puppeteer.launch({
          channel: options.executablePath ? undefined : "chrome",
          executablePath: options.executablePath,
          headless: true,
        });

    const page = (await browser.pages())[0] ?? (await browser.newPage());
    await page.goto(url, { waitUntil: "networkidle0" });

    const session = new BrowserSession(browser, page);
    await session.probeCapabilities();
    return session;
  }

  /** Bail loudly if the backend doesn't give us what the extraction step needs — no silent fallback. */
  private async probeCapabilities(): Promise<void> {
    const ok = await this.page.evaluate(() => {
      if (typeof window.getComputedStyle !== "function") return false;
      const probe = window.getComputedStyle(document.documentElement);
      return typeof probe.getPropertyValue === "function" && probe.getPropertyValue("display").length > 0;
    });

    if (!ok) {
      throw new UnsupportedBackendError(
        "Rendering backend does not expose a working window.getComputedStyle(); bailing rather than degrading silently.",
      );
    }
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
