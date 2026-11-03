import type { SeoFaq, SeoSection } from "./seo-head";

export type PillarGuide = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  keywords: string[];
  sections: SeoSection[];
  faqs: SeoFaq[];
};

export const PILLAR_GUIDES: PillarGuide[] = [
  {
    slug: "google-review-policy-assessment",
    title: "A Responsible Guide to Google Review Policy Assessment",
    description:
      "Learn how to assess a Google review against published policies, distinguish criticism from policy concerns, and prepare a factual report.",
    intro:
      "A business can disagree with a review and still need to leave it online. The useful question is not whether the review is unfair or damaging, but whether specific content appears to violate a platform policy. This guide sets out a careful process for documenting what happened, evaluating available evidence, and deciding whether to use Google's reporting and appeal tools. Google independently reviews reports and determines outcomes; no outside service can guarantee removal.",
    keywords: ["review policy", "Google review reporting", "policy assessment"],
    sections: [
      {
        heading: "Start with the exact review and the applicable policy",
        body: "Record the public review URL, the date you found it, and the text or other content relevant to your concern. Read the current policy guidance from Google rather than relying on a paraphrase, an old forum post, or a competitor's experience. Identify the specific rule that may apply and explain how the observable content relates to it. A low rating, a sharp opinion, or a disagreement about service is not by itself proof of a violation. If the concern is unclear, record that uncertainty instead of forcing the facts into a policy category.",
      },
      {
        heading: "Separate verifiable facts from assumptions",
        body: "Build a short timeline from records you are allowed to use, such as appointment or transaction dates and relevant communications. Distinguish what the records establish from what you infer. A name that is unfamiliar to one employee does not establish that a reviewer was never a customer; a competitor's presence in the same market does not establish coordination. Avoid speculating about a reviewer's identity or motives. This discipline makes the assessment more useful to a reviewer and reduces the chance of reporting legitimate criticism.",
      },
      {
        heading: "Prepare a concise, proportionate report",
        body: "If a specific policy concern is supported, provide the review URL, the relevant policy category, and a concise explanation tied to the facts. Submit only information you are authorized to share, and exclude account credentials, payment details, health information, or unrelated personal data. Do not recruit people to file duplicate reports or repeatedly submit the same allegation without new information. Keep a private record of what you submitted and when so that a later appeal can add relevant context rather than repeat the same text.",
      },
      {
        heading: "Follow the process without promising an outcome",
        body: "Use the official reporting and appeal options available to the business. Record responses and deadlines, and ask Google for clarification through its published support channels when appropriate. A decision to leave a review in place does not prove that the reviewer is right or that the business did anything wrong; it means the platform did not take the requested action under its process. Respond professionally where a public response is appropriate, correct service issues that are within your control, and avoid retaliatory contact.",
      },
    ],
    faqs: [
      {
        question: "Can a business have a negative review removed just because it is inaccurate?",
        answer:
          "Not automatically. Use the platform's current policies and reporting process, and provide verifiable context. Google makes the final decision.",
      },
      {
        question: "Does a one-star rating prove that a review violates policy?",
        answer: "No. A low rating or negative opinion alone is not evidence of a policy violation.",
      },
      {
        question: "Should several employees report the same review?",
        answer:
          "Avoid coordinated duplicate reports. A single accurate report with relevant evidence is more appropriate than repeated submissions.",
      },
    ],
  },
  {
    slug: "review-evidence-and-recordkeeping",
    title: "How to Organize Review Evidence and Records",
    description:
      "A practical recordkeeping framework for review URLs, timelines, authorized business records, privacy, and factual policy reports.",
    intro:
      "Good documentation is a clear, minimal record of what a business observed and why it believes a particular policy may apply. It is not a collection of every customer detail or a search for personal information about a reviewer. A consistent record helps a business assess a concern calmly, prepare an accurate report when warranted, and explain what it already tried. Keep information secure, restrict access, and retain it only as long as there is a legitimate business need.",
    keywords: ["review evidence", "business recordkeeping", "review report documentation"],
    sections: [
      {
        heading: "Create a small, consistent case record",
        body: "Use a case identifier and note the public review URL, discovery date, business location, and the staff member responsible for the assessment. Record the review's relevant wording accurately; do not silently edit or paraphrase a quotation. If screenshots are useful, capture only the relevant area and keep the original file with its date. A short index explaining each item is usually more usable than an unorganized folder of duplicate images and unrelated correspondence.",
      },
      {
        heading: "Use records you are authorized to access",
        body: "Compare the review's claims with appropriate business records, such as a service date or booking reference, only when staff are authorized to access those records. Limit the record to what is needed to evaluate the concern. Do not attempt to identify a reviewer through data brokers, personal accounts, surveillance, or contact with their employer. If the business cannot verify a claim, document that it is unverified rather than treating absence of a match as proof of fraud.",
      },
      {
        heading: "Protect personal and confidential information",
        body: "Store evidence in an access-controlled system, use approved retention practices, and avoid sharing personal or sensitive information in public responses or reports unless the official process requires it and the business is authorized to do so. Redact unrelated names, account numbers, addresses, and private messages before sharing a copy. Follow applicable privacy obligations and seek qualified advice for questions about legal preservation, disclosure, or retention.",
      },
      {
        heading: "Keep an auditable decision trail",
        body: "Record the policy considered, the facts supporting and weighing against it, who reviewed the material, and whether a report or appeal was submitted. Log the date and response without overstating what it means. If new information changes the assessment, add a dated note instead of overwriting the earlier record. A clear decision trail supports consistent handling across locations and helps the business learn from recurring service issues.",
      },
    ],
    faqs: [
      {
        question: "Should a business collect every record about a reviewer?",
        answer:
          "No. Use only records the business is authorized to access and that are relevant to the specific assessment.",
      },
      {
        question: "Is a screenshot enough evidence by itself?",
        answer:
          "A screenshot may preserve what was displayed, but it does not establish every underlying fact. Keep the URL, date, and relevant context as well.",
      },
      {
        question: "Can customer information be posted in a public reply?",
        answer:
          "Avoid disclosing private customer information in public. Keep replies professional and move account-specific discussion to an appropriate private channel.",
      },
    ],
  },
  {
    slug: "responding-to-negative-reviews",
    title: "Responding Professionally to Negative Reviews",
    description:
      "A practical framework for acknowledging criticism, protecting customer privacy, resolving service issues, and avoiding retaliatory replies.",
    intro:
      "A public response is for the reviewer and the people who may read the conversation later. It should show that the business listened, protect private information, and offer a reasonable next step. It is not a place to argue about every detail, reveal customer records, threaten the reviewer, or promise that a platform will remove a review. A calm, consistent process helps staff respond promptly while preserving the option to assess a separate policy concern.",
    keywords: ["responding to negative reviews", "customer feedback", "business review response"],
    sections: [
      {
        heading: "Pause and understand the concern",
        body: "Before responding, identify the main issue the reviewer raised and check the relevant business records internally. Give staff a short approval process for responses that involve safety, privacy, allegations of serious misconduct, or legal questions. Do not assume a review is fake because the reviewer is unfamiliar to the person reading it. If the business needs time to verify details, a brief acknowledgement can be more appropriate than a detailed response written under pressure.",
      },
      {
        heading: "Acknowledge without exposing private information",
        body: "Use a courteous tone, acknowledge the experience described, and apologize for the frustration when appropriate without making claims the business has not verified. Do not confirm whether someone is a patient, client, student, tenant, or customer if that fact is private. Avoid posting names, appointment details, transaction records, screenshots of private messages, or allegations about the reviewer. Invite the person to continue through a suitable private support channel.",
      },
      {
        heading: "Offer a concrete next step",
        body: "Give a monitored contact route and describe what the business can review or correct. Follow through on the private conversation and use the feedback to identify operational improvements. Do not offer a benefit in exchange for changing or deleting a review, and do not condition ordinary service on a public edit. A response should remain useful even if the reviewer never replies.",
      },
      {
        heading: "Handle a separate policy concern separately",
        body: "If the content may violate a platform policy, preserve the URL and assess the issue through the official reporting process. Do not threaten to report someone merely for expressing dissatisfaction, and do not use a public reply to pressure them. A policy report and a service-recovery conversation are separate actions with separate purposes. Neither guarantees a particular platform outcome.",
      },
    ],
    faqs: [
      {
        question: "Should a business reply to every negative review?",
        answer:
          "A timely and thoughtful reply can be useful, but it should be accurate, privacy-conscious, and appropriate to the situation.",
      },
      {
        question: "Can a business ask a reviewer to remove criticism?",
        answer:
          "Avoid pressuring people to remove honest feedback. Address the underlying concern and use platform policy reporting only for a specific supported concern.",
      },
      {
        question: "What if the review includes a private customer detail?",
        answer:
          "Do not repeat or expand on sensitive details publicly. Preserve relevant context securely and use the platform's official reporting or support options if appropriate.",
      },
    ],
  },
  {
    slug: "review-management-for-multi-location-businesses",
    title: "Review Management for Multi-Location Businesses",
    description:
      "Build a consistent review-response and policy-assessment workflow across locations without duplicate reporting or privacy shortcuts.",
    intro:
      "Organizations with multiple locations need a process that is consistent without assuming every complaint or policy question is the same. Local teams understand day-to-day service; central teams can provide training, privacy safeguards, and escalation paths. A practical program defines who may respond, what records may be used, how an issue is escalated, and how the organization learns from recurring feedback. It does not set targets for removing criticism or encourage staff to coordinate duplicate reports.",
    keywords: [
      "multi-location review management",
      "business review workflow",
      "location response policy",
    ],
    sections: [
      {
        heading: "Set clear roles and escalation rules",
        body: "Name a local owner for routine service feedback and a central contact for privacy, safety, and policy questions. Give each role a clear scope and a way to escalate uncertainty. Staff should know when to pause rather than improvise—for example, when a reply could expose a customer's relationship with the organization or when an allegation needs specialized review. Keep permissions and account access proportionate to each role.",
      },
      {
        heading: "Use one response standard with local context",
        body: "Provide examples of courteous, concise language, then let teams address the actual concern in their own location. A template should be a starting point, not a way to publish identical replies that ignore the review. Ask staff to verify local facts before responding and to avoid promises about refunds, policy outcomes, or platform action unless the business has authority and a factual basis for them.",
      },
      {
        heading: "Keep privacy-safe records",
        body: "Use a consistent case identifier and record the URL, responsible team, relevant dates, and resolution steps in an approved system. Do not create informal spreadsheets full of customer details or pass credentials between locations. Define retention and access practices with the organization's privacy and security owners. Aggregate recurring themes for service improvement without exposing individual customers to teams that do not need to know.",
      },
      {
        heading: "Measure service quality, not removal volume",
        body: "Useful operational measures include response timeliness, completion of promised follow-ups, recurring service issues, and staff training coverage. A count of reports or removed reviews is not a fair measure of customer service and can create pressure to report legitimate criticism. Review a sample of responses for tone, accuracy, and privacy; update training when the same avoidable issue recurs.",
      },
    ],
    faqs: [
      {
        question: "Should every location use exactly the same reply?",
        answer:
          "Use shared privacy and tone standards, but tailor each reply to the verified issue rather than posting identical scripts.",
      },
      {
        question: "Should locations coordinate reports on one review?",
        answer:
          "No. Avoid coordinated duplicate submissions. Route a documented concern through the organization's designated owner.",
      },
      {
        question: "What should a multi-location program measure?",
        answer:
          "Track response quality, follow-through, recurring service themes, and training—not a promised number of removed reviews.",
      },
    ],
  },
  {
    slug: "ethical-review-management-agency",
    title: "An Ethical Operating Guide for Review Management Agencies",
    description:
      "Set transparent client expectations, use documented evidence, protect information, and build an agency service without guaranteed outcomes.",
    intro:
      "A review-management agency can help a business organize information, understand available platform processes, and communicate professionally. It cannot control a platform's decision or truthfully promise that negative reviews will disappear. An ethical operating model explains the service boundary before taking a client, verifies authority to handle supplied material, protects personal information, and prices work without tying success to a guaranteed outcome. This guide is a business-practice overview, not legal advice or a promise of partner eligibility.",
    keywords: ["review management agency", "agency operating practices", "reseller program ethics"],
    sections: [
      {
        heading: "Describe the service precisely",
        body: "Explain whether the agency provides policy education, evidence organization, response drafting, or administrative assistance. Do not imply that the agency represents Google, has privileged access to moderators, or can ensure a decision. Put scope, exclusions, fees, client responsibilities, and approval processes in writing. If a prospective customer asks for a guaranteed removal, explain the limits and decline claims the agency cannot support.",
      },
      {
        heading: "Screen requests for a legitimate basis",
        body: "Ask what specific content concerns the client and what information supports the concern. Do not accept instructions to file knowingly unsupported reports, impersonate reviewers, threaten customers, or coordinate duplicate complaints. Keep a record of the client's authorization to provide materials. When a request raises a legal or privacy issue outside the agency's expertise, pause and encourage the client to consult a qualified professional.",
      },
      {
        heading: "Protect client and reviewer information",
        body: "Collect the minimum information required, restrict access, use approved storage, and set a retention schedule. Do not copy private customer conversations into public drafts or use personal information to investigate reviewers. Establish a process for deleting unnecessary material and reporting an accidental disclosure. Confirm that subcontractors and tools meet the client's requirements before sharing any records.",
      },
      {
        heading: "Review program terms and disclose relationships",
        body: "Before offering a reseller service, confirm current eligibility, payment terms, and branding permissions with the program operator. Disclose material relationships where a platform or applicable rule requires it. Any guest article, social reply, or community post should be relevant to the audience, truthful about the author's affiliation, and compliant with the community's rules. Do not use purchased profiles or automated posting networks.",
      },
    ],
    faqs: [
      {
        question: "Can an agency guarantee a platform decision?",
        answer:
          "No. The platform controls its review process and determines whether content violates its policies.",
      },
      {
        question: "Can an agency advertise a 4.9-star average without verified reviews?",
        answer:
          "No. Ratings and review counts must reflect genuine, documented feedback and comply with applicable rules.",
      },
      {
        question: "Should agency content be posted automatically to many accounts?",
        answer:
          "No. Publish only original, relevant content through authorized accounts, with required disclosures and human review.",
      },
    ],
  },
];

export function getPillarGuide(slug: string) {
  return PILLAR_GUIDES.find((guide) => guide.slug === slug);
}

export function relatedPillarGuides(text: string, limit = 3) {
  const normalized = text.toLowerCase();
  return PILLAR_GUIDES.map((guide) => ({
    guide,
    score: guide.keywords.filter((keyword) => normalized.includes(keyword.toLowerCase())).length,
  }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, limit))
    .map(({ guide }) => guide);
}
