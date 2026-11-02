import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateSmartReply } from "./reply-rag.server";

const sampleReply =
  "Thank you for sharing your experience. We review feedback carefully and want to understand the specific circumstances before drawing conclusions. A public comment may not provide enough context to verify every detail, so we avoid assumptions and protect private information. Please contact our support team through the details on our profile so we can review your concerns privately and provide a clear response.";

function makeDatabase() {
  const examples = Array.from({ length: 3 }, (_, index) => ({
    question: `Synthetic review ${index + 1}`,
    answer: `Synthetic reply ${index + 1}`,
    rating_band: 2,
    industry: "hotel",
    issue_type: "timing",
    similarity: 0.9 - index * 0.1,
  }));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(examples), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  const db = createClient<Database>("https://db.example", "test-key", {
    global: { fetch: fetcher },
    auth: { persistSession: false },
  });
  return { db, fetcher };
}

describe("RAG review reply generation", () => {
  it("embeds locally, retrieves three examples, and includes them in the Ollama prompt", async () => {
    const { db, fetcher } = makeDatabase();
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith("/api/embed")) {
        return new Response(JSON.stringify({ embeddings: [Array(768).fill(0.1)] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ response: sampleReply }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      generateSmartReply("The wait was longer than expected.", 2, "hotel", db, {
        request,
        ollamaBaseUrl: "http://ollama.test",
      }),
    ).resolves.toBe(sampleReply);

    expect(fetcher).toHaveBeenCalledOnce();
    const rpcRequest = fetcher.mock.calls[0]?.[0];
    expect(String(rpcRequest)).toContain("/rpc/match_reply_training_data");
    const rpcBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      match_count: number;
      query_industry: string;
      query_rating: number;
    };
    expect(rpcBody).toEqual({
      query_embedding: expect.any(String),
      query_rating: 2,
      query_industry: "hotel",
      match_count: 3,
    });

    const generation = JSON.parse(String(request.mock.calls[1]?.[1]?.body)) as {
      model: string;
      prompt: string;
      system: string;
    };
    expect(generation.model).toBe("ratingguard-reply");
    expect(generation.prompt).toContain("Synthetic review 3");
    expect(generation.prompt).toContain("The wait was longer than expected.");
    expect(generation.system).toContain("Never invent policies, staff actions, hygiene standards");
    expect(generation.system).toContain("45 to 110 words");
  });

  it("rejects embedding models with dimensions incompatible with the database vector", async () => {
    const { db } = makeDatabase();
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [Array(384).fill(0)] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(generateSmartReply("Review text", 4, "cafe", db, { request })).rejects.toThrow(
      "must return 768 dimensions",
    );
  });

  it("rejects model replies outside the required word range", async () => {
    const { db } = makeDatabase();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embeddings: [Array(768).fill(0)] }), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: "Too short." }), {
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      generateSmartReply("Review text", 1, "restaurant", db, { request }),
    ).rejects.toThrow("expected 45-110");
  });
});
