export const LEGAL_TEMPLATE_KINDS = ["primary", "followUp", "escalation"] as const;
export type LegalTemplateKind = (typeof LEGAL_TEMPLATE_KINDS)[number];

export type CountryTemplates = Record<LegalTemplateKind, string>;

const templates: CountryTemplates = {
  primary: `To Google Maps Support,

Please independently review this Google Maps review for {{businessName}} under the published Google Maps user-generated-content policies: https://support.google.com/contributionpolicy/answer/7400114.

Review URL: {{reviewUrl}}
Reviewer shown on Google: {{reviewerName}}
Policy category we ask you to assess: {{policy}}
Exact review excerpt: "{{evidenceQuote}}"

This request is limited to the quoted material and the cited platform policy. The excerpt and any supporting material should be checked against the complete review and authentic records. A low rating, disagreement, or negative account of a genuine experience is not by itself evidence of a policy violation. Please preserve legitimate criticism.

Any country-law references supplied with this draft are informational context only. They do not establish that a law was violated, create an entitlement to removal, or replace advice from qualified counsel in the relevant jurisdiction. No court finding, legal notice, or supporting document is implied.

Please assess the review under Google's published policies and take action only if your independent review finds it violates them.

Respectfully,
[Authorized business representative]`,
  followUp: `To Google Maps Support,

I am following up on the policy report concerning {{businessName}} (review URL: {{reviewUrl}}), submitted on [actual submission date/reference].

The reported policy category was {{policy}}. The exact review excerpt previously identified was: "{{evidenceQuote}}".

Would you please confirm whether this matter is still under review or whether additional information can be provided through Google's official process? This follow-up does not assume that a policy violation occurred or that a particular response time is required.

We ask that the full review be assessed in context. Negative feedback and a low rating should remain available unless the content independently meets Google's published removal criteria. Any supporting records offered will be authentic, relevant, and limited to information we may lawfully disclose.

Country-specific law notes associated with this draft are general information only. They are not allegations of legal liability, a demand for removal under local law, or legal advice.

Thank you for reviewing the request.

Respectfully,
[Authorized business representative]`,
  escalation: `To Google Maps Support,

Please advise whether an additional review or appeal is available for the policy report about {{businessName}} (review URL: {{reviewUrl}}; prior reference: [actual reference]).

The concern was submitted under the Google policy category {{policy}}, with this exact excerpt: "{{evidenceQuote}}". We ask for an independent reassessment against the complete review and Google's published policies at https://support.google.com/contributionpolicy/answer/7400114.

This escalation does not characterize a disputed statement as proven or assert that local law requires removal. Any jurisdiction-specific legal question should be assessed by qualified counsel using verified facts and current law. Please retain legitimate customer criticism where the policy criteria are not met.

Please let us know whether Google provides an available appeal path or requires additional, authentic evidence.

Respectfully,
[Authorized business representative]`,
};

export function getCountryTemplates(): CountryTemplates {
  return { ...templates };
}
