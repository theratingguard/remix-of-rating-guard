export type LeadIndustry = { name: string; slug: string };
export type LeadCountry = { name: string; code: string; currency: string; slug: string };

export const industries: LeadIndustry[];
export const countries: LeadCountry[];
export function programmaticSeoPaths(): {
  review: string[];
  agency: string[];
  partners: string[];
};
