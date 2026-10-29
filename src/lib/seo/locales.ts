export const SEO_LOCALES = [
  { code: "en-US", language: "en", country: "United States" },
  { code: "en-GB", language: "en", country: "United Kingdom" },
  { code: "es-ES", language: "es", country: "Spain" },
  { code: "fr-FR", language: "fr", country: "France" },
  { code: "de-DE", language: "de", country: "Germany" },
  { code: "ar-AE", language: "ar", country: "United Arab Emirates" },
  { code: "hi-IN", language: "hi", country: "India" },
  { code: "ja-JP", language: "ja", country: "Japan" },
  { code: "pt-BR", language: "pt", country: "Brazil" },
  { code: "en-CA", language: "en", country: "Canada" },
  { code: "en-AU", language: "en", country: "Australia" },
  { code: "it-IT", language: "it", country: "Italy" },
  { code: "nl-NL", language: "nl", country: "Netherlands" },
  { code: "ko-KR", language: "ko", country: "South Korea" },
  { code: "zh-CN", language: "zh", country: "China" },
  { code: "tr-TR", language: "tr", country: "Turkey" },
  { code: "id-ID", language: "id", country: "Indonesia" },
  { code: "sv-SE", language: "sv", country: "Sweden" },
  { code: "pl-PL", language: "pl", country: "Poland" },
  { code: "en-SG", language: "en", country: "Singapore" },
] as const;

export type SeoLocale = (typeof SEO_LOCALES)[number]["code"];

const LANGUAGE_DEFAULTS: Record<string, SeoLocale> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  ar: "ar-AE",
  hi: "hi-IN",
  ja: "ja-JP",
  pt: "pt-BR",
  it: "it-IT",
  nl: "nl-NL",
  ko: "ko-KR",
  zh: "zh-CN",
  tr: "tr-TR",
  id: "id-ID",
  sv: "sv-SE",
  pl: "pl-PL",
};

export function isSeoLocale(value: string): value is SeoLocale {
  return SEO_LOCALES.some((locale) => locale.code === value);
}

export function resolveSeoLocale(value: string): SeoLocale | null {
  if (isSeoLocale(value)) return value;
  return LANGUAGE_DEFAULTS[value] ?? null;
}
