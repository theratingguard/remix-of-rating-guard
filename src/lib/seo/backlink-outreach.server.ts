import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const responseSchema = z.object({
  subject: z.string().trim().min(5).max(180),
  body: z.string().trim().min(80).max(5000),
});

function ollamaUrl() {
  const url = new URL(process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Backlink outreach generation only permits a local Ollama service.");
  return `${url.toString().replace(/\/+$/, "")}/api/generate`;
}

export async function generateBacklinkOutreach(request: Request, targetId: unknown) {
  const idResult = z.string().uuid().safeParse(targetId);
  if (!idResult.success) throw new Error("A valid backlink target is required.");

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized: sign in is required.");

  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey)
    throw new Error("Backlink outreach is not configured: Supabase credentials are missing.");
  const authClient = createClient<Database>(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) throw new Error("Unauthorized: invalid session.");
  const { data: accessLevel, error: accessError } = await authClient.rpc("report_access_level");
  if (accessError) throw new Error("Could not verify administrator access.");
  if (accessLevel !== "super_admin") throw new Error("Super Admin access is required.");

  const { data: target, error: targetError } = await supabaseAdmin
    .from("backlink_targets")
    .select("competitor_url,referring_page_url,target_domain,source_type,anchor_text,notes")
    .eq("id", idResult.data)
    .maybeSingle();
  if (targetError) throw new Error(`Could not load backlink target: ${targetError.message}`);
  if (!target) throw new Error("Backlink target no longer exists.");

  const prompt = [
    "Draft a concise, respectful, honest editorial outreach email.",
    "Return only JSON with string keys subject and body.",
    "Ask whether the editor would consider reviewing Rating Guard as an additional resource; do not demand a link or use manipulative urgency.",
    "Do not imply an existing relationship, claim a partnership, invent product features, or promise reciprocal links.",
    "State that the recipient can decline and that the sender will not follow up unless invited.",
    `Target domain: ${target.target_domain}`,
    `Referring page from admin-provided backlink export: ${target.referring_page_url}`,
    `Competitor URL in that export: ${target.competitor_url}`,
    `Source type: ${target.source_type}`,
    `Observed anchor: ${target.anchor_text ?? "not provided"}`,
    `Admin notes: ${target.notes ?? "none"}`,
    "Our site: https://ratingguard.online",
  ].join("\n");
  const response = await fetch(ollamaUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env["OLLAMA_MODEL"] ?? "llama3.2:3b",
      stream: false,
      format: "json",
      options: { temperature: 0.25, num_ctx: 2048, num_predict: 500 },
      prompt,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}.`);
  const generated = z.object({ response: z.string().max(6000) }).parse(await response.json());
  const draft = responseSchema.parse(JSON.parse(generated.response));
  const { error: saveError } = await supabaseAdmin
    .from("backlink_targets")
    .update({
      outreach_subject: draft.subject,
      outreach_body: draft.body,
      outreach_status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", idResult.data);
  if (saveError) throw new Error(`Could not save outreach draft: ${saveError.message}`);
  return draft;
}
