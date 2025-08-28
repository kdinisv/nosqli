// Optional JS rendering using Playwright or Puppeteer (dynamic import)
// This module is loaded only when JS rendering is enabled.

export type JsRenderOptions = {
  timeoutMs?: number;
  waitMs?: number;
  waitSelector?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
};

export async function renderPage(
  url: string,
  opts: JsRenderOptions = {}
): Promise<{ url: string; html: string } | null> {
  const timeout = Math.max(1000, opts.timeoutMs ?? 10000);
  const waitMs = Math.max(0, opts.waitMs ?? 0);
  const waitSelector = opts.waitSelector;
  const waitUntil = opts.waitUntil ?? "networkidle";

  // Try Playwright first (dynamic specifier to avoid TS resolution when not installed)
  try {
    const pwName = "playwright";
    const { chromium } = (await import(pwName)) as any;
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ javaScriptEnabled: true });
      const page = await ctx.newPage();
      const resp = await page.goto(url, { timeout, waitUntil });
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, {
            timeout: Math.max(500, Math.min(timeout, 15000)),
          });
        } catch {
          /* ignore */
        }
      }
      if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
      }
      const html = await page.content();
      const finalUrl = page.url();
      await ctx.close();
      return { url: finalUrl, html };
    } finally {
      await browser.close();
    }
  } catch {
    /* fall through to Puppeteer */
  }

  // Try Puppeteer as a fallback (dynamic specifier)
  try {
    const ppName = "puppeteer";
    const puppeteer = await import(ppName);
    const browser = await (puppeteer as any).launch({ headless: "new" });
    try {
      const page = await (browser as any).newPage();
      await page.goto(url, { timeout, waitUntil });
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, {
            timeout: Math.max(500, Math.min(timeout, 15000)),
          });
        } catch {
          /* ignore */
        }
      }
      if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
      }
      const html = await page.content();
      const finalUrl = page.url();
      return { url: finalUrl, html };
    } finally {
      await (browser as any).close();
    }
  } catch {
    // Neither Playwright nor Puppeteer available
    return null;
  }
}
