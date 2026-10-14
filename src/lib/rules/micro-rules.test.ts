import { describe, expect, it } from "vitest";
import { MICRO_RULE_CATALOG_COUNT, readPersistedRuleScore, runMicroRules } from "./micro-rules";
import { rulesEngine } from "../rules-engine.server";
import { MICRO_RULE_CHECK_COUNT, RULE_GROUP_COUNTS } from "./scoring";

describe("micro rule suite", () => {
  it("runs the configured 500-check inventory and reports assessed versus unavailable inputs", () => {
    const result = runMicroRules({
      text: "THIS PLACE IS MAKING PEOPLE SICK!!!!",
      rating: 1,
      businessName: "The Hudson",
      reviewDate: "2026-10-12T03:00:00Z",
    });

    expect(MICRO_RULE_CHECK_COUNT).toBe(500);
    expect(MICRO_RULE_CATALOG_COUNT).toBe(500);
    expect(result.checks).toHaveLength(500);
    expect(result.score.checksRun).toBe(500);
    expect(result.score.groups).toMatchObject({
      text: { checks: 100, maxScore: 30 },
      reviewer: { checks: 75, maxScore: 25 },
      temporal: { checks: 50, maxScore: 15 },
      crossPlatform: { checks: 75, maxScore: 15 },
      network: { checks: 50, maxScore: 10 },
      semantic: { checks: 50, maxScore: 5 },
      pattern: { checks: 50, maxScore: 0 },
      language: { checks: 50, maxScore: 0 },
    });
    expect(result.score.checksAssessed).toBeLessThan(500);
    expect(new Set(result.checks.map((check) => check.id)).size).toBe(500);
    expect(
      result.checks.some(
        (check) => check.id === "reviewer-location-mismatch" && check.status === "not_assessed",
      ),
    ).toBe(true);
    expect(result.checks.find((check) => check.id === "timing-three-am-local")?.status).toBe(
      "not_assessed",
    );
    expect(result.checks.find((check) => check.id === "timing-timezone-missing")?.status).toBe(
      "not_assessed",
    );
    expect(result.checks.find((check) => check.id === "network-extra-shared-ip")?.status).toBe(
      "not_assessed",
    );
    expect(
      result.checks.find((check) => check.id === "reviewer-extra-email-verification")?.status,
    ).toBe("not_assessed");
    expect(
      result.checks.find((check) => check.id === "cross-extra-same-review-facebook-google")?.status,
    ).toBe("not_assessed");
    expect(
      result.checks.find((check) => check.id === "cross-platform-yelp-review-match")?.status,
    ).toBe("not_assessed");
    expect(result.checks.find((check) => check.id === "network-forensics-shared-ip")?.status).toBe(
      "not_assessed",
    );
    expect(result.checks.find((check) => check.id === "language-hinglish-hai")?.status).toBe(
      "clear",
    );
  });

  it("treats the sample all-caps review as a low advisory signal, not a fake-review finding", () => {
    const result = runMicroRules({
      text: "THIS PLACE IS MAKING PEOPLE SICK!!!!",
      businessName: "The Hudson",
    });

    expect(result.score.score).toBeLessThan(40);
    expect(result.checks.find((check) => check.id === "text-uppercase-majority")?.status).toBe(
      "flagged",
    );
    expect(result.checks.find((check) => check.id === "text-exclamation-run")?.status).toBe(
      "flagged",
    );
    expect(rulesEngine({ text: "THIS PLACE IS MAKING PEOPLE SICK!!!!" }).violates).toBe(false);
  });

  it("includes regional language, country context, defamation, and fake-engagement markers", () => {
    const result = runMicroRules({
      text: "bahut खराब service, paisa lekar fraud kiya; fake reviews and पैसे देकर खरीदे हुए रिव्यू.",
      reviewer: { locationCountry: "US" },
      context: { businessCountry: "IN" },
    });
    const checkStatus = (id: string) => result.checks.find((check) => check.id === id)?.status;

    expect(checkStatus("language-hinglish-bahut")).toBe("flagged");
    expect(checkStatus("language-hindi-kharab")).toBe("flagged");
    expect(checkStatus("reviewer-extra-geographic-variation")).toBe("flagged");
    expect(checkStatus("pattern-defamation-term")).toBe("flagged");
    expect(checkStatus("language-defamation-fraud")).toBe("flagged");
    expect(checkStatus("language-fake-paid-hindi")).toBe("flagged");
    expect(checkStatus("language-fake-review-claim")).toBe("flagged");
    expect(result.score.groups.pattern.score).toBe(0);
    expect(result.score.groups.language.score).toBe(0);
  });

  it("checks the 3 AM rule only when a business-local time zone is supplied", () => {
    const withoutZone = runMicroRules({
      text: "A detailed review of the actual service and meal experience.",
      reviewDate: "2026-10-12T07:00:00Z",
    });
    const withZone = runMicroRules({
      text: "A detailed review of the actual service and meal experience.",
      reviewDate: "2026-10-12T07:00:00Z",
      timeZone: "America/New_York",
    });

    expect(withoutZone.checks.find((check) => check.id === "timing-three-am-local")?.status).toBe(
      "not_assessed",
    );
    expect(withZone.checks.find((check) => check.id === "timing-three-am-local")?.status).toBe(
      "flagged",
    );
  });

  it("keeps score caps within the advertised 0-100 range", () => {
    const result = runMicroRules({
      text: "Best cafe in Albany, click here for a special offer!!! I will hurt you.",
      competitorNames: ["Hudson Cafe"],
      reviewer: {
        accountAgeDays: 1,
        hasPhoto: false,
        reviewsInLastHour: 12,
        oneStarReviewCount: 5,
        totalReviewCount: 5,
        locationCountry: "US",
      },
      context: {
        businessCountry: "IN",
        sameDayOneStarCount: 8,
        explicitlyVagueTiming: true,
        hearsayOnly: true,
      },
    });

    expect(result.score.score).toBeGreaterThanOrEqual(0);
    expect(result.score.score).toBeLessThanOrEqual(100);
    expect(result.score.groups.text.score).toBeLessThanOrEqual(30);
    expect(result.score.groups.reviewer.score).toBeLessThanOrEqual(25);
    expect(result.score.groups.temporal.score).toBeLessThanOrEqual(15);
    expect(result.score.groups.crossPlatform.score).toBeLessThanOrEqual(15);
    expect(result.score.groups.network.score).toBeLessThanOrEqual(10);
    expect(result.score.groups.semantic.score).toBeLessThanOrEqual(5);
    expect(result.score.groups.pattern.score).toBe(0);
    expect(result.score.groups.language.score).toBe(0);
    expect(Object.values(result.score.groups).reduce((sum, group) => sum + group.maxScore, 0)).toBe(
      100,
    );
  });

  it("keeps the published per-domain inventory synchronized", () => {
    expect(RULE_GROUP_COUNTS).toEqual({
      text: 100,
      reviewer: 75,
      temporal: 50,
      crossPlatform: 75,
      network: 50,
      semantic: 50,
      pattern: 50,
      language: 50,
    });
    expect(Object.values(RULE_GROUP_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(500);
  });

  it("maps persisted 110-check score groups to the current display categories", () => {
    const oldGroup = {
      score: 1,
      maxScore: 20,
      checks: 1,
      assessed: 1,
      flagged: 1,
    };
    const score = readPersistedRuleScore({
      rules_micro_check: {
        score: 6,
        band: "normal",
        checksRun: 110,
        checksAssessed: 6,
        checksFlagged: 6,
        durationMs: 1,
        groups: {
          text: oldGroup,
          reviewer: oldGroup,
          timing: oldGroup,
          crossReference: oldGroup,
          linguistic: oldGroup,
          pattern: oldGroup,
        },
      },
    });

    expect(score?.groups).toEqual({
      text: oldGroup,
      reviewer: oldGroup,
      temporal: oldGroup,
      crossPlatform: oldGroup,
      network: oldGroup,
      semantic: oldGroup,
      pattern: { score: 0, maxScore: 0, checks: 0, assessed: 0, flagged: 0 },
      language: { score: 0, maxScore: 0, checks: 0, assessed: 0, flagged: 0 },
    });
  });

  it("maps prior six-group scores without inventing historic pattern or language data", () => {
    const group = { score: 0, maxScore: 20, checks: 1, assessed: 1, flagged: 0 };
    const score = readPersistedRuleScore({
      rules_micro_check: {
        score: 0,
        band: "normal",
        checksRun: 250,
        checksAssessed: 1,
        checksFlagged: 0,
        durationMs: 1,
        groups: {
          text: group,
          reviewer: group,
          temporal: group,
          crossPlatform: group,
          network: group,
          semantic: group,
        },
      },
    });

    expect(score?.groups.pattern).toEqual({
      score: 0,
      maxScore: 0,
      checks: 0,
      assessed: 0,
      flagged: 0,
    });
    expect(score?.groups.language).toEqual(score?.groups.pattern);
  });
});
