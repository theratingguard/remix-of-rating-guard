import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { checkRemovalStatus } from "../src/lib/status-polling.server";

try {
  console.log(JSON.stringify(await checkRemovalStatus(supabaseAdmin)));
} catch (error) {
  console.error("[submission-followup]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
