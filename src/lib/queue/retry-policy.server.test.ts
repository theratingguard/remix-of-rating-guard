import { describe, expect, it } from "vitest";
import { ScanError } from "../google-places.server";
import { isPermanentWorkerError } from "./retry-policy.server";

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

  it("keeps transient network failures retryable", () => {
    expect(
      isPermanentWorkerError(new ScanError("NETWORK", "Google is temporarily unavailable.")),
    ).toBe(false);
  });

  it("does not treat unknown errors as permanent", () => {
    expect(isPermanentWorkerError(new Error("Unexpected worker failure"))).toBe(false);
  });
});
