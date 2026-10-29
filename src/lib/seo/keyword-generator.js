import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const KEYWORD_LIMIT = 10_500;
const MAX_SUGGESTIONS = 500;
const BATCH_SIZE = 400;
const REQUEST_TIMEOUT_MS = 6_000;
const SERVICES = [
  "Google review management",
  "Google review monitoring",
  "Google review analysis",
  "Google review reporting",
  "online reputation management",
  "review response management",
  "business review monitoring",
  "Google Business Profile reviews",
  "review risk analysis",
  "review policy assessment",
  "customer feedback management",
  "local reputation management",
  "review analytics",
];
const ACTIONS = [
  "manage",
  "monitor",
  "analyze",
  "report",
  "audit",
  "protect",
  "improve",
  "respond to",
  "review",
  "track",
];
const INDUSTRIES = [
  "hotels",
  "restaurants",
  "dental clinics",
  "medical practices",
  "law firms",
  "real estate agencies",
  "automotive businesses",
  "home service companies",
  "retail stores",
  "salons and spas",
  "fitness studios",
  "local businesses",
];
const LOCATIONS = [
  "London", "Manchester", "Birmingham", "Edinburgh", "New York", "Los Angeles", "Chicago",
  "Houston", "Miami", "Seattle", "Toronto", "Vancouver", "Montreal", "Sydney", "Melbourne",
  "Brisbane", "Auckland", "Singapore", "Dubai", "Abu Dhabi", "Mumbai", "Delhi", "Bengaluru",
  "Chennai", "Madrid", "Barcelona", "Mexico City", "São Paulo", "Rio de Janeiro", "Paris",
  "Lyon", "Berlin", "Munich", "Hamburg", "Rome", "Milan", "Amsterdam", "Rotterdam",
  "Tokyo", "Osaka", "Seoul", "Istanbul", "Jakarta", "Stockholm", "Warsaw", "Dublin",
  "Glasgow", "Leeds", "Liverpool", "Bristol", "Oxford", "Cambridge", "San Francisco",
  "Boston", "Atlanta", "Dallas", "Phoenix", "Denver", "San Diego", "Ottawa", "Calgary",
  "Perth", "Adelaide", "Wellington", "Hong Kong", "Hyderabad", "Pune", "Kolkata", "Jaipur",
  "Valencia", "Seville", "Lisbon", "Porto", "Brussels", "Zurich", "Vienna", "Copenhagen",
  "Oslo", "Helsinki", "Kraków", "Antalya", "Bangkok", "Manila",
];

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 145);
}

function stableSlug(keyword) {
  const base = slugify(keyword) || "review-management";
  const suffix = createHash("sha256").update(keyword).digest("hex").slice(0, 10);
  return `${base}-${suffix}`;
}

async function fetchJson(url, userAgent) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
  return response.json();
}

async function fetchSuggestions(query) {
  const url = new URL("https://suggestqueries.google.com/complete/search");
  url.searchParams.set("client", "firefox");
  url.searchParams.set("q", query);
  try {
    const result = await fetchJson(url, "RatingGuardKeywordResearch/1.0");
    return Array.isArray(result?.[1])
      ? result[1].filter((item) => typeof item === "string").slice(0, 10)
      : [];
  } catch (error) {
    console.warn(`[seo-keywords] Suggest query skipped (${query}): ${error.message}`);
    return [];
  }
}

async function fetchWikipediaEntity(query) {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("srlimit", "1");
  searchUrl.searchParams.set("format", "json");
  try {
    const search = await fetchJson(searchUrl, "RatingGuardKeywordResearch/1.0 (SEO research)");
    const title = search?.query?.search?.[0]?.title;
    if (typeof title !== "string") return null;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summary = await fetchJson(summaryUrl, "RatingGuardKeywordResearch/1.0 (SEO research)");
    return typeof summary?.extract === "string"
      ? { title: summary.title ?? title, summary: summary.extract.slice(0, 500) }
      : { title: summary.title ?? title, summary: "" };
  } catch (error) {
    console.warn(`[seo-keywords] Wikipedia entity skipped (${query}): ${error.message}`);
    return null;
  }
}

function keywordRecord(keyword, { location = "", service = "", industry = "", source = "template", entities = [] } = {}) {
  const cleanKeyword = keyword.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 240);
  const serviceName = service || "Google review management";
  const title = `${cleanKeyword.slice(0, 155)} | Rating Guard`.slice(0, 180);
  const description =
    `Learn how to ${cleanKeyword} with evidence-led policy guidance and tools for responsible review management.`
      .slice(0, 160);
  const hashtags = [
    "#GoogleReviews",
    "#ReviewManagement",
    "#OnlineReputation",
    ...(location ? [`#${slugify(location).replaceAll("-", "")}`] : []),
  ];
  return {
    keyword: cleanKeyword,
    locale: "en-US",
    slug: stableSlug(cleanKeyword),
    location,
    service: serviceName,
    industry,
    source,
    related_keywords: [],
    entities,
    title,
    description,
    hashtags,
    status: "draft",
    page_content: null,
  };
}

async function buildCandidates() {
  const entityRows = await Promise.all(
    INDUSTRIES.map(async (industry) => [industry, await fetchWikipediaEntity(industry)]),
  );
  const entities = new Map(entityRows.filter(([, entity]) => entity).map(([industry, entity]) => [industry, [entity]]));
  const templateKeywords = new Map();
  const actionRows = [];
  const industryRows = [];

  for (const location of LOCATIONS) {
    for (const service of SERVICES) {
      for (const action of ACTIONS) {
        const keyword = `${action} ${service} in ${location}`;
        actionRows.push(keywordRecord(keyword, { location, service }));
      }
      for (const industry of INDUSTRIES) {
        const keyword = `${service} for ${industry} in ${location}`;
        industryRows.push(
          keywordRecord(keyword, {
            location,
            service,
            industry,
            entities: entities.get(industry) ?? [],
          }),
        );
      }
    }
  }

  const halfTemplateLimit = (KEYWORD_LIMIT - MAX_SUGGESTIONS) / 2;
  for (const row of [
    ...actionRows.slice(0, halfTemplateLimit),
    ...industryRows.slice(0, halfTemplateLimit),
  ])
    templateKeywords.set(row.keyword, row);

  const suggestSeeds = [
    ...ACTIONS.slice(0, 5).map((action) => `${action} Google reviews`),
    ...SERVICES.slice(0, 8),
    ...INDUSTRIES.slice(0, 8).map((industry) => `review management for ${industry}`),
  ];
  const suggestions = new Set();
  for (let index = 0; index < suggestSeeds.length; index += 5) {
    const batch = suggestSeeds.slice(index, index + 5);
    const results = await Promise.all(batch.map((seed) => fetchSuggestions(seed)));
    for (const result of results) {
      for (const suggestion of result) suggestions.add(suggestion.trim().replace(/\s+/g, " ").toLowerCase());
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const candidates = new Map(templateKeywords);
  for (const suggestion of suggestions) {
    if (
      suggestion.length >= 8 &&
      suggestion.length <= 220 &&
      /\b(review|reputation|google|business)\b/i.test(suggestion)
    ) {
      if (candidates.has(suggestion)) {
        candidates.get(suggestion).source = "template+google_suggest";
      } else if (
        [...candidates.values()].filter((candidate) => candidate.source === "google_suggest").length <
        MAX_SUGGESTIONS
      ) {
        candidates.set(
          suggestion,
          keywordRecord(suggestion, {
            source: "google_suggest",
            service: SERVICES.find((service) => suggestion.includes(service.toLowerCase())) ?? "",
          }),
        );
      }
    }
  }

  const extraRows = [
    ...actionRows.slice(halfTemplateLimit),
    ...industryRows.slice(halfTemplateLimit),
  ];
  for (const row of extraRows) {
    if (candidates.size >= KEYWORD_LIMIT) break;
    if (!candidates.has(row.keyword)) candidates.set(row.keyword, row);
  }
  if (candidates.size < KEYWORD_LIMIT)
    throw new Error(`Generated only ${candidates.size} keywords; expected at least ${KEYWORD_LIMIT}.`);
  const all = [...candidates.values()];
  const relatedGroups = new Map();
  for (const record of all) {
    const keys = [
      record.location && `location:${record.location}`,
      record.industry && `industry:${record.industry}`,
      record.service && `service:${record.service}`,
    ].filter(Boolean);
    for (const key of keys) {
      const group = relatedGroups.get(key) ?? [];
      group.push(record.keyword);
      relatedGroups.set(key, group);
    }
  }
  for (const record of all) {
    const related = new Set();
    for (const key of [
      record.location && `location:${record.location}`,
      record.industry && `industry:${record.industry}`,
      record.service && `service:${record.service}`,
    ].filter(Boolean)) {
      for (const keyword of relatedGroups.get(key) ?? []) {
        if (keyword !== record.keyword) related.add(keyword);
        if (related.size >= 50) break;
      }
      if (related.size >= 50) break;
    }
    record.related_keywords = [...related];
  }
  return all.map((record) => ({
    ...record,
    source:
      record.source === "google_suggest"
        ? record.source
        : suggestions.has(record.keyword)
          ? "template+google_suggest"
          : "template",
    related_keywords: record.related_keywords,
  }));
}

async function main() {
  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey)
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const candidates = await buildCandidates();
  let inserted = 0;
  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE);
    const { data, error } = await supabase
      .from("seo_keywords")
      .upsert(batch, {
        onConflict: "locale,keyword",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(`Could not save SEO keywords: ${error.message}`);
    inserted += data?.length ?? 0;
    console.info(`[seo-keywords] Processed ${Math.min(offset + BATCH_SIZE, candidates.length)} / ${candidates.length}.`);
  }
  console.info(
    `[seo-keywords] Generated ${candidates.length} keyword candidates; inserted ${inserted} new rows as drafts. No pages were published.`,
  );
}

main().catch((error) => {
  console.error("[seo-keywords] Generation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
