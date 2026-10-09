import { supabase } from "@/integrations/supabase/client";

export type FaqItem = { q: string; a: string; visible: boolean };
export type FooterLink = { label: string; href: string };
export type SiteContent = {
  announcement: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  trustStatement: string;
  sections: { problem: boolean; responsible: boolean; how: boolean; ai: boolean; reply: boolean; reporting: boolean; security: boolean; faq: boolean };
  steps: { title: string; body: string }[];
  faq: FaqItem[];
  footerTagline: string;
  contactEmail: string;
  footerLinks: FooterLink[];
  socialLinks: FooterLink[];
  seoTitle: string;
  seoDescription: string;
};

export const DEFAULT_CONTENT: SiteContent = {
  announcement: "",
  heroTitle: "Understand Your Google Reviews. Protect Your Reputation.",
  heroSubtitle: "Identify potentially policy-relevant reviews, understand why they need attention, and take evidence-based action aligned with Google's policies.",
  ctaPrimary: "Get Started",
  ctaSecondary: "How It Works",
  trustStatement: "We don't use fake reviews, manipulation, spam networks, or risky shortcuts. Our approach is based on evidence, Google policies, and responsible review management.",
  sections: { problem: true, responsible: true, how: true, ai: true, reply: true, reporting: true, security: true, faq: true },
  steps: [
    { title: "Connect Your Business Data", body: "Paste a Google Maps or business link. We confirm the exact business before anything else." },
    { title: "Retrieve Available Review Data", body: "We pull the rating and the reviews Google makes available through its official API." },
    { title: "Analyze Reviews", body: "Each available review is checked for context, tone and potential policy signals." },
    { title: "Understand Risk & Evidence", body: "Every finding shows its reason, the exact evidence and a confidence level." },
    { title: "Take Policy-Aligned Action", body: "Reply professionally, or use Google's official reporting path when it's appropriate." },
  ],
  faq: [
    { q: "What does the platform analyze?", a: "The Google rating and the reviews Google makes available for a business through its official API. Each review is checked for potential policy-relevant signals.", visible: true },
    { q: "Does it remove Google reviews automatically?", a: "No. Nothing is removed or reported automatically. Only Google can decide whether a review is removed.", visible: true },
    { q: "Is every negative review considered a violation?", a: "No. A negative review can be completely legitimate. Rating and policy risk are treated as separate things.", visible: true },
    { q: "How does review risk analysis work?", a: "AI reads each available review and looks for signals such as spam, off-topic content, conflicts of interest or personal information. High-risk findings are double-checked by a second model.", visible: true },
    { q: "Can I see the evidence behind a finding?", a: "Yes. Every finding includes the reason, the exact text that triggered it and a confidence score.", visible: true },
    { q: "Can AI suggest replies?", a: "Yes. You can choose a tone and get an editable reply draft. Replies are never posted automatically.", visible: true },
    { q: "Can I generate a client report?", a: "Yes. Every completed scan produces a professional report you can download.", visible: true },
    { q: "Can I send the report to my client?", a: "Yes, when you choose. Reports are never sent automatically.", visible: true },
    { q: "Does this guarantee Google will remove a review?", a: "No. Google makes the final policy and removal decision. We help you understand the evidence and use the official path.", visible: true },
    { q: "What happens if Google data is unavailable?", a: "You see the exact reason. We never show invented reviews, ratings or results.", visible: true },
  ],
  footerTagline: "Google review intelligence and policy-aligned risk analysis.",
  contactEmail: "theratingguard@gmail.com",
  footerLinks: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Responsible Use", href: "/responsible-use" },
    { label: "Contact", href: "/contact" },
  ],
  socialLinks: [],
  seoTitle: "The Rating Guard — Google Review Intelligence & Risk Analysis",
  seoDescription: "Understand your Google reviews, see the evidence behind potentially policy-relevant content, and take responsible, policy-aligned action.",
};

export const mergeContent = (c: unknown): SiteContent => {
  const o = (c && typeof c === "object" ? c : {}) as Partial<SiteContent>;
  return { ...DEFAULT_CONTENT, ...o, sections: { ...DEFAULT_CONTENT.sections, ...(o.sections ?? {}) } };
};

export async function loadSiteContent(mode: "published" | "draft" = "published") {
  const { data } = await supabase.from("site_content").select("published, draft, published_at").eq("id", "home").maybeSingle();
  return { content: mergeContent(mode === "draft" ? (data?.draft && Object.keys(data.draft as object).length ? data.draft : data?.published) : data?.published), publishedAt: data?.published_at ?? null };
}
