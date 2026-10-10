import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";
const api = vi.hoisted(() => ({ status: vi.fn(), send: vi.fn(), copy: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/report-pdf.functions", () => ({
  reportEmailStatus: api.status,
  emailReport: api.send,
}));
vi.mock("@/lib/use-feature-settings", () => ({
  useFeatureSettings: () => ({ data: { whatsapp_share_enabled: true } }),
}));
vi.mock("./private-pdf-button", () => ({ PrivatePdfButton: () => <button>Download PDF</button> }));
import { ReportListActions } from "./report-list-actions";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Private report share controls", () => {
  it("copies authorized links, opens WhatsApp share and disables email without SMTP", async () => {
    api.status.mockResolvedValue({ configured: false });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: api.copy.mockResolvedValue(undefined) },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReportListActions scanId="scan-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.status).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Email" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toContain("wa.me");
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toContain(
      "authorized%20login",
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
    await waitFor(() =>
      expect(api.copy).toHaveBeenCalledWith("https://ratingguard.online/reports/scan-1"),
    );
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });
});
