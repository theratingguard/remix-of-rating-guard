import { describe, expect, it } from "vitest";
import { ScanError } from "../google-places.server";
import { isPermanentWorkerError, workerErrorCode } from "./retry-policy.server";

describe("worker retry policy", () => {
  it("does not retry definitive missing-business results", () => {
    expect(
      isPermanentWorkerError(
        new ScanError(
          "NOT_FOUND",
          "Google search did not return the business identified by this link.",
        ),
      ),
    ).toBe(true);
  });

  it("does not retry invalid Google provider data", () => {
    expect(
      isPermanentWorkerError(
        new ScanError("INVALID_PROVIDER_DATA", "Google returned malformed place data."),
      ),
    ).toBe(true);
  });

  it.each(["NOT_FOUND", "INVALID_PROVIDER_DATA"])(
    "immediately fails definitive provider errors represented by code (%s)",
    (code) => {
      const error = Object.assign(new Error("Exact provider reason"), { code });
      expect(isPermanentWorkerError(error)).toBe(true);
    },
  );

  it("keeps transient network failures retryable", () => {
    expect(
      isPermanentWorkerError(new ScanError("NETWORK", "Google is temporarily unavailable.")),
    ).toBe(false);
  });

  it("preserves the AI budget code so workers can pause rather than retry it", () => {
    const error = new ScanError("AI_BUDGET_LIMIT", "Daily AI budget exhausted.");
    expect(workerErrorCode(error)).toBe("AI_BUDGET_LIMIT");
    expect(isPermanentWorkerError(error)).toBe(false);
  });

  it("does not treat unknown errors as permanent", () => {
    expect(isPermanentWorkerError(new Error("Unexpected worker failure"))).toBe(false);
  });
});
