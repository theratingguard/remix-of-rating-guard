import puppeteer from "puppeteer";
import { ScanError } from "./google-places.server";
import { lookup } from "node:dns/promises";
import { isPublicAddress } from "./google-places.server";

let resolving = false;
export async function resolveCidBusinessName(cid: string) {
  if (!/^\d{1,20}$/.test(cid)) throw new ScanError("INVALID_URL", "Invalid Google business CID.");
  if (resolving)
    throw new ScanError("RESOLVE_FAILED", "Another CID link is resolving; retry shortly.");
  resolving = true;
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const verifiedHosts = new Set<string>();
    page.on("request", async (request) => {
      const url = new URL(request.url());
      const allowed =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        /(^|\.)google\.com$|(^|\.)gstatic\.com$|(^|\.)googleusercontent\.com$/.test(url.hostname);
      try {
        if (!allowed || ["image", "font", "media"].includes(request.resourceType()))
          return await request.abort();
        if (!verifiedHosts.has(url.hostname)) {
          const addresses = await lookup(url.hostname, { all: true });
          if (!addresses.length || addresses.some((row) => !isPublicAddress(row.address)))
            return await request.abort();
          verifiedHosts.add(url.hostname);
        }
        await request.continue();
      } catch (error) {
        console.warn(
          "[cid-resolver] request blocked or closed",
          error instanceof Error ? error.message : "Unknown failure",
        );
        if (!request.isInterceptResolutionHandled()) await request.abort();
      }
    });
    await page.goto(`https://www.google.com/maps?cid=${cid}&hl=en`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForFunction(
      () =>
        document.querySelector("h1")?.textContent?.trim() ||
        (document.title.endsWith(" - Google Maps") && document.title !== "Google Maps"),
      { timeout: 15000 },
    );
    const name = await page.evaluate(
      () =>
        document.querySelector("h1")?.textContent?.trim() ||
        document.title.replace(/\s*-\s*Google Maps$/, "").trim(),
    );
    if (!name || name.length > 200 || /^(Google Maps|Before you continue|Sign in)/i.test(name))
      throw new ScanError(
        "UNSUPPORTED_LINK",
        "Google did not expose the CID business identity. Paste the exact Maps place link; no business was guessed.",
      );
    console.info(
      "[cid-resolver] Official Maps identity extracted; Places CID verification still required",
      cid,
    );
    return name;
  } catch (error) {
    if (error instanceof ScanError) throw error;
    console.error(
      "[cid-resolver] Browser resolution failed",
      error instanceof Error ? error.message : "Unknown failure",
    );
    throw new ScanError(
      "RESOLVE_FAILED",
      "CID Maps page could not be resolved in time. Retry or paste its exact business place link.",
    );
  } finally {
    if (browser) await browser.close();
    resolving = false;
  }
}
