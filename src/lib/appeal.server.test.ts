import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateRejectedAppeal } from "./appeal.server";
import { readOpenAIStream } from "./openai-stream.server";
import { LEGAL_DISCLAIMER, LEGAL_POLICY_URL, LEGAL_VERSION } from "./legal-analysis";
vi.mock("./openai-stream.server", () => ({ readOpenAIStream: vi.fn() }));
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { requireFeature: async () => defaultSettings };
});
const id = "00000000-0000-4000-8000-000000000001";
const quote = "Buy our discount packages";
const legal = {
  review_id: id,
  violates_policy: true,
  policy_type: "Spam",
  policy_section: "Advertising & solicitation",
  policy_url: LEGAL_POLICY_URL,
  evidence_quote: quote,
  legal_grounds: "No legal violation established.",
  removal_request_text: "Original draft",
  supporting_docs: [],
  removal_likelihood: 40,
  reasoning: "Source contains advertising.",
};
function database(
  options: { role?: string; decision?: string; submitted?: boolean; supported?: boolean } = {},
) {
  const writes: unknown[] = [];
  const client = createClient<Database>("https://unit-fixture.supabase.co", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const table = url.pathname.split("/").at(-1);
        if (table === "report_access_level") return Response.json(options.role ?? "super_admin");
        if (table === "removal_outcomes")
          return Response.json({
            id,
            outcome: options.decision ?? "rejected",
            scan_id: id,
            review_id: id,
            request_text: "Original actual request",
            verification_reference: "Recorded decision reference",
          });
        if (table === "reports")
          return Response.json({
            report_data: {
              legal_analysis: {
                version: LEGAL_VERSION,
                generated_at: new Date().toISOString(),
                model: "fixture",
                disclaimer: LEGAL_DISCLAIMER,
                reviews: [{ ...legal, violates_policy: options.supported !== false }],
              },
            },
          });
        if (table === "reviews")
          return Response.json({
            id,
            author: "Fixture",
            rating: 1,
            text: `${quote} at spam.example`,
            published_at: null,
            relative_time: null,
            review_uri: null,
            review_analyses: [
              {
                risk: "high",
                category: "Spam",
                signals: ["Advertising"],
                reason: "Advertising",
                evidence: quote,
                confidence: 70,
                model: "fixture",
              },
            ],
          });
        if (table === "appeal_tracking") {
          if (init?.method === "PATCH") {
            writes.push(JSON.parse(String(init.body)));
            return Response.json({ id });
          }
          return Response.json({
            id,
            status: "needed",
            submitted_at: options.submitted ? new Date().toISOString() : null,
          });
        }
        throw new Error(`Unexpected fixture table ${table}`);
      },
    },
  });
  return { client, writes };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("AI appeal evidence and privilege boundaries", () => {
  it("denies ordinary accounts, pending decisions, submitted appeals and unsupported evidence before paid calls", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const options of [
      { role: "summary" },
      { decision: "pending" },
      { submitted: true },
      { supported: false },
    ])
      await expect(generateRejectedAppeal(database(options).client, id)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("saves only a measured 200-300-word draft preserving the exact evidence and policy", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    const draft = `Advertising & solicitation ${quote} ${"assessment ".repeat(230)}`.trim();
    vi.mocked(readOpenAIStream).mockResolvedValue(JSON.stringify({ appeal_draft: draft }));
    const db = database();
    expect(await generateRejectedAppeal(db.client, id)).toEqual({ draft });
    expect(db.writes).toEqual([{ appeal_draft: draft, status: "draft" }]);
  });
  it("rejects invented evidence and invalid word counts without saving a draft", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    for (const draft of [
      "Short unsupported draft",
      `Advertising & solicitation ${"assessment ".repeat(230)}`,
    ]) {
      vi.mocked(readOpenAIStream).mockResolvedValue(JSON.stringify({ appeal_draft: draft }));
      const db = database();
      await expect(generateRejectedAppeal(db.client, id)).rejects.toThrow();
      expect(db.writes).toEqual([]);
    }
  });
});
