import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { memoryPrediction, type MemoryReview } from "./memory";
import { loadCaseMemory } from "./memory.server";

export async function predictOutcome(db: SupabaseClient<Database>, review: MemoryReview) {
  return memoryPrediction(review, await loadCaseMemory(db));
}
