import { chromium } from "@playwright/test";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MAX_URLS = 25;

function printUsage() {
  console.log(
    [
      "Usage: node scripts/qa-scraper.js <url> [url ...]",
      "",
      "Inspect pages you control and report their links and form structure.",
      "Local hosts are allowed by default. Add exact staging hostnames with",
      "QA_ALLOWED_HOSTS=staging.example.com (comma-separated for multiple hosts).",
      "This script does not click or submit forms, spoof browser identity, or solve CAPTCHAs.",
    ].join("\n"),
  );
}

function allowedHosts() {
  const hosts = new Set(LOCAL_HOSTS);
  const configuredHosts = process.env.QA_ALLOWED_HOSTS ?? "";

  for (const value of configuredHosts.split(",")) {
    const host = value.trim().toLowerCase();
    if (!host) continue;
    if (host.includes("/") || host.includes(":") || host.includes("@")) {
      throw new Error(`QA_ALLOWED_HOSTS must contain hostnames only; invalid entry: ${value}`);
    }
    hosts.add(host);
  }

  return hosts;
}

function parseAllowedUrl(value, hosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Only HTTP and HTTPS URLs are allowed: ${value}`);
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }
  if (!hosts.has(url.hostname.toLowerCase())) {
    throw new Error(
      `Target host "${url.hostname}" is not allowed. Add its exact hostname to QA_ALLOWED_HOSTS.`,
    );
  }

  return url.toString();
}

async function inspectPage(page, url, hosts) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      let destination;
      try {
        destination = new URL(request.url());
      } catch {
        await route.abort("blockedbyclient");
        return;
      }

      if (
        !["http:", "https:"].includes(destination.protocol) ||
        !hosts.has(destination.hostname.toLowerCase())
      ) {
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  });

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  const pageUrl = page.url();
  const finalUrl = parseAllowedUrl(pageUrl, hosts);
  const [title, links, forms, hasCaptcha] = await Promise.all([
    page.title(),
    page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        text: anchor.innerText.trim(),
        href: anchor.href,
      })),
    ),
    page.locator("form").evaluateAll((elements) =>
      elements.map((form) => ({
        action: form.action,
        method: (form.method || "get").toUpperCase(),
        fields: Array.from(form.querySelectorAll("input, select, textarea, button")).map(
          (field) => ({
            name: field.name,
            type: field.type || field.tagName.toLowerCase(),
          }),
        ),
      })),
    ),
    page
      .locator(
        [
          'iframe[src*="captcha" i]',
          'iframe[title*="captcha" i]',
          '[class*="captcha" i]',
          '[id*="captcha" i]',
          '[name*="captcha" i]',
        ].join(", "),
      )
      .evaluateAll((elements) =>
        elements.some((element) => {
          const style = window.getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            bounds.width > 0 &&
            bounds.height > 0
          );
        }),
      ),
  ]);

  return {
    requestedUrl: url,
    finalUrl,
    httpStatus: response?.status() ?? null,
    title,
    hasCaptcha,
    links,
    forms,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  if (args.length === 0) {
    printUsage();
    throw new Error("Provide at least one URL to inspect.");
  }
  if (args.length > MAX_URLS) {
    throw new Error(`Inspect at most ${MAX_URLS} URLs per run.`);
  }

  const hosts = allowedHosts();
  const urls = args.map((value) => parseAllowedUrl(value, hosts));
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const results = [];
    for (const url of urls) {
      results.push(await inspectPage(page, url, hosts));
    }

    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => result.hasCaptcha)) {
      console.error("CAPTCHA detected; manual QA is required. No challenge was bypassed.");
      process.exitCode = 2;
    } else if (results.some((result) => result.httpStatus === null || result.httpStatus >= 400)) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[qa-scraper] ${error instanceof Error ? error.message : "Unknown error."}`);
  process.exitCode = 1;
});
