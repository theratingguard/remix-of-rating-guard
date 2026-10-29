import { createSign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const STATIC_PATHS = [
  "/",
  "/about",
  "/blog",
  "/contact",
  "/get-started",
  "/privacy",
  "/responsible-use",
  "/terms",
];
const SUPPORTED_LOCALES = new Set([
  "en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ar-AE", "hi-IN", "ja-JP",
  "pt-BR", "en-CA", "en-AU", "it-IT", "nl-NL", "ko-KR", "zh-CN", "tr-TR",
  "id-ID", "sv-SE", "pl-PL", "en-SG",
]);
const PAGE_BATCH_SIZE = 1000;

function parseEnv(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    values.set(match[1], value);
  }
  return values;
}

async function loadSettings() {
  const values = new Map(Object.entries(process.env));
  for (const file of [".env.production.local", ".env.production", ".env.local", ".env"]) {
    try {
      const fileValues = parseEnv(await readFile(file, "utf8"));
      for (const [key, value] of fileValues) {
        if (!values.has(key)) values.set(key, value);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return values;
}

function isSubstantivePage(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  const intro = content.intro;
  const sections = content.sections;
  return (
    typeof intro === "string" &&
    intro.trim().length >= 120 &&
    Array.isArray(sections) &&
    sections.length >= 3 &&
    sections.every(
      (section) =>
        section &&
        typeof section.heading === "string" &&
        section.heading.trim().length >= 3 &&
        typeof section.body === "string" &&
        section.body.trim().length >= 120,
    )
  );
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getVideoMetadata(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const video = content.video;
  if (!video || typeof video !== "object" || Array.isArray(video)) return null;
  const { youtubeUrl, name, description, uploadDate, duration } = video;
  if (
    typeof youtubeUrl !== "string" ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof description !== "string" ||
    !description.trim() ||
    typeof uploadDate !== "string" ||
    !Number.isFinite(Date.parse(uploadDate)) ||
    typeof duration !== "string" ||
    !/^PT(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+)S)?$/.test(duration) ||
    duration === "PT"
  )
    return null;
  let parsed;
  try {
    parsed = new URL(youtubeUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const videoId =
    host === "youtu.be"
      ? parsed.pathname.slice(1)
      : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)
        ? parsed.pathname === "/watch"
          ? parsed.searchParams.get("v") ?? ""
          : parsed.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1] ?? ""
        : "";
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const durationParts = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  const durationSeconds =
    Number(durationParts?.[1] ?? 0) * 3600 +
    Number(durationParts?.[2] ?? 0) * 60 +
    Number(durationParts?.[3] ?? 0);
  if (durationSeconds <= 0) return null;
  return {
    videoId,
    name: name.trim(),
    description: description.trim().slice(0, 2048),
    uploadDate: new Date(uploadDate).toISOString(),
    durationSeconds,
  };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function fetchPublishedPages(settings) {
  const supabaseUrl = settings.get("SUPABASE_URL") ?? settings.get("VITE_SUPABASE_URL");
  const publishableKey =
    settings.get("SUPABASE_PUBLISHABLE_KEY") ?? settings.get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.warn(
      "[sitemap] Supabase URL/key are not configured; only the curated public routes will be included.",
    );
    return [];
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pages = [];
  for (let start = 0; ; start += PAGE_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("seo_keywords")
      .select("locale,slug,translation_group,updated_at,page_content,search_volume")
      .eq("status", "published")
      .not("page_content", "is", null)
      .order("search_volume", { ascending: false, nullsFirst: false })
      .order("locale")
      .order("slug")
      .range(start, start + PAGE_BATCH_SIZE - 1);
    if (error) {
      throw new Error(
        `Could not read published SEO pages. Apply the SEO migration and verify public read access: ${error.message}`,
      );
    }
    if (!data?.length) break;
    pages.push(
      ...data.filter(
        (page) =>
          SUPPORTED_LOCALES.has(page.locale) &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug) &&
          isSubstantivePage(page.page_content),
      ),
    );
    if (data.length < PAGE_BATCH_SIZE || pages.length >= 1000) break;
  }
  return pages.slice(0, 1000);
}

async function fetchPublishedBlogPosts(settings) {
  const supabaseUrl = settings.get("SUPABASE_URL") ?? settings.get("VITE_SUPABASE_URL");
  const publishableKey =
    settings.get("SUPABASE_PUBLISHABLE_KEY") ?? settings.get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) return [];
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,updated_at,published_at")
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  if (error)
    throw new Error(`Could not read published blog posts for the sitemap: ${error.message}`);
  return (data ?? []).filter((post) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug));
}

function isSubstantiveLocationContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  return (
    typeof content.intro === "string" &&
    content.intro.trim().length >= 120 &&
    Array.isArray(content.sections) &&
    content.sections.length >= 3 &&
    content.sections.every(
      (section) =>
        section &&
        typeof section.heading === "string" &&
        section.heading.trim().length >= 3 &&
        typeof section.body === "string" &&
        section.body.trim().length >= 120,
    ) &&
    Array.isArray(content.faqs) &&
    content.faqs.length > 0 &&
    content.faqs.every(
      (faq) =>
        faq &&
        typeof faq.question === "string" &&
        faq.question.trim().length >= 5 &&
        typeof faq.answer === "string" &&
        faq.answer.trim().length >= 40,
    )
  );
}

async function fetchPublishedLocationPages(settings) {
  const supabaseUrl = settings.get("SUPABASE_URL") ?? settings.get("VITE_SUPABASE_URL");
  const publishableKey =
    settings.get("SUPABASE_PUBLISHABLE_KEY") ?? settings.get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) return [];
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pages = [];
  for (let start = 0; ; start += PAGE_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("review_location_pages")
      .select("country_slug,city_slug,updated_at,page_content")
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("country_slug")
      .order("city_slug")
      .range(start, start + PAGE_BATCH_SIZE - 1);
    if (error)
      throw new Error(`Could not read published location pages for sitemap: ${error.message}`);
    if (!data?.length) break;
    pages.push(
      ...data.filter(
        (page) =>
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.country_slug) &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.city_slug) &&
          isSubstantiveLocationContent(page.page_content),
      ),
    );
    if (data.length < PAGE_BATCH_SIZE) break;
  }
  return pages;
}

function sitemapXml(origin, pages, blogPosts, locationPages) {
  const staticUrls = STATIC_PATHS.map((path) => ({
    loc: new URL(path, origin).toString(),
    lastmod: null,
    alternates: [],
    video: null,
  }));
  const groups = new Map();
  for (const page of pages) {
    if (!page.translation_group) continue;
    const group = groups.get(page.translation_group) ?? [];
    group.push(page);
    groups.set(page.translation_group, group);
  }
  const pageUrls = pages.map((page) => ({
    loc: new URL(
      `/${encodeURIComponent(page.locale)}/service/${encodeURIComponent(page.slug)}`,
      origin,
    ).toString(),
    lastmod: page.updated_at,
    video: getVideoMetadata(page.page_content),
    alternates: (groups.get(page.translation_group) ?? []).map((translation) => ({
      locale: translation.locale,
      loc: new URL(
        `/${encodeURIComponent(translation.locale)}/service/${encodeURIComponent(translation.slug)}`,
        origin,
      ).toString(),
    })),
  }));
  const blogUrls = blogPosts.map((post) => ({
    loc: new URL(`/blog/${encodeURIComponent(post.slug)}`, origin).toString(),
    lastmod: post.updated_at,
    alternates: [],
    video: null,
  }));
  const locationUrls = locationPages.map((page) => ({
    loc: new URL(
      `/remove-google-review/${encodeURIComponent(page.country_slug)}/${encodeURIComponent(page.city_slug)}`,
      origin,
    ).toString(),
    lastmod: page.updated_at,
    video: getVideoMetadata(page.page_content),
    alternates: [],
  }));
  const urls = [...staticUrls, ...pageUrls, ...blogUrls, ...locationUrls];
  const entries = urls.map(({ loc, lastmod, alternates, video }) => {
    const lastmodTag =
      typeof lastmod === "string" && Number.isFinite(Date.parse(lastmod))
        ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`
        : "";
    const alternateTags = alternates
      .map(
        (alternate) =>
          `<xhtml:link rel="alternate" hreflang="${escapeXml(alternate.locale)}" href="${escapeXml(alternate.loc)}" />`,
      )
      .join("");
    const videoTag = video
      ? `<video:video><video:thumbnail_loc>${escapeXml(`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`)}</video:thumbnail_loc><video:title>${escapeXml(video.name)}</video:title><video:description>${escapeXml(video.description)}</video:description><video:player_loc allow_embed="yes">${escapeXml(`https://www.youtube-nocookie.com/embed/${video.videoId}`)}</video:player_loc><video:duration>${video.durationSeconds}</video:duration><video:publication_date>${video.uploadDate}</video:publication_date></video:video>`
      : "";
    return `  <url><loc>${escapeXml(loc)}</loc>${lastmodTag}${alternateTags}${videoTag}</url>`;
  });
  return {
    urls: urls.map((url) => url.loc),
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${entries.join("\n")}\n</urlset>\n`,
  };
}

async function notifyGoogleSearchConsole(settings, sitemapUrl) {
  const rawServiceAccount = settings.get("GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON");
  const siteUrl = settings.get("GOOGLE_SEARCH_CONSOLE_SITE_URL");
  if (!rawServiceAccount || !siteUrl) {
    console.info("[sitemap] Search Console submission skipped; credentials are not configured.");
    return;
  }

  try {
    const account = JSON.parse(rawServiceAccount);
    if (typeof account.client_email !== "string" || typeof account.private_key !== "string")
      throw new Error("Service account JSON must include client_email and private_key.");
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/webmasters",
        aud: tokenUrl,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    );
    const unsignedToken = `${header}.${claims}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsignedToken);
    signer.end();
    const assertion = `${unsignedToken}.${signer.sign(account.private_key, "base64url")}`;
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) throw new Error(`OAuth token request returned HTTP ${tokenResponse.status}.`);
    const tokenBody = await tokenResponse.json();
    if (typeof tokenBody.access_token !== "string")
      throw new Error("OAuth token response did not contain an access token.");
    const endpoint = new URL(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    );
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Search Console returned HTTP ${response.status}.`);
    console.info("[sitemap] Submitted sitemap to Google Search Console.");
  } catch (error) {
    console.warn(
      `[sitemap] Google Search Console submission failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

async function notifyIndexNow(settings, urls, origin) {
  const key = settings.get("INDEXNOW_KEY");
  if (!key) {
    console.info("[sitemap] IndexNow submission skipped; INDEXNOW_KEY is not configured.");
    return;
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    console.warn("[sitemap] IndexNow submission skipped; INDEXNOW_KEY has an invalid format.");
    return;
  }

  const keyFile = `public/${key}.txt`;
  try {
    const existingKey = await readFile(keyFile, "utf8");
    if (existingKey.trim() !== key) {
      console.warn("[sitemap] IndexNow submission skipped; the key file contains a different key.");
      return;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(keyFile, `${key}\n`, "utf8");
  }
  const keyLocation = new URL(`/${key}.txt`, origin).toString();
  for (let start = 0; start < urls.length; start += 10_000) {
    try {
      const response = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: origin.hostname,
          key,
          keyLocation,
          urlList: urls.slice(start, start + 10_000),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`IndexNow returned HTTP ${response.status}.`);
      console.info(
        `[sitemap] Submitted ${Math.min(10_000, urls.length - start)} URLs to IndexNow.`,
      );
    } catch (error) {
      console.warn(
        `[sitemap] IndexNow submission failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}

const settings = await loadSettings();
const configuredUrl =
  settings.get("PUBLIC_APP_URL") ??
  settings.get("VITE_PUBLIC_APP_URL") ??
  "https://ratingguard.online";
const origin = new URL(configuredUrl);
if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) {
  throw new Error("The public site URL must use HTTPS.");
}

const pages = await fetchPublishedPages(settings);
const blogPosts = await fetchPublishedBlogPosts(settings);
const locationPages = await fetchPublishedLocationPages(settings);
const sitemap = sitemapXml(origin, pages, blogPosts, locationPages);
if (sitemap.urls.length > 50_000)
  throw new Error("Generated sitemap exceeds the 50,000 URL sitemap limit.");
if (
  !sitemap.xml.startsWith('<?xml version="1.0"') ||
  sitemap.urls.some((url) => new URL(url).origin !== origin.origin)
) {
  throw new Error("Generated sitemap validation failed.");
}
await writeFile("public/sitemap.xml", sitemap.xml, "utf8");
await writeFile(
  "public/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /staff/\nDisallow: /client/\nDisallow: /manager/\nDisallow: /reseller/\nDisallow: /api/\nDisallow: /dashboard\nSitemap: ${new URL("/sitemap.xml", origin)}\n`,
  "utf8",
);
console.info(
  `[sitemap] Generated ${sitemap.urls.length} public URLs (${pages.length} SEO pages, ${blogPosts.length} blog posts, ${locationPages.length} reviewed location pages) for ${origin.origin}.`,
);
await Promise.all([
  notifyGoogleSearchConsole(settings, new URL("/sitemap.xml", origin).toString()),
  notifyIndexNow(settings, sitemap.urls, origin),
]);
