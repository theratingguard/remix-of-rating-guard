import {
  countries,
  industries,
  programmaticSeoAlternates,
  type LeadCountry,
  type LeadIndustry,
} from "./lead-catalog.js";
import { SEOHead, type SeoFaq, type SeoSection } from "./seo-head";

export type IndustryCountryPageData = {
  industry: LeadIndustry;
  country: LeadCountry;
};

export type CountryPageData = { country: LeadCountry };

const reviewFaqs: SeoFaq[] = [
  {
    question: "Can Rating Guard guarantee that a Google review will be removed?",
    answer:
      "No. Google independently reviews reports and makes every decision under its own policies. Rating Guard cannot guarantee removal, a rating change, or a particular outcome.",
  },
  {
    question: "Is a negative review enough to report it?",
    answer:
      "No. A low rating or disagreement with a customer's opinion is not by itself a policy violation. Reports should be based on specific, accurate evidence that relates to Google's published policies.",
  },
  {
    question: "What information should a business prepare?",
    answer:
      "Keep the review URL, relevant dates, and concise factual context. Share only information you are authorized to disclose, and avoid submitting unnecessary personal or sensitive data.",
  },
];

const agencyFaqs: SeoFaq[] = [
  {
    question: "Can I promise clients that their reviews will be removed?",
    answer:
      "No. Google makes its own decisions. Agency materials should describe assessment and reporting support without promising removals, rating increases, or a specific result.",
  },
  {
    question: "Does starting an agency guarantee earnings?",
    answer:
      "No. Revenue depends on your business, customers, costs, and applicable program terms. Rating Guard does not guarantee income or client acquisition.",
  },
  {
    question: "How do I confirm partner availability in my country?",
    answer:
      "Submit an application or contact Rating Guard to confirm current eligibility, payment options, and terms for your region. Applications are subject to approval.",
  },
];

const partnerFaqs: SeoFaq[] = [
  {
    question: "Is the reseller program available in every country?",
    answer:
      "Availability, payment methods, and eligibility can vary by region. Contact Rating Guard to confirm current terms for your country before making business commitments.",
  },
  {
    question: "Does approval guarantee commission or income?",
    answer:
      "No. Any commissions are governed by current program terms and eligible transactions. Earnings are not guaranteed.",
  },
  {
    question: "Can a partner guarantee a Google review removal?",
    answer:
      "No. Google independently determines whether content violates its policies. Partners must not promise removals or other outcomes.",
  },
];

const section = (heading: string, body: string): SeoSection => ({ heading, body });

export function getIndustry(slug: string) {
  return industries.find((industry) => industry.slug === slug);
}

export function getCountry(slug: string) {
  const identifier = slug.toLowerCase();
  return countries.find((country) => country.slug === identifier || country.code === identifier);
}

export function getIndustryCountryPage(industrySlug: string, countrySlug: string) {
  const industry = getIndustry(industrySlug);
  const country = getCountry(countrySlug);
  return industry && country ? { industry, country } : null;
}

export function industryReviewPath(industry: string, country: string) {
  return `/remove-google-review/${encodeURIComponent(industry)}/${encodeURIComponent(country)}`;
}

export function agencyPath(industry: string, country: string) {
  return `/start-${encodeURIComponent(industry)}-agency/${encodeURIComponent(country)}`;
}

export function partnerPath(country: string) {
  return `/partners/${encodeURIComponent(country)}`;
}

function regionalAlternates(kind: "review" | "agency" | "partners", industrySlug?: string) {
  return programmaticSeoAlternates(kind, industrySlug).map(({ hrefLang, path }) => ({
    hrefLang,
    path,
  }));
}

export function industryReviewHead({ industry, country }: IndustryCountryPageData) {
  const title = `Google Review Policy Assessment for ${industry.name} in ${country.name} | Rating Guard`;
  const description = `A practical guide for ${industry.name.toLowerCase()} businesses in ${country.name} to assess review-policy concerns, organize evidence, and understand reporting options. No removal is guaranteed.`;
  return SEOHead(
    {
      title,
      description,
      keyword: `Google review policy ${industry.name.toLowerCase()} ${country.name}`,
      related_keywords: [
        `${industry.name.toLowerCase()} review assessment`,
        `Google review reporting ${country.name}`,
      ],
      content: {
        intro: `Businesses in ${industry.name.toLowerCase()} can use a consistent, evidence-led process when a Google review may violate a platform policy. This guide is for businesses operating in ${country.name}. It focuses on documenting facts and understanding reporting options—not removing criticism simply because it is unfavorable. Google reviews each report and makes the final decision.`,
        sections: [
          section(
            "Document the review and its context",
            `Save the public review URL and note when it appeared. Describe the relevant interaction using information your business is authorized to share. For ${industry.name.toLowerCase()} businesses, keep operational records that help explain the context, but do not publish customer or employee personal information unnecessarily.`,
          ),
          section(
            "Assess policy fit rather than sentiment",
            "Separate a negative opinion or service complaint from conduct that may fall under a specific platform policy. Identify the policy concern, the facts that support it, and any uncertainty. Do not treat disagreement, a low star rating, or a competitor suspicion as proof of a violation.",
          ),
          section(
            "Prepare a concise, factual report",
            `If the available evidence supports a policy concern, organize the review URL, relevant dates, and a short explanation before using Google's reporting tools. Keep statements accurate and proportionate, and avoid repeated or coordinated reports that do not add new evidence.`,
          ),
          section(
            "Track the outcome and choose a next step",
            "Google controls the review process and may decide that content does not violate its policies. Keep a record of the response, use available appeal options where appropriate, and address legitimate customer feedback through normal service and support channels.",
          ),
        ],
        faqs: reviewFaqs,
      },
    },
    [],
    {
      canonicalPath: industryReviewPath(industry.slug, country.slug),
      alternatePaths: regionalAlternates("review", industry.slug),
      breadcrumbs: [
        { name: "Home", url: "https://ratingguard.online/" },
        {
          name: `${industry.name} in ${country.name}`,
          url: `https://ratingguard.online${industryReviewPath(industry.slug, country.slug)}`,
        },
      ],
    },
  );
}

export function agencyHead({ industry, country }: IndustryCountryPageData) {
  const title = `Start a ${industry.name} Reputation Agency in ${country.name} | Rating Guard`;
  const description = `Explore the practical and compliance considerations for starting a reputation services agency serving ${industry.name.toLowerCase()} businesses in ${country.name}. Program approval and terms apply.`;
  return SEOHead(
    {
      title,
      description,
      keyword: `start ${industry.name.toLowerCase()} reputation agency ${country.name}`,
      related_keywords: [
        `${industry.name.toLowerCase()} agency partner program`,
        `review management reseller ${country.name}`,
      ],
      content: {
        intro: `Considering a reputation-services agency for ${industry.name.toLowerCase()} businesses in ${country.name}? Start with a clear, evidence-led service that helps clients understand review policies and organize their documentation. Rating Guard's reseller program requires approval; availability and terms should be confirmed for your region.`,
        sections: [
          section(
            "Define a responsible service",
            `Set clear boundaries for serving ${industry.name.toLowerCase()} clients: explain policy assessment and documentation support, protect client information, and distinguish your professional services from Google's independent moderation decisions.`,
          ),
          section(
            "Build a client intake and evidence process",
            "Collect only the information needed to assess a concern. Verify that clients are authorized to provide it, retain records securely, and make clear that an assessment is not a guarantee of removal or a substitute for legal advice.",
          ),
          section(
            "Review program terms before launch",
            "Confirm current eligibility, payment requirements, commission rules, branding permissions, and support arrangements directly with Rating Guard. Applications require approval, and terms may change.",
          ),
          section(
            "Set honest expectations with customers",
            "Describe what your agency can control—careful review, accurate documentation, and communication—and what it cannot control. Do not promise review removal, rating increases, customer acquisition, or a particular level of income.",
          ),
        ],
        faqs: agencyFaqs,
      },
    },
    [],
    {
      canonicalPath: agencyPath(industry.slug, country.slug),
      alternatePaths: regionalAlternates("agency", industry.slug),
      breadcrumbs: [
        { name: "Home", url: "https://ratingguard.online/" },
        {
          name: `Agency in ${country.name}`,
          url: `https://ratingguard.online${agencyPath(industry.slug, country.slug)}`,
        },
      ],
    },
  );
}

export function partnerHead({ country }: CountryPageData) {
  const title = `Rating Guard Partners in ${country.name} | Reseller Program`;
  const description = `Review the Rating Guard reseller program for ${country.name}. Confirm regional availability, application requirements, and current terms before applying.`;
  return SEOHead(
    {
      title,
      description,
      keyword: `review management partner ${country.name}`,
      related_keywords: [`reseller program ${country.name}`, "review policy assessment partner"],
      content: {
        intro: `The Rating Guard partner program supports approved resellers offering evidence-led review assessment workflows. If you are based in ${country.name}, confirm current availability, payment options, and program terms before applying. Google independently decides whether reported content violates its policies.`,
        sections: [
          section(
            "What the partner program supports",
            "Approved partners can use the reseller workspace to organize assigned businesses, team members, referrals, and eligible commission activity under the terms of their active plan.",
          ),
          section(
            "Confirm regional eligibility",
            `Program availability and payment methods may vary in ${country.name}. Contact Rating Guard to verify current application requirements and terms; a public information page does not itself establish eligibility or approval.`,
          ),
          section(
            "Set accurate client expectations",
            "Partners may help clients assess potential policy concerns and organize evidence. They cannot guarantee that Google will remove a review, change a rating, or reach any specific outcome.",
          ),
          section(
            "Apply only after reviewing the terms",
            "Applications are subject to approval and any required membership payment. Review current commission rules carefully; earnings depend on eligible transactions and are not guaranteed.",
          ),
        ],
        faqs: partnerFaqs,
      },
    },
    [],
    {
      canonicalPath: partnerPath(country.slug),
      alternatePaths: regionalAlternates("partners"),
      breadcrumbs: [
        { name: "Home", url: "https://ratingguard.online/" },
        {
          name: `Partners in ${country.name}`,
          url: `https://ratingguard.online${partnerPath(country.slug)}`,
        },
      ],
    },
  );
}

export function getAgencyPage(industrySlug: string, countrySlug: string) {
  return getIndustryCountryPage(industrySlug, countrySlug);
}
