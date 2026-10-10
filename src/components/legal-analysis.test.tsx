import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { LegalAnalysisPanel } from "./legal-analysis";
import { LEGAL_DISCLAIMER, LEGAL_VERSION, unsupportedLegalReview } from "@/lib/legal-analysis";
import type { Scan, Report, AnalyzedReview } from "@/lib/data";
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: { outcomes: [], appeals: [] }, isPending: false, error: null }),
}));
vi.mock("@/lib/report-pdf.functions", () => ({ saveReportPdf: {} }));
vi.mock("@/lib/private-report.functions", () => ({ downloadPrivateReport: {} }));
vi.mock("@/lib/appeal.functions", () => ({ generateAppealDraft: {} }));
vi.mock("@/lib/use-feature-settings", () => ({
  useFeatureSettings: () => ({
    data: { legal_expert_enabled: true, appeal_tracking_enabled: true },
    error: null,
  }),
}));
const scan = {
  id: "d8bdb357-60db-4a05-92c4-38020ec52eda",
  status: "complete",
  is_seed: false,
  maps_uri: "https://www.google.com/maps/?cid=123",
} as Scan;
const review = {
  id: scan.id,
  author: "Unit Reviewer",
  rating: 1,
  analysis: null,
} as AnalyzedReview;
const item = unsupportedLegalReview(review);
const report: Report = {
  created_at: new Date().toISOString(),
  high_risk_count: 0,
  id: scan.id,
  is_seed: false,
  medium_risk_count: 0,
  normal_count: 0,
  recommended_action: null,
  report_number: "RPT-UNIT",
  scan_id: scan.id,
  status: "ready",
  summary: null,
  user_id: null,
  report_data: {
    legal_analysis: {
      version: LEGAL_VERSION,
      model: "unit-model",
      generated_at: new Date().toISOString(),
      disclaimer: LEGAL_DISCLAIMER,
      reviews: [item],
    },
    legal_pdf_url: `https://ratingguard.online/reports/${scan.id}_legal.pdf`,
    legal_pdf_saved_at: new Date().toISOString(),
  },
};
afterEach(cleanup);
describe("Legal analysis report UI", () => {
  it("shows unsupported likelihood honestly, download link and four editable templates", () => {
    render(<LegalAnalysisPanel scan={scan} report={report} reviews={[review]} />);
    expect(screen.getByText(/Not estimable/)).toBeInTheDocument();
    expect(screen.getByText(/No removal request drafted/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download Legal Removal Request" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Policy request templates/));
    for (const name of [
      "Fake Content template",
      "Conflict of Interest template",
      "Spam template",
      "Prohibited Content template",
    ])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Spam template" }));
    expect(screen.getByRole("textbox", { name: "Editable legal policy template" })).toHaveProperty(
      "value",
      expect.stringContaining("Advertising & solicitation"),
    );
  });
  it("labels supported scores as uncalibrated and not a verified probability", () => {
    const metadata = report.report_data;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
      throw new Error("Missing fixture");
    render(
      <LegalAnalysisPanel
        scan={scan}
        reviews={[review]}
        report={{
          ...report,
          report_data: {
            ...metadata,
            legal_analysis: {
              version: LEGAL_VERSION,
              model: "unit",
              generated_at: new Date().toISOString(),
              disclaimer: LEGAL_DISCLAIMER,
              reviews: [
                {
                  ...item,
                  violates_policy: true,
                  removal_likelihood: 60,
                  removal_request_text: "Unit formal draft",
                },
              ],
            },
          },
        }}
      />,
    );
    expect(screen.getByText(/60%.*uncalibrated AI estimate/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Legal Removal Request" })).toBeInTheDocument();
  });
});
