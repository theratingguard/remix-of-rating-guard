export type EditorialTemplate = {
  id: string;
  channel: string;
  title: string;
  disclosure: string;
  template: string;
  checklist: string[];
};

export const EDITORIAL_TEMPLATES: EditorialTemplate[] = [
  {
    id: "guest-article-pitch",
    channel: "Guest article",
    title: "A transparent editorial pitch",
    disclosure:
      "Disclose your Rating Guard relationship and let the publisher decide whether a link belongs.",
    template:
      "Subject: Possible resource for [publication topic]\n\nHello [editor name],\n\nI work with Rating Guard, which provides tools for organizing review-policy assessments. I read your article about [specific article/topic] and thought a practical, evidence-led guide to [specific reader question] might be useful to your audience. The piece would explain [reader benefit] and distinguish policy reporting from ordinary negative feedback.\n\nIf this fits your editorial calendar, I can send a short outline for your review. No link placement or publication is expected; please feel free to decline.\n\nBest,\n[real name and role]",
    checklist: [
      "Personalize to a real, relevant publication and editor.",
      "Disclose the relationship; do not claim independent endorsement.",
      "Offer original reader value and accept editorial decisions.",
      "Do not send repeated unsolicited follow-ups.",
    ],
  },
  {
    id: "quora-answer",
    channel: "Quora",
    title: "Answer a question before mentioning a resource",
    disclosure:
      "Use only where platform rules allow; disclose your affiliation if you mention Rating Guard.",
    template:
      "A business can start by saving the review URL and checking the current platform policy that may apply. Separate verifiable facts from assumptions: an unfavorable opinion or low rating is not by itself a policy violation. If the evidence supports a specific concern, use the platform's official reporting process and keep the explanation concise. Google makes the final decision, so avoid anyone promising a particular outcome. [If genuinely relevant: I work with Rating Guard, which provides review-assessment tools; this is my affiliation.]",
    checklist: [
      "Answer the question fully without requiring a click.",
      "Do not post the same answer across unrelated questions.",
      "Include no promotional link unless it is specifically useful and permitted.",
      "Correct or remove the post if the community requests it.",
    ],
  },
  {
    id: "reddit-community-reply",
    channel: "Reddit",
    title: "A useful, disclosed community reply",
    disclosure:
      "Follow each subreddit’s self-promotion rules and disclose your affiliation prominently.",
    template:
      "One practical approach is to document the exact review URL, identify a specific current policy concern, and compare it with records the business is authorized to use. Avoid trying to identify or contact the reviewer. If there is a supported concern, use the official reporting route; ordinary criticism and low ratings are not automatically violations. Google decides the outcome. [Disclosure: I work with Rating Guard. I’m sharing the process, not asking for votes or promotion.]",
    checklist: [
      "Read the subreddit rules and participate as a genuine community member.",
      "Do not use alternate accounts, vote manipulation, or copy-pasted campaigns.",
      "Do not insert a promotional link into an unrelated discussion.",
      "Respect moderator instructions and community feedback.",
    ],
  },
  {
    id: "facebook-group-post",
    channel: "Facebook group",
    title: "A group-first educational post",
    disclosure:
      "Ask group moderators before sharing commercial material where required and disclose your role.",
    template:
      "A quick checklist for handling a concerning review: save the public URL and date; check the current platform policy; distinguish records from assumptions; avoid publishing customer information; and use the official reporting process only when a specific concern is supported. A negative opinion alone is not a policy violation, and no agency can guarantee the platform’s decision. I work with Rating Guard and help build review-assessment tools. If group rules do not allow commercial posts, I will not share promotional links.",
    checklist: [
      "Get moderator approval when group policy requires it.",
      "Avoid unsolicited DMs, scraping member lists, and repeated promotions.",
      "Use original, locally relevant educational content.",
      "Do not ask members to report, rate, or endorse a business.",
    ],
  },
  {
    id: "case-study-interview",
    channel: "Case study preparation",
    title: "Evidence-led case study interview brief",
    disclosure:
      "This is an interview outline, not a publishable testimonial or an assumed success story.",
    template:
      "1. Confirm the organization’s written permission to participate and choose whether it is named or anonymized.\n2. Record the date range, starting situation, and the source for each factual statement.\n3. Describe the work actually performed, who performed it, and what was outside the scope.\n4. Record the platform’s response using an authorized, redacted source; distinguish correlation from causation.\n5. Include limitations, unresolved issues, and the participant’s review of quotations.\n6. Remove personal data and obtain final approval before publication. Do not imply typical results or promise the same outcome to other customers.",
    checklist: [
      "Require informed written consent and source verification.",
      "Do not invent a customer, quote, review count, rating, or outcome.",
      "Redact personal information and retain supporting evidence securely.",
      "Label illustrative examples clearly; never present them as real results.",
    ],
  },
];
