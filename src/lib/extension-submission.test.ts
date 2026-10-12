import { describe, expect, it } from "vitest";
import { extensionSubmissionSchema } from "./extension.functions";

const submission = {
  scanId: "31b8e932-77cd-4115-bd93-b91ca19eba7b",
  reviewId: "31b8e932-77cd-4115-bd93-b91ca19eba7b",
  submittedAt: "2026-10-11T10:00:00.000Z",
  verificationReference: "Google confirmation reference 123",
  requestText: "Exact saved policy request.",
  confirmed: true,
};

describe("extension submission API payload", () => {
  it("accepts a user-confirmed actual past submission", () => {
    expect(extensionSubmissionSchema.parse(submission)).toEqual(submission);
  });

  it("requires explicit confirmation and a reference", () => {
    expect(() => extensionSubmissionSchema.parse({ ...submission, confirmed: false })).toThrow();
    expect(() =>
      extensionSubmissionSchema.parse({ ...submission, verificationReference: "short" }),
    ).toThrow();
  });

  it("rejects future submission timestamps", () => {
    expect(() =>
      extensionSubmissionSchema.parse({
        ...submission,
        submittedAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toThrow("Submission date cannot be in the future.");
  });
});
