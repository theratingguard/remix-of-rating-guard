export type LeadIndustry = { name: string; slug: string };
export type LeadCountry = { name: string; code: string; currency: string; slug: string };

export const industries: LeadIndustry[];
export const countries: LeadCountry[];
export function programmaticSeoPaths(): {
  review: string[];
  agency: string[];
  partners: string[];
};
export function programmaticSeoAlternates(kind: "partners"): Array<{
  hrefLang: string;
  path: string;
}>;
export function programmaticSeoAlternates(
  kind: "review" | "agency",
  industrySlug: string,
): Array<{ hrefLang: string; path: string }>;
