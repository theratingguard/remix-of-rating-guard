import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { SEO_KEYWORD_COUNTRIES, SEO_KEYWORD_PROVIDERS } from "@/lib/seo/keyword-options";

const keywordInputSchema = z.object({
  keyword: z.string().trim().min(3).max(240),
  country: z.string().trim().min(2).max(100).default("United States"),
  search_volume: z.number().int().min(0).nullable().default(null),
  difficulty: z.number().min(0).max(100).nullable().default(null),
  cpc: z.number().min(0).nullable().default(null),
  intent: z
    .enum(["informational", "navigational", "commercial", "transactional"])
    .default("informational"),
});

export type SeoKeywordInput = z.infer<typeof keywordInputSchema>;

function getEncryptionKey() {
  const rawKey = process.env["SEO_API_KEYS_ENCRYPTION_KEY"];
  if (!rawKey || !/^[a-f\d]{64}$/i.test(rawKey))
    throw new Error("Set SEO_API_KEYS_ENCRYPTION_KEY to a 32-byte hexadecimal secret.");
  return Buffer.from(rawKey, "hex");
}

function encryptApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag().toString("base64url");
  return `v1:${iv.toString("base64url")}:${tag}:${ciphertext.toString("base64url")}`;
}

function slugify(value: string) {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 130);
  const suffix = createHash("sha256").update(value).digest("hex").slice(0, 10);
  return `${base || "seo-keyword"}-${suffix}`;
}

function localeForCountry(country: string) {
  return (
    SEO_KEYWORD_COUNTRIES.find(
      (item) => item.country.toLowerCase() === country.trim().toLowerCase(),
    )?.locale ?? "en-US"
  );
}

function makeKeywordRecord(input: SeoKeywordInput) {
  const keyword = input.keyword.replace(/\s+/g, " ");
  const title = `${keyword} | Rating Guard`.slice(0, 180);
  const description =
    `Learn about ${keyword} with evidence-led guidance for responsible review management.`.slice(
      0,
      160,
    );
  return {
    keyword,
    country: input.country,
    search_volume: input.search_volume,
    difficulty: input.difficulty,
    cpc: input.cpc,
    intent: input.intent,
    locale: localeForCountry(input.country),
    slug: slugify(`${input.country}:${keyword}`),
    location: input.country,
    service: "Google review management",
    industry: "",
    source: "template" as const,
    related_keywords: [] as string[],
    entities: [],
    title,
    description,
    hashtags: [] as string[],
    status: "pending" as const,
    page_content: null,
  };
}

export function normalizeSeoKeywordRows(rows: unknown[]) {
  if (rows.length === 0 || rows.length > 500)
    throw new Error("Import 1 to 500 keyword rows per request.");
  return rows.map((row) => keywordInputSchema.parse(row));
}

export function encryptSeoProviderKey(provider: string, value: string) {
  const parsedProvider = z.enum(SEO_KEYWORD_PROVIDERS).parse(provider);
  const apiKey = z.string().trim().min(8).max(2048).parse(value);
  return { provider: parsedProvider, api_key: encryptApiKey(apiKey) };
}

export function seoKeywordRecord(input: unknown) {
  return makeKeywordRecord(keywordInputSchema.parse(input));
}

export type KeywordDb = Database["public"]["Tables"]["seo_keywords"]["Row"];
