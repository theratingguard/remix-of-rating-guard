import { google } from "googleapis";

const SITEMAP_URL =
  process.env["GOOGLE_INDEXING_SITEMAP_URL"] ?? "https://ratingguard.online/sitemap.xml";
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const DEFAULT_DAILY_LIMIT = 200;
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;
const PAGE_CHECK_CONCURRENCY = 8;

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function parseSitemap(xml, sitemapUrl) {
  if (!/<urlset(?:\s|>)/i.test(xml))
    throw new Error("The sitemap must be a URL set, not a sitemap index.");

  const origin = new URL(sitemapUrl).origin;
  const urls = [];
  for (const match of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const rawUrl = decodeXml(match[1].trim());
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.origin !== origin)
      throw new Error(`Sitemap contains a URL outside the configured HTTPS site: ${rawUrl}`);
    urls.push(url.toString());
  }
  return [...new Set(urls)];
}

function schemaTypes(value) {
  if (!value || typeof value !== "object") return [];
  const type = value["@type"];
  return Array.isArray(type) ? type : typeof type === "string" ? [type] : [];
}

function containsType(value, expectedType) {
  if (Array.isArray(value)) return value.some((entry) => containsType(entry, expectedType));
  if (!value || typeof value !== "object") return false;
  if (schemaTypes(value).includes(expectedType)) return true;
  return Object.values(value).some((entry) => containsType(entry, expectedType));
}

function hasEligibleSchema(value) {
  if (Array.isArray(value)) return value.some(hasEligibleSchema);
  if (!value || typeof value !== "object") return false;
  if (schemaTypes(value).includes("JobPosting")) return true;
  if (schemaTypes(value).includes("VideoObject")) {
    return Object.entries(value).some(
      ([key, entry]) => key !== "@type" && containsType(entry, "BroadcastEvent"),
    );
  }
  return Object.values(value).some(hasEligibleSchema);
}

function pageHasEligibleSchema(html) {
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      if (hasEligibleSchema(JSON.parse(match[1]))) return true;
    } catch {
      console.warn("[google-indexer] Ignoring malformed JSON-LD on a sitemap URL.");
    }
  }
  return false;
}

async function findEligibleUrls(urls) {
  const eligible = [];
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(PAGE_CHECK_CONCURRENCY, urls.length) },
    async () => {
      while (nextIndex < urls.length) {
        const index = nextIndex++;
        const url = urls[index];
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) {
            console.error(`[google-indexer] Page check failed (${response.status}): ${url}`);
            continue;
          }
          const html = await response.text();
          if (pageHasEligibleSchema(html)) eligible.push(url);
        } catch (error) {
          console.error(
            `[google-indexer] Page check failed: ${url}: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }
      }
    },
  );
  await Promise.all(workers);
  return eligible;
}

function integerEnv(name, fallback, minimum) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum)
    throw new Error(`${name} must be a whole number of at least ${minimum}.`);
  return parsed;
}

async function submitBatch(indexing, urls) {
  const results = await Promise.allSettled(
    urls.map((url) =>
      indexing.urlNotifications.publish({
        requestBody: { url, type: "URL_UPDATED" },
      }),
    ),
  );

  let succeeded = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      succeeded++;
      console.info(`[google-indexer] Submitted: ${urls[index]}`);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : "unknown API error";
      console.error(`[google-indexer] Submission failed: ${urls[index]}: ${reason}`);
    }
  });
  return succeeded;
}

async function main() {
  const siteUrl = new URL(SITEMAP_URL);
  if (
    siteUrl.protocol !== "https:" ||
    siteUrl.hostname !== "ratingguard.online" ||
    siteUrl.pathname !== "/sitemap.xml"
  ) {
    throw new Error("The sitemap URL must be https://ratingguard.online/sitemap.xml.");
  }

  const credentialsJson = process.env["GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON"];
  if (!credentialsJson) throw new Error("GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON is not set.");

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error("GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") {
    throw new Error("Service account JSON must include client_email and private_key.");
  }

  const response = await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Sitemap request failed with HTTP ${response.status}.`);
  const sitemap = parseSitemap(await response.text(), SITEMAP_URL);
  console.info(`[google-indexer] Found ${sitemap.length} unique sitemap URLs.`);

  const eligibleUrls = await findEligibleUrls(sitemap);
  const skippedCount = sitemap.length - eligibleUrls.length;
  console.info(
    `[google-indexer] ${eligibleUrls.length} eligible URLs; ${skippedCount} skipped because they lack eligible structured data or could not be checked.`,
  );
  if (eligibleUrls.length === 0) {
    console.info("[google-indexer] Total URLs submitted successfully: 0");
    return;
  }

  const offset = integerEnv("GOOGLE_INDEXING_OFFSET", 0, 0);
  const dailyLimit = integerEnv("GOOGLE_INDEXING_DAILY_LIMIT", DEFAULT_DAILY_LIMIT, 1);
  const urlsToSubmit = eligibleUrls.slice(offset, offset + dailyLimit);
  if (urlsToSubmit.length === 0) {
    console.info("[google-indexer] No eligible URLs remain after the configured offset.");
    console.info("[google-indexer] Total URLs submitted successfully: 0");
    return;
  }
  if (eligibleUrls.length > offset + urlsToSubmit.length) {
    console.warn(
      `[google-indexer] ${eligibleUrls.length - offset - urlsToSubmit.length} eligible URLs remain. Set GOOGLE_INDEXING_OFFSET=${offset + urlsToSubmit.length} for a later run.`,
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [INDEXING_SCOPE],
  });
  const indexing = google.indexing({ version: "v3", auth });
  let successfulSubmissions = 0;

  for (let start = 0; start < urlsToSubmit.length; start += BATCH_SIZE) {
    const batch = urlsToSubmit.slice(start, start + BATCH_SIZE);
    successfulSubmissions += await submitBatch(indexing, batch);
    if (start + BATCH_SIZE < urlsToSubmit.length)
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
  }

  console.info(`[google-indexer] Total URLs submitted successfully: ${successfulSubmissions}`);
}

main().catch((error) => {
  console.error(
    `[google-indexer] Fatal error: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
