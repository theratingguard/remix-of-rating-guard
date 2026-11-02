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
  return COUNTRY_TERMS.map((term) => `${term} in ${country}`);
}
