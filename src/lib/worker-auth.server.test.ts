import { describe, expect, it } from "vitest";
import { matchesWorkerSecret } from "./worker-auth.server";

describe("matchesWorkerSecret", () => {
  it("rejects missing credentials and mismatches", () => {
    expect(matchesWorkerSecret(undefined, "secret")).toBe(false);
    expect(matchesWorkerSecret("secret", undefined)).toBe(false);
    expect(matchesWorkerSecret("public-key", "secret")).toBe(false);
    expect(matchesWorkerSecret("short", "longer")).toBe(false);
  });

  it("accepts the configured secret", () => {
    expect(matchesWorkerSecret("worker-secret", "worker-secret")).toBe(true);
  });
});
