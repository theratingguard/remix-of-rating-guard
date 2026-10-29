import { supabase } from "@/integrations/supabase/client";
import { SEO_LOCALES } from "./locales";

const SUPPORTED_COUNTRY_CODES = new Set(
  SEO_LOCALES.map((locale) => locale.code.split("-")[1] ?? ""),
);
const MAX_HASHTAGS = 100;

export async function loadCountryHashtags(countryCode: string): Promise<string[]> {
  const normalizedCode = countryCode.toUpperCase();
  if (!SUPPORTED_COUNTRY_CODES.has(normalizedCode)) return [];

  const { data, error } = await supabase
    .from("country_hashtags")
    .select("hashtag")
    .eq("country_code", normalizedCode)
    .order("hashtag")
    .limit(MAX_HASHTAGS);
  if (error) throw new Error(`Could not load country hashtags: ${error.message}`);

  const hashtags = (data ?? [])
    .map((row) => row.hashtag)
    .filter((hashtag) => /^#[A-Za-z][A-Za-z0-9]{1,31}$/.test(hashtag));
  return [...new Set(hashtags)].slice(0, MAX_HASHTAGS);
}
