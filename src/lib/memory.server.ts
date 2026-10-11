import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { memoryCaseSchema, similarMemoryCases, type MemoryReview } from "./memory";

export async function loadCaseMemory(db: SupabaseClient<Database>) {
  const rows = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const response = await db
      .from("case_memory")
      .select("*")
      .order("id")
      .range(offset, offset + 499)
      .throwOnError();
    rows.push(...response.data.map((row) => memoryCaseSchema.parse(row)));
    if (response.data.length < 500) return rows;
  }
  throw new Error("Case memory exceeds 50,000 rows; no truncated learning estimate generated.");
}

export async function saveCaseMemory(
  db: SupabaseClient<Database>,
  reviewId: string,
  outcome: "approved" | "rejected" | "pending",
) {
  const { z } = await import("zod");
  z.string().uuid().parse(reviewId);
  z.enum(["approved", "rejected", "pending"]).parse(outcome);
  return db.rpc("save_case_memory", { _review_id: reviewId, _outcome: outcome }).throwOnError();
}

export async function findSimilarCases(db: SupabaseClient<Database>, review: MemoryReview) {
  return similarMemoryCases(review, await loadCaseMemory(db));
}

export async function memoryStats(db: SupabaseClient<Database>) {
  const rows = await loadCaseMemory(db);
  return {
    total: rows.length,
    successful: rows.filter((row) => row.outcome === "approved").length,
    failed: rows.filter((row) => row.outcome === "rejected").length,
    pending: rows.filter((row) => row.outcome === "pending").length,
    prediction_accuracy: null,
    accuracy_reason: "N/A: no prospective, held-out prediction evaluation recorded.",
  };
}
