import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 400;
const DEFAULT_SEED = "review removal";
const MODIFIERS = [
  "remove",
  "delete",
  "fix",
  "buy",
  "manage",
  "monitor",
  "report",
  "dispute",
  "assess",
  "improve",
  "analyze",
  "protect",
  "check",
  "appeal",
  "handle",
  "respond to",
  "recover from",
];
const INDUSTRIES = [
  "hotel",
  "restaurant",
  "doctor",
  "dentist",
  "law firm",
  "real estate agency",
  "automotive business",
  "home service company",
  "retail store",
  "salon",
  "fitness studio",
  "local business",
  "medical practice",
  "cafe",
  "travel agency",
];
const COUNTRIES = [
  { country: "United States", locale: "en-US" },
  { country: "United Kingdom", locale: "en-GB" },
  { country: "Spain", locale: "es-ES" },
  { country: "France", locale: "fr-FR" },
  { country: "Germany", locale: "de-DE" },
  { country: "United Arab Emirates", locale: "ar-AE" },
  { country: "India", locale: "hi-IN" },
  { country: "Japan", locale: "ja-JP" },
  { country: "Brazil", locale: "pt-BR" },
  { country: "Canada", locale: "en-CA" },
  { country: "Australia", locale: "en-AU" },
  { country: "Italy", locale: "it-IT" },
  { country: "Netherlands", locale: "nl-NL" },
  { country: "South Korea", locale: "ko-KR" },
  { country: "China", locale: "zh-CN" },
  { country: "Turkey", locale: "tr-TR" },
  { country: "Indonesia", locale: "id-ID" },
  { country: "Sweden", locale: "sv-SE" },
  { country: "Poland", locale: "pl-PL" },
  { country: "Singapore", locale: "en-SG" },
];
const ROW_LIMIT = 10_000;

function stableSlug(country, keyword) {
  const base = `${country} ${keyword}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 130);
  const hash = createHash("sha256").update(`${country}:${keyword}`).digest("hex").slice(0, 10);
  return `${base || "seo-keyword"}-${hash}`;
}

function inferIntent(keyword) {
  if (/\b(buy|hire|pricing|price|cost|service|agency)\b/i.test(keyword))
    return "transactional";
  if (/\b(best|compare|top|reviews|vs)\b/i.test(keyword)) return "commercial";
  if (/\b(login|website|official)\b/i.test(keyword)) return "navigational";
  return "informational";
}

function keywordRecord(keyword, country, locale) {
  const cleanKeyword = keyword.trim().replace(/\s+/g, " ").slice(0, 240);
  return {
    keyword: cleanKeyword,
    country,
    search_volume: null,
    difficulty: null,
    cpc: null,
    intent: inferIntent(cleanKeyword),
    locale,
    slug: stableSlug(country, cleanKeyword),
    location: country,
    service: "Google review management",
    industry: "",
    source: "template",
    related_keywords: [],
    entities: [],
    title: `${cleanKeyword} | Rating Guard`.slice(0, 180),
    description:
      `Learn about ${cleanKeyword} with evidence-led guidance for responsible review management.`.slice(
        0,
        160,
      ),
    hashtags: [],
    status: "pending",
    page_content: null,
  };
}

function buildCandidates(seed) {
  const candidates = new Map();
  for (const { country, locale } of COUNTRIES) {
    const countryStart = candidates.size;
    countryPhrases: for (const modifier of MODIFIERS) {
      for (const industry of INDUSTRIES) {
        const phrases = [
          `${modifier} ${seed} for ${industry} in ${country}`,
          `how can a ${industry} ${modifier} ${seed} in ${country}`,
          `best way to ${modifier} ${seed} for ${industry} in ${country}`,
          `${modifier} Google reviews for ${industry} in ${country}`,
        ];
        for (const phrase of phrases) {
          const normalized = phrase.trim().replace(/\s+/g, " ").toLowerCase();
          if (!candidates.has(normalized))
            candidates.set(normalized, keywordRecord(normalized, country, locale));
          if (candidates.size - countryStart >= ROW_LIMIT / COUNTRIES.length)
            break countryPhrases;
        }
      }
    }
  }
  if (candidates.size < 5_000)
    throw new Error(`Created ${candidates.size} keywords; the minimum is 5,000.`);
  return [...candidates.values()];
}

async function saveCandidates(client, candidates) {
  let inserted = 0;
  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE);
    const { data, error } = await client
      .from("seo_keywords")
      .upsert(batch, { onConflict: "locale,keyword", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Could not save keyword batch: ${error.message}`);
    inserted += data.length;
    console.info(
      `[seo-keywords] Processed ${Math.min(offset + batch.length, candidates.length)} / ${candidates.length}.`,
    );
  }
  return inserted;
}

async function main() {
  const seed = process.argv[2]?.trim() || DEFAULT_SEED;
  if (seed.length < 3 || seed.length > 180) throw new Error("Seed must be 3 to 180 characters.");
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey)
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const candidates = buildCandidates(seed);
  const inserted = await saveCandidates(client, candidates);
  console.info(
    `[seo-keywords] Created ${candidates.length} pending keyword candidates for "${seed}"; inserted ${inserted} new rows. No pages were published.`,
  );
}

main().catch((error) => {
  console.error(
    "[seo-keywords] Generation failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
