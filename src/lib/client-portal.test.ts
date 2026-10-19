import { describe, expect, it } from "vitest";
import { clientReportStatus } from "./client-portal";

describe("client report status", () => {
  it("recognizes the client-facing status values and normalizes case", () => {
    expect(clientReportStatus("Removed")).toBe("Removed");
    expect(clientReportStatus("REJECTED")).toBe("Rejected");
    expect(clientReportStatus("pending")).toBe("Pending");
    expect(clientReportStatus("Reported")).toBe("Reported");
    expect(clientReportStatus("Draft ready")).toBe("Draft ready");
  });

  it("rejects unknown database statuses instead of presenting a false success state", () => {
    expect(() => clientReportStatus("google submitted")).toThrow(
      "Report status could not be read.",
    );
  });
});
