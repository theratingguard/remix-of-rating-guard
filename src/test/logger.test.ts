import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "@/lib/logger.server";

describe("structured server logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes JSON and redacts credential values", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "staff.action", "Saved request", {
      password: "never-log-this",
      authorization: "Bearer abc.def.ghi",
      nested: { apiKey: "sb_secret_example" },
      count: 2,
      details: "password=hunter2 and postgres://db-user:db-password@localhost:5432/app",
    });
    const entry = JSON.parse(output.mock.calls[0]![0] as string);
    expect(entry).toMatchObject({
      level: "info",
      context: "staff.action",
      message: "Saved request",
      metadata: {
        password: "[REDACTED]",
        authorization: "[REDACTED]",
        nested: { apiKey: "[REDACTED]" },
        count: 2,
      },
    });
    expect(output.mock.calls[0]![0]).not.toContain("never-log-this");
    expect(output.mock.calls[0]![0]).not.toContain("hunter2");
    expect(output.mock.calls[0]![0]).not.toContain("db-password");
  });
});
