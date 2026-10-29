export const SEO_KEYWORD_COUNTRIES = [
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
] as const;

export const SEO_KEYWORD_PROVIDERS = ["semrush", "ahrefs", "dataforseo"] as const;

export type SeoKeywordCountry = (typeof SEO_KEYWORD_COUNTRIES)[number]["country"];
export type SeoKeywordProvider = (typeof SEO_KEYWORD_PROVIDERS)[number];
