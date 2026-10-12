import { describe, expect, it } from "vitest";
import { rulesEngine, type RulesReview } from "./rules-engine.server";

const fakeCases = [
  {
    name: "short review",
    input: {
      text: "Bad service!",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 90, hasPhoto: true },
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "multiple reviews",
    input: {
      text: "Terrible, no follow up.",
      reviewer: { reviewedBusinessCount: 5, accountAgeDays: 120, hasPhoto: true },
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "new account",
    input: {
      text: "Very poor cleanliness.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 11, hasPhoto: true },
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "no photo",
    input: {
      text: "Awful experience.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 90, hasPhoto: false },
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "duplicate signature",
    input: {
      text: "Great food and service!",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 120, hasPhoto: true },
      duplicateText: true,
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "duplicate across scan",
    input: {
      text: "Helpful and polite team.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 120, hasPhoto: true },
      repeatedAcrossScans: true,
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "short with no photo",
    input: {
      text: "Never again.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 60, hasPhoto: false },
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "short but high reviews",
    input: {
      text: "Worst ever.",
      reviewer: { reviewedBusinessCount: 8, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "new account and duplicate",
    input: {
      text: "Very bad staff.",
      reviewer: { reviewedBusinessCount: 3, accountAgeDays: 12, hasPhoto: true },
      duplicateReviewTexts: ["Very bad staff."],
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "short and duplicate",
    input: {
      text: "No thanks.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 18, hasPhoto: true },
      duplicateText: true,
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "short and duplicate",
    input: {
      text: "No thanks.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 18, hasPhoto: true },
      duplicateText: true,
    },
    expectedPolicy: "fake_review",
  },
  {
    name: "reviewer count threshold",
    input: {
      text: "Maybe not.",
      reviewer: { reviewedBusinessCount: 5, accountAgeDays: 40, hasPhoto: true },
    },
    expectedPolicy: "fake_review",
  },
];

const spamCases = [
  {
    name: "url spam",
    input: {
      text: "Use https://promo.example.com for 50% off!",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "short url spam",
    input: {
      text: "Check this: www.best-deal.example",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "phone spam",
    input: {
      text: "Call 9876543210 for a discount.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 140, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "email spam",
    input: {
      text: "Email hello@deal.example to claim your offer!",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 140, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "offer keyword",
    input: {
      text: "Visit today, buy now, amazing offer.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "click buy",
    input: {
      text: "Click here, buy, score a discount.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "maps url spam",
    input: {
      text: "https://maps.google.com/?q=discount",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "repeated across scans",
    input: {
      text: "Visit our cafe for a special offer.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 200, hasPhoto: true },
      repeatedAcrossScans: true,
    },
    expectedPolicy: "spam",
  },
  {
    name: "promo text",
    input: {
      text: "Offer ends today, click now and save.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 300, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "discount website",
    input: {
      text: "Discount for first time users: https://promo.example",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 180, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "deal call now",
    input: {
      text: "call now to get a free offer",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 90, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
  {
    name: "booking link",
    input: {
      text: "Book now before 5 pm, visit our page.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 120, hasPhoto: true },
    },
    expectedPolicy: "spam",
  },
];

const conflictCases = [
  {
    name: "employee mentions",
    input: {
      text: "The owner is rude, I used to work here as an employee.",
      reviewer: { name: "Asha", reviewedBusinessCount: 1, accountAgeDays: 50, hasPhoto: true },
      business: { owner: { name: "Rahul" } },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "former employee",
    input: {
      text: "Former employee here; they underpaid staff.",
      reviewer: { name: "Nina", reviewedBusinessCount: 0, accountAgeDays: 60, hasPhoto: true },
      business: { owner: { name: "Nina" } },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "competitor",
    input: {
      text: "This competitor is bad and should be shut down.",
      reviewer: { name: "Raju", reviewedBusinessCount: 1, accountAgeDays: 110, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "owner name match",
    input: {
      text: "The place was clean and managed well.",
      reviewer: { name: "Amit", reviewedBusinessCount: 0, accountAgeDays: 50, hasPhoto: true },
      business: { owner: { name: "Amit" } },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "owner relationship",
    input: {
      text: "This place is better than my old employer.",
      reviewer: { name: "Sonia", reviewedBusinessCount: 0, accountAgeDays: 90, hasPhoto: true },
      business: { owner: { name: "Sonia" } },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "employee issue",
    input: {
      text: "The employee staff was rude and dishonest.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 120, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "former employee text",
    input: {
      text: "I used to work here and they still owe me salary.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 80, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "competitor claim",
    input: {
      text: "The competitor's service is terrible.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 80, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "owner keyword",
    input: {
      text: "Owner should fix the queue quickly.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 180, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "employee relation",
    input: {
      text: "I am an employee and they hide food quality issues.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 50, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "owner assertion",
    input: {
      text: "The owner manager nearly caused harm.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 140, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
  {
    name: "former employee incident",
    input: {
      text: "Former employee here, they are unprofessional.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 200, hasPhoto: true },
    },
    expectedPolicy: "conflict_of_interest",
  },
];

const prohibitedCases = [
  {
    name: "hate slur",
    input: {
      text: "You stupid idiot, this place is terrible.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "hindi hate",
    input: {
      text: "Ye gandu aur bewakoof log hain.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "personal phone",
    input: {
      text: "Call me at 9876543210 to discuss this.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "address leak",
    input: {
      text: "I live at 12 Green Road, near old station, not safe.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "threat",
    input: {
      text: "I will hurt you and your family if you do not fix this.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "violence threat",
    input: {
      text: "I will attack the manager if this is not fixed.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "insulting abuse",
    input: {
      text: "You are a bastard and a fool.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "hindi abuse",
    input: {
      text: "Madarchod, bakwas service.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "personal address",
    input: {
      text: "My house no 24, lane 6, sector 34, call me.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "phone and threats",
    input: {
      text: "Call 9876543210; I will ruin you.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "hate abuse",
    input: {
      text: "These people are subhuman and stupid.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
  {
    name: "doxxing",
    input: {
      text: "My address is 5 Main Street, wait outside at 9 pm.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "prohibited_content",
  },
];

const normalCases = [
  {
    name: "normal long review",
    input: {
      text: "The food was bland and slow service, but the staff tried to help. We would still return for the atmosphere.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 60, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal polite criticism",
    input: {
      text: "The order arrived late and the waiting area was crowded, but I appreciated the manager's apology.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 80, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal factual issue",
    input: {
      text: "There was no parking and the lights in the hallway were broken. The staff were polite though.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 100, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal review with no conflict",
    input: {
      text: "We had a decent breakfast, the coffee was good, and the room was clean.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 220, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal review long enough",
    input: {
      text: "I visited this restaurant after a long drive. The staff were friendly, but the washroom was unclean and the air conditioner was noisy.",
      reviewer: { reviewedBusinessCount: 3, accountAgeDays: 90, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal emotional review",
    input: {
      text: "I wanted to love this place, but the wait was too long and the staff seemed overwhelmed. It still felt honest and not malicious.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 150, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal no issue",
    input: {
      text: "Ordered pizza, arrived on time, hot, and tasty. The team politely handled my special request.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 400, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal owner unrelated",
    input: {
      text: "The interiors were nice and the staff gave helpful suggestions for the menu.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 70, hasPhoto: true },
      business: { owner: { name: "Not me" } },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal long text",
    input: {
      text: "We came in for lunch and found the menu options okay, though the tables were a bit sticky. The meal was not bad, and the staff responded professionally.",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 300, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
  {
    name: "normal empty threat absent",
    input: {
      text: "I am disappointed by the slow service, but I am simply saying it as a customer experience issue and not threatening anyone.",
      reviewer: { reviewedBusinessCount: 0, accountAgeDays: 60, hasPhoto: true },
    },
    expectedPolicy: "none",
  },
];

const allCases = [...fakeCases, ...spamCases, ...conflictCases, ...prohibitedCases, ...normalCases];

describe("rules engine", () => {
  it.each(allCases)("flags $name correctly", ({ input, expectedPolicy }) => {
    const result = rulesEngine(input as RulesReview);
    if (expectedPolicy === "none") {
      expect(result.violates).toBe(false);
      return;
    }
    expect(result.violates).toBe(true);
    expect(result.policy).toBe(expectedPolicy);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("returns a neutral result when no rule is triggered", () => {
    const result = rulesEngine({
      text: "The service was okay and the staff responded well to my request.",
      reviewer: { reviewedBusinessCount: 2, accountAgeDays: 75, hasPhoto: true },
    });
    expect(result).toMatchObject({ violates: false, policy: "none", source: "rules" });
  });

  it("includes the full micro-rule score and check details in each rules result", () => {
    const result = rulesEngine({
      text: "The food was cold, but the staff replaced it quickly and apologized.",
      reviewer: { accountAgeDays: 150, hasPhoto: true },
      reviewDate: "2026-10-12T10:00:00Z",
    });

    expect(result.micro_score?.checksRun).toBe(250);
    expect(result.micro_checks).toHaveLength(250);
    expect(result.micro_score?.groups.text.checks).toBe(60);
    expect(result.micro_score?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("supports string input shorthand", () => {
    const result = rulesEngine("Click here now and get a discount for this store");
    expect(result.violates).toBe(true);
    expect(result.policy).toBe("spam");
  });

  it("reports text-forensic anomalies without treating them as policy proof", () => {
    const result = rulesEngine({
      text: "THIS REVIEW HAS AN UNUSUALLY LONG UPPERCASE MESSAGE",
      reviewer: { reviewedBusinessCount: 1, accountAgeDays: 100, hasPhoto: true },
    });
    expect(result.violates).toBe(false);
    expect(result.forensics).toContainEqual(
      expect.objectContaining({ category: "text", status: "observed" }),
    );
  });

  it("reports reviewer forensics only when supplied history supports it", () => {
    const result = rulesEngine({
      text: "The experience was disappointing but the staff were polite.",
      reviewer: {
        reviewedBusinessCount: 12,
        negativeReviewCount: 10,
        recentReviewCount: 11,
        accountAgeDays: 300,
        hasPhoto: true,
      },
    });
    expect(result.forensics).toContainEqual(
      expect.objectContaining({ category: "reviewer", status: "observed" }),
    );
  });

  it("detects a review burst from explicit temporal metadata", () => {
    const result = rulesEngine({
      text: "A detailed account of this visit with several useful observations for customers.",
      reviewsInWindow: 4,
      windowMinutes: 15,
    });
    expect(result.forensics).toContainEqual(
      expect.objectContaining({ category: "temporal", status: "observed" }),
    );
  });

  it("uses explicit shared-target metadata for network forensics", () => {
    const result = rulesEngine({
      text: "The meal was cold and the service was slow, so I would not return.",
      reviewer: { sharedTargetBusinessCount: 4 },
    });
    expect(result.forensics).toContainEqual(
      expect.objectContaining({ category: "network", status: "observed" }),
    );
  });

  it("detects near-duplicate text fingerprints and marks biometrics as unavailable", () => {
    const result = rulesEngine({
      text: "The service was very poor and the food arrived cold after a long delay today.",
      comparisonReviewTexts: [
        "The service was very poor and the food arrived cold after a long delay yesterday.",
      ],
    });
    expect(result.forensics).toContainEqual(
      expect.objectContaining({ category: "digital_fingerprint", status: "observed" }),
    );
    expect(result.forensics).toContainEqual(
      expect.objectContaining({ category: "biometrics", status: "not_assessed" }),
    );
    expect(result.policy).toBe("fake_review");
  });
});

it("covers at least 50 rules cases", () => {
  expect(allCases.length).toBeGreaterThanOrEqual(50);
});
