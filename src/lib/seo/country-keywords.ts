import { SEO_LOCALES } from "./locales";

const COUNTRY_TERMS = [
  "Google review removal policy help",
  "fake review removal service",
  "online reputation management",
  "Google review policy support",
  "fake Google review reporting guidance",
  "business review dispute assistance",
  "online reputation support",
  "business review monitoring",
  "customer review response strategy",
  "Google review compliance assessment",
] as const;

const COUNTRY_CONTEXTS = [
  "",
  "for small businesses",
  "for hotels",
  "for restaurants",
  "for healthcare practices",
  "for dentists",
  "for law firms",
  "for retail businesses",
  "for real estate agencies",
  "for home service businesses",
] as const;

function countryQueryName(country: string, countryCode: string) {
  if (countryCode === "US") return "USA";
  if (countryCode === "GB") return "UK";
  return country;
}

export function generateCountrySeoKeywords(locale: string): string[] {
  const countryLocale = SEO_LOCALES.find((item) => item.code === locale);
  if (!countryLocale) return [];

  const countryCode = countryLocale.code.split("-")[1] ?? "";
  const country = countryQueryName(countryLocale.country, countryCode);
  const keywords = COUNTRY_TERMS.flatMap((term) =>
    COUNTRY_CONTEXTS.map((context) =>
      context
        ? `${term} ${context} in ${country}`
        : `${term} in ${country}`,
    ),
  );
  const distinctKeywords = [...new Set(keywords)];
  if (distinctKeywords.length !== 100)
    throw new Error(`Expected exactly 100 SEO keywords for ${countryLocale.code}.`);
  return distinctKeywords;
}
