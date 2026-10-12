import type { CountryLaw, LegalCountry } from "../../src/lib/legal-laws/country-laws";
import type {
  CountryTemplates,
  LegalTemplateKind,
} from "../../src/lib/legal-templates/country-templates";

export type LegalRequestInput = {
  businessName: string;
  reviewUrl: string | null;
  reviewerName: string;
  reviewText: string;
  policy: string;
  evidenceQuote: string;
};

export type LegalWorkerRequest = {
  country: LegalCountry;
  template: LegalTemplateKind;
  method: "google-policy-review";
  text: string;
  policyUrl: string;
  laws: CountryLaw[];
  legalNote: string;
};

export type FollowUpStep = {
  afterDays: number;
  template: LegalTemplateKind;
  description: string;
};

export abstract class BaseLegalWorker {
  abstract readonly country: LegalCountry;
  abstract readonly laws: readonly CountryLaw[];
  abstract readonly templates: CountryTemplates;

  protected abstract readonly legalNote: string;

  generateRequest(
    input: LegalRequestInput,
    template: LegalTemplateKind = "primary",
  ): LegalWorkerRequest {
    const text = this.templates[template]
      .replaceAll("{{businessName}}", input.businessName)
      .replaceAll("{{reviewUrl}}", input.reviewUrl ?? "[add the original review URL]")
      .replaceAll("{{reviewerName}}", input.reviewerName)
      .replaceAll("{{policy}}", input.policy)
      .replaceAll("{{evidenceQuote}}", input.evidenceQuote);

    return {
      country: this.country,
      template,
      method: "google-policy-review",
      text,
      policyUrl: "https://support.google.com/contributionpolicy/answer/7400114",
      laws: [...this.laws],
      legalNote: this.legalNote,
    };
  }

  submitMethod() {
    return {
      name: "Google Maps policy report",
      url: "https://support.google.com/contributionpolicy/answer/7400114",
      automated: false as const,
      note: "The business representative submits manually; this worker does not contact Google or make a legal filing.",
    };
  }

  followUpSchedule(): FollowUpStep[] {
    return [
      {
        afterDays: 7,
        template: "followUp",
        description: "Suggested status check; not a statutory or Google response deadline.",
      },
      {
        afterDays: 14,
        template: "escalation",
        description:
          "Suggested next step: use Google's available appeal/support process or obtain local legal advice.",
      },
    ];
  }
}
