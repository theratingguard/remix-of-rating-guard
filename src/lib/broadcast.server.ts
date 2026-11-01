import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  broadcastOptionsSchema,
  broadcastResultSchema,
  broadcastStaffSchema,
} from "@/lib/broadcast-schema";

function getAuthenticatedClient(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Sign in is required.");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) {
    throw new Error("Unauthorized: Invalid access token.");
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("Supabase connection is not configured for this deployment.");
  }

  return {
    token,
    supabase: createClient<Database>(url, key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

export async function readBroadcastOptions(request: Request) {
  const { supabase, token } = getAuthenticatedClient(request);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) {
    throw new Error("Unauthorized: Could not verify your session.");
  }
  const { data, error } = await supabase.rpc("broadcast_staff_options");
  if (error) throw new Error(`Could not load broadcast audiences: ${error.message}`);
  return broadcastOptionsSchema.parse(data);
}

export async function sendStaffBroadcast(request: Request, input: unknown) {
  const data = broadcastStaffSchema.parse(input);
  const { supabase, token } = getAuthenticatedClient(request);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) {
    throw new Error("Unauthorized: Could not verify your session.");
  }
  const { data: result, error } = await supabase.rpc("broadcast_staff", {
    _title: data.title,
    _message: data.message,
    _audience: data.audience,
    _team_id: data.audience === "specific_team" ? (data.teamId ?? null) : null,
    _role: data.audience === "specific_role" ? (data.role ?? null) : null,
    _review_url: data.createTask ? data.reviewUrl || null : null,
    _create_task: data.createTask,
  });
  if (error) throw new Error(`Could not broadcast to staff: ${error.message}`);
  return broadcastResultSchema.parse(result);
}
