import { Queue, Worker } from "bullmq";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { queueConnection, queueRedis } from "@/lib/queue/config.server";

export const SEO_QUEUE = "seo-automation";
const seoJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 60_000 },
  removeOnComplete: 20,
  removeOnFail: 50,
};
const MAX_PAGES = 20;
const MAX_FETCHES = 30;
const MAX_DAILY_CONTENT_DRAFTS = 2;
const MAX_DAILY_META_SUGGESTIONS = 5;
const MAX_DAILY_LINK_SUGGESTIONS = 5;
const DEFAULT_SEO_KEYWORDS = [
  "Google review management",
  "Google review removal service",
  "Fake Google review reporting",
  "Online reputation management",
  "Business reputation monitoring",
];

type PageMetadata = {
  title: string | null;
  description: string | null;
  internalLinks: string[];
};

type AuditIssue = {
  page_url: string;
  issue_type: "page_unreachable" | "missing_title" | "missing_description" | "broken_link";
  severity: "low" | "medium" | "high";
  details: Record<string, string | number | null>;
};

export function parsePageMetadata(html: string, baseUrl: URL): PageMetadata {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i
    .exec(html)?.[1]
    ?.replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const descriptions = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const description = descriptions
    .find((tag) => /\bname\s*=\s*["']description["']/i.test(tag))
    ?.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]
    ?.trim();
  const internalLinks = new Set<string>();
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1]!, baseUrl);
      if (
        url.origin === baseUrl.origin &&
        ["http:", "https:"].includes(url.protocol) &&
        !url.pathname.match(/\.(?:png|jpe?g|gif|svg|webp|pdf|zip|css|js)$/i)
      ) {
        url.hash = "";
        internalLinks.add(url.toString());
      }
    } catch {
      // Invalid hrefs are ignored; the page fetch audit handles valid same-site links.
    }
  }
  return {
    title: title || null,
    description: description || null,
    internalLinks: [...internalLinks],
  };
}

export function parseSitemap(xml: string, origin: URL) {
  const urls = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    try {
      const url = new URL(match[1]!.trim());
      if (
        url.origin === origin.origin &&
        ["http:", "https:"].includes(url.protocol) &&
        !url.pathname.endsWith(".xml")
      ) {
        urls.add(url.toString());
      }
    } catch {
      // Malformed sitemap entries are not fetched.
    }
    if (urls.size >= MAX_PAGES) break;
  }
  return [...urls];
}

function configuredSiteUrl() {
  const value =
    process.env["PUBLIC_APP_URL"]?.trim() ||
    process.env["VITE_PUBLIC_APP_URL"]?.trim() ||
    "https://ratingguard.online";
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
    throw new Error("SEO audit base URL must use HTTPS.");
  return url;
}

async function fetchWithLimit(url: URL, method: "GET" | "HEAD" = "GET") {
  return fetch(url, {
    method,
    redirect: "manual",
    headers: { "User-Agent": "RatingGuard-SEOBot/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
}

async function readTextBounded(response: Response, maxBytes: number) {
  if (!response.body) throw new Error("SEO audit response body is missing.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`SEO audit response exceeded the ${maxBytes}-byte limit.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function localOllamaUrl() {
  const value = process.env["OLLAMA_URL"]?.trim() || "http://127.0.0.1:11434";
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("SEO Ollama must use a local loopback URL; remote AI providers are disabled.");
  }
  return url.toString().replace(/\/+$/, "");
}

function configuredOllamaModel() {
  return process.env["OLLAMA_MODEL"]?.trim() || "llama3.2:3b";
}

const outlineSchema = z.object({
  title: z.string().trim().min(1).max(180),
  sections: z.array(z.string().trim().min(1).max(120)).min(3).max(8),
});
const metaSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(320),
});

async function ollamaJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const base = localOllamaUrl();
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: configuredOllamaModel(),
      stream: false,
      format: "json",
      options: { num_ctx: 2048, num_predict: 256, temperature: 0.3 },
      prompt,
    }),
  });
  if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}.`);
  const data = z.object({ response: z.string().max(8_000) }).parse(await response.json());
  return schema.parse(JSON.parse(data.response));
}

async function todayCount(
  table: "seo_content_drafts" | "seo_meta_suggestions" | "seo_link_suggestions",
) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const result = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString())
    .throwOnError();
  return result.count ?? 0;
}

async function createSeoProposals(
  auditedPageUrls: string[],
  metadataCandidates: Array<{ page_url: string; title: string | null; description: string | null }>,
) {
  let created = 0;
  const draftCount = await todayCount("seo_content_drafts");
  for (const keyword of DEFAULT_SEO_KEYWORDS.slice(
    0,
    Math.max(0, MAX_DAILY_CONTENT_DRAFTS - draftCount),
  )) {
    const outline = await ollamaJson(
      `Generate an ethical, accurate editorial outline for Rating Guard about "${keyword}". Do not claim guaranteed removals, Google affiliation, or legal outcomes. Return JSON only with title and 3-8 section headings.`,
      outlineSchema,
    );
    await supabaseAdmin
      .from("seo_content_drafts")
      .insert({
        title: outline.title,
        target_keyword: keyword,
        outline: { sections: outline.sections },
      })
      .throwOnError();
    created += 1;
  }

  const metaCount = await todayCount("seo_meta_suggestions");
  const remainingMeta = Math.max(0, MAX_DAILY_META_SUGGESTIONS - metaCount);
  const existingSuggestions = await supabaseAdmin
    .from("seo_meta_suggestions")
    .select("page_url")
    .limit(1000)
    .throwOnError();
  const alreadySuggested = new Set(
    existingSuggestions.data.map((suggestion) => suggestion.page_url),
  );
  let metaCreated = 0;
  for (const page of metadataCandidates) {
    if (metaCreated >= remainingMeta || alreadySuggested.has(page.page_url)) continue;
    const suggestion = await ollamaJson(
      `Rewrite the metadata for this Rating Guard public page. URL: ${page.page_url}. Current title: ${page.title ?? "(missing)"}. Current description: ${page.description ?? "(missing)"}. Keep claims accurate; do not invent guarantees, prices, reviews, or affiliations. Return JSON with title and description.`,
      metaSchema,
    );
    await supabaseAdmin
      .from("seo_meta_suggestions")
      .insert({
        page_url: page.page_url,
        current_title: page.title,
        proposed_title: suggestion.title,
        current_description: page.description,
        proposed_description: suggestion.description,
      })
      .throwOnError();
    metaCreated += 1;
    created += 1;
  }

  const linksCreatedToday = await todayCount("seo_link_suggestions");
  const remainingLinks = Math.max(0, MAX_DAILY_LINK_SUGGESTIONS - linksCreatedToday);
  if (remainingLinks > 0) {
    const urlList = [...new Set(auditedPageUrls)].slice(0, MAX_PAGES);
    if (urlList.length >= 2) {
      const linkSchema = z.object({
        links: z
          .array(
            z.object({
              source: z.string().url().max(500),
              target: z.string().url().max(500),
              anchor: z.string().trim().min(1).max(120),
              rationale: z.string().trim().min(1).max(500),
            }),
          )
          .max(MAX_DAILY_LINK_SUGGESTIONS),
      });
      const suggestions = await ollamaJson(
        `Suggest up to ${remainingLinks} contextual internal links between only these existing Rating Guard pages. Use only exact URLs from the list; do not create pages or claims. Return JSON {links:[{source,target,anchor,rationale}]}. Pages: ${JSON.stringify(urlList)}`,
        linkSchema,
      );
      const allow = new Set(urlList);
      const approvedSuggestions = suggestions.links
        .filter(
          (link) => allow.has(link.source) && allow.has(link.target) && link.source !== link.target,
        )
        .slice(0, remainingLinks);
      if (approvedSuggestions.length) {
        const inserted = await supabaseAdmin
          .from("seo_link_suggestions")
          .upsert(
            approvedSuggestions.map((link) => ({
              source_url: link.source,
              target_url: link.target,
              anchor_text: link.anchor,
              rationale: link.rationale,
            })),
            { onConflict: "source_url,target_url,anchor_text", ignoreDuplicates: true },
          )
          .select("id")
          .throwOnError();
        created += inserted.data.length;
      }
    }
  }

  return created;
}

async function auditSite(runId: string) {
  const siteUrl = configuredSiteUrl();
  let requests = 0;
  const sitemapUrl = new URL("/sitemap.xml", siteUrl);
  requests += 1;
  const sitemapResponse = await fetchWithLimit(sitemapUrl);
  if (!sitemapResponse.ok) throw new Error(`Sitemap returned HTTP ${sitemapResponse.status}.`);
  const pages = parseSitemap(await readTextBounded(sitemapResponse, 512_000), siteUrl);
  if (!pages.length) throw new Error("Sitemap contains no valid same-origin page URLs.");
  const issues: AuditIssue[] = [];
  const checkedLinks = new Set<string>();
  const auditedPageUrls: string[] = [];
  const metadataCandidates: Array<{
    page_url: string;
    title: string | null;
    description: string | null;
  }> = [];
  let auditPages = 0;

  for (const pageValue of pages) {
    if (requests >= MAX_FETCHES) break;
    const pageUrl = new URL(pageValue);
    requests += 1;
    auditPages += 1;
    auditedPageUrls.push(pageValue);
    let response: Response;
    try {
      response = await fetchWithLimit(pageUrl);
    } catch (error) {
      issues.push({
        page_url: pageValue,
        issue_type: "page_unreachable",
        severity: "high",
        details: {
          message: error instanceof Error ? error.message.slice(0, 240) : "Request failed",
        },
      });
      continue;
    }
    if (!response.ok) {
      issues.push({
        page_url: pageValue,
        issue_type: "page_unreachable",
        severity: "high",
        details: { status: response.status },
      });
      continue;
    }
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) continue;
    const html = await readTextBounded(response, 1_000_000);
    const metadata = parsePageMetadata(html, siteUrl);
    metadataCandidates.push({
      page_url: pageValue,
      title: metadata.title,
      description: metadata.description,
    });
    if (!metadata.title)
      issues.push({
        page_url: pageValue,
        issue_type: "missing_title",
        severity: "medium",
        details: { current_title: metadata.title, current_description: metadata.description },
      });
    if (!metadata.description)
      issues.push({
        page_url: pageValue,
        issue_type: "missing_description",
        severity: "low",
        details: { current_title: metadata.title, current_description: metadata.description },
      });

    for (const link of metadata.internalLinks) {
      if (requests >= MAX_FETCHES) break;
      if (checkedLinks.has(link) || link === pageValue) continue;
      checkedLinks.add(link);
      requests += 1;
      let linkResponse: Response;
      try {
        linkResponse = await fetchWithLimit(new URL(link), "HEAD");
      } catch {
        issues.push({
          page_url: pageValue,
          issue_type: "broken_link",
          severity: "medium",
          details: { link },
        });
        continue;
      }
      if (!linkResponse.ok && ![301, 302, 303, 307, 308, 405, 501].includes(linkResponse.status))
        issues.push({
          page_url: pageValue,
          issue_type: "broken_link",
          severity: "medium",
          details: { link, status: linkResponse.status },
        });
      if (checkedLinks.size >= MAX_PAGES) break;
    }
  }

  if (issues.length) {
    await supabaseAdmin
      .from("seo_audit_issues")
      .insert(issues.map((issue) => ({ ...issue, run_id: runId })))
      .throwOnError();
  }
  return { auditPages, issueCount: issues.length, auditedPageUrls, metadataCandidates };
}

export async function runSeoAutomation() {
  let runId: string | undefined;
  try {
    const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("seo_worker_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: "Recovered a stale run left active for more than two hours.",
      })
      .eq("status", "running")
      .lt("started_at", staleBefore)
      .throwOnError();
    const run = await supabaseAdmin
      .from("seo_worker_runs")
      .insert({ status: "running" })
      .select("id")
      .single()
      .throwOnError();
    runId = run.data.id;
    const audit = await auditSite(runId);
    const tasksCompleted = await createSeoProposals(
      audit.auditedPageUrls,
      audit.metadataCandidates,
    );
    await supabaseAdmin
      .from("seo_worker_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        tasks_completed: tasksCompleted,
        audit_pages: audit.auditPages,
        issue_count: audit.issueCount,
      })
      .eq("id", runId)
      .throwOnError();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SEO worker failure.";
    if (runId) {
      await supabaseAdmin
        .from("seo_worker_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: message.slice(0, 1000),
        })
        .eq("id", runId)
        .throwOnError();
    }
    throw error;
  }
}

export async function startSeoWorker() {
  const queue = new Queue(SEO_QUEUE, { connection: queueConnection() });
  await queue.upsertJobScheduler(
    "seo-daily-schedule",
    { pattern: "0 3 * * *", tz: "UTC" },
    { name: "daily-seo-audit", data: {}, opts: seoJobOptions },
  );
  await queue.close();
  let state: "idle" | "active" = "idle";
  const worker = new Worker(
    SEO_QUEUE,
    async (job) => {
      state = "active";
      await worker.client.then((client) =>
        client.set(
          "rg:health:seo-worker",
          JSON.stringify({ state: "active", checked_at: new Date().toISOString() }),
          { EX: 90 },
        ),
      );
      try {
        await runSeoAutomation();
      } finally {
        state = "idle";
        await worker.client.then((client) =>
          client.set(
            "rg:health:seo-worker",
            JSON.stringify({ state: "idle", checked_at: new Date().toISOString() }),
            { EX: 90 },
          ),
        );
      }
      return { completed_at: new Date().toISOString(), job_id: job.id };
    },
    { connection: queueConnection(), concurrency: 1 },
  );
  worker.on("error", (error) => console.error("[seo-worker]", error.message));
  worker.on("failed", (job, error) =>
    console.error("[seo-worker] job failed", job?.id, error.message),
  );
  await worker.waitUntilReady();
  const heartbeat = async () =>
    worker.client.then((client) =>
      client.set(
        "rg:health:seo-worker",
        JSON.stringify({ state, checked_at: new Date().toISOString() }),
        { EX: 90 },
      ),
    );
  await heartbeat();
  const heartbeatTimer = setInterval(() => {
    heartbeat().catch((error) => console.error("[seo-worker] heartbeat failed", error));
  }, 30_000);
  let shuttingDown: Promise<void> | undefined;
  const shutdown = () => {
    if (!shuttingDown) {
      clearInterval(heartbeatTimer);
      shuttingDown = worker.close();
    }
    return shuttingDown;
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  worker.on("closed", () => clearInterval(heartbeatTimer));
  console.info("[seo-worker] Ready; daily schedule is 03:00 UTC.");
}

export async function queueManualSeoRun() {
  const queue = new Queue(SEO_QUEUE, { connection: queueConnection() });
  try {
    const counts = await queue.getJobCounts("active", "waiting", "delayed");
    if (counts["active"] || counts["waiting"] || counts["delayed"])
      throw new Error("An SEO automation run is already queued or active.");
    const nextUtcDay = new Date();
    nextUtcDay.setUTCHours(24, 0, 0, 0);
    const dailyToken = `rg:seo:manual:${new Date().toISOString().slice(0, 10)}`;
    const admitted = await queueRedis().set(
      dailyToken,
      "queued",
      "PX",
      Math.max(1000, nextUtcDay.getTime() - Date.now()),
      "NX",
    );
    if (!admitted) throw new Error("A manual SEO run has already been queued today.");
    try {
      await queue.add("manual-seo-run", {}, seoJobOptions);
    } catch (error) {
      await queueRedis().del(dailyToken);
      throw error;
    }
  } finally {
    await queue.close();
  }
}

const osmCategoryFilters = {
  all: [
    ["amenity", ".+"],
    ["shop", ".+"],
    ["office", ".+"],
    ["tourism", ".+"],
    ["craft", ".+"],
  ],
  dentists: [["amenity", "dentist"]],
  doctors: [["amenity", "doctors|clinic|hospital"]],
  hotels: [["tourism", "hotel|guest_house|hostel|motel"]],
  lawyers: [["office", "lawyer"]],
  real_estate: [["office", "estate_agent"]],
  home_services: [["craft", "plumber|electrician|hvac|painter|carpenter"]],
  restaurants: [["amenity", "restaurant|cafe|fast_food"]],
  retail: [["shop", ".+"]],
} as const;

export type OSMLeadCategory = keyof typeof osmCategoryFilters;

export function buildOsmQuery(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  category: OSMLeadCategory;
}) {
  const filters = osmCategoryFilters[input.category];
  const clauses = filters
    .map(
      ([key, value]) =>
        `nwr(around:${input.radiusMeters},${input.latitude},${input.longitude})[name][${key}~"${value}"];`,
    )
    .join("\n");
  return `[out:json][timeout:15];(${clauses});out center tags 50;`;
}

export async function searchAndSaveOsmLeads(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  category: OSMLeadCategory;
  actorId: string;
}) {
  const redis = queueRedis();
  const admitted = await redis.set(`rg:seo:osm-search:${input.actorId}`, "1", "PX", 15_000, "NX");
  if (!admitted) throw new Error("Please wait before starting another OpenStreetMap search.");

  const query = buildOsmQuery(input);
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "RatingGuard-SEOGrowth/1.0 (+https://ratingguard.online/)",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap Overpass returned HTTP ${response.status}.`);
  const responseText = await readTextBounded(response, 2_000_000);
  const payload = z
    .object({
      elements: z.array(
        z.object({
          type: z.enum(["node", "way", "relation"]),
          id: z.number().int().positive(),
          lat: z.number().optional(),
          lon: z.number().optional(),
          center: z.object({ lat: z.number(), lon: z.number() }).optional(),
          tags: z.record(z.string(), z.string()),
        }),
      ),
    })
    .parse(JSON.parse(responseText));

  const rows = payload.elements
    .filter((element) => element.tags["name"]?.trim())
    .slice(0, 50)
    .map((element) => {
      const tags = element.tags;
      const location = element.center ?? {
        lat: element.lat ?? input.latitude,
        lon: element.lon ?? input.longitude,
      };
      const address = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
        tags["addr:postcode"],
      ]
        .filter(Boolean)
        .join(" ");
      const categoryTag = ["amenity", "shop", "office", "tourism", "craft"]
        .map((key) => (tags[key] ? `${key}:${tags[key]}` : null))
        .find(Boolean);
      return {
        source: "openstreetmap" as const,
        source_id: `${element.type}/${element.id}`,
        business_name: tags["name"]!.slice(0, 240),
        rating: null,
        review_count: null,
        category: categoryTag ?? input.category,
        address: address.slice(0, 500) || `OpenStreetMap map point ${location.lat},${location.lon}`,
        website_url: tags["website"]?.startsWith("https://") ? tags["website"].slice(0, 500) : null,
      };
    });
  let saved = 0;
  if (rows.length) {
    const inserted = await supabaseAdmin
      .from("seo_leads")
      .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
      .select("source_id")
      .throwOnError();
    saved = inserted.data.length;
  }
  return {
    found: payload.elements.length,
    saved,
    leads: rows,
    note: "OpenStreetMap does not provide verified business ratings or review counts; those fields remain empty.",
  };
}

export async function readSeoWorkerHealth() {
  const queue = new Queue(SEO_QUEUE, { connection: queueConnection() });
  try {
    const [client, counts] = await Promise.all([
      queue.client,
      queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
    ]);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [health, ollama, lastRun, runsToday] = await Promise.all([
      client.get("rg:health:seo-worker"),
      (async (): Promise<"connected" | "model_missing" | "not_connected"> => {
        try {
          const response = await fetch(`${localOllamaUrl()}/api/tags`, {
            signal: AbortSignal.timeout(1_000),
          });
          if (!response.ok) return "not_connected";
          const tags = z
            .object({ models: z.array(z.object({ name: z.string() })) })
            .parse(await response.json());
          const configuredModel = configuredOllamaModel();
          return tags.models.some((model) => model.name === configuredModel)
            ? "connected"
            : "model_missing";
        } catch {
          return "not_connected";
        }
      })(),
      supabaseAdmin
        .from("seo_worker_runs")
        .select("id,status,started_at,finished_at,tasks_completed,audit_pages,issue_count,error")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .throwOnError(),
      supabaseAdmin
        .from("seo_worker_runs")
        .select("tasks_completed")
        .gte("started_at", startOfDay.toISOString())
        .limit(1000)
        .throwOnError(),
    ]);
    const parsedHealth = health
      ? (JSON.parse(health) as { state: string; checked_at: string })
      : null;
    const heartbeatFresh =
      parsedHealth !== null && Date.now() - Date.parse(parsedHealth.checked_at) <= 90_000;
    return {
      worker: heartbeatFresh ? parsedHealth.state : "not_running",
      heartbeat_at: parsedHealth?.checked_at ?? null,
      schedule: "03:00 UTC daily",
      queue: counts,
      ollama,
      ollama_model: configuredOllamaModel(),
      connectors: {
        search_console: "not_configured",
        ga4: "not_configured",
        matomo: "not_configured",
        openstreetmap: "available_free",
        google_places: "disabled",
      },
      last_run: lastRun.data,
      tasks_completed_today: runsToday.data.reduce((total, run) => total + run.tasks_completed, 0),
    };
  } finally {
    await queue.close();
  }
}
