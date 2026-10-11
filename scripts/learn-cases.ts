import { updateLearning } from "../src/lib/learning.server";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

try {
  const snapshot = await updateLearning(supabaseAdmin);
  console.log(
    JSON.stringify({
      generated_at: snapshot.generated_at,
      decided_cases: snapshot.sample_size,
      patterns: snapshot.patterns.length,
    }),
  );
} catch (error) {
  console.error("[weekly-learning]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
