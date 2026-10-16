import { describe, expect, it } from "vitest";
import { isDatabaseOperationError, sanitizeDbError } from "@/lib/errors.server";

describe("server error handling", () => {
  it("replaces database details with a friendly message", () => {
    const error = new Error("Could not load staff: relation private.staff does not exist");
    expect(isDatabaseOperationError(error)).toBe(true);
    expect(sanitizeDbError(error)).toBe("We couldn't complete that request. Please try again.");
    expect(sanitizeDbError(error)).not.toContain("private.staff");
  });

  it("recognizes raw SQLSTATE errors without treating business errors as database failures", () => {
    const databaseError = Object.assign(new Error("raw database detail"), { code: "23505" });
    expect(isDatabaseOperationError(databaseError)).toBe(true);
    expect(isDatabaseOperationError(new Error("This case is closed."))).toBe(false);
  });
});
