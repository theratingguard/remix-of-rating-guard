import { z } from "zod";
import { ScanError } from "../google-places.server";

export function boundAiRequest(url: string, init: RequestInit) {
  if (typeof init.body !== "string") throw new Error("AI budget requires a serialized request.");
  const body = z.record(z.unknown()).parse(JSON.parse(init.body));
  const host = new URL(url).hostname;
  if (!["api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com"].includes(host))
    throw new Error("Unrecognized paid AI provider.");
  const inputBytes = Buffer.byteLength(init.body);
  if (inputBytes > 200000) throw new Error("AI input exceeds the bounded budget request size.");
  // UTF-8 bytes conservatively bound input tokens; reserved amounts are never
  // refunded on uncertain timeouts. This is a conservative admission cap, not an invoice.
  const model =
    typeof body["model"] === "string" ? body["model"] : url.split("/models/")[1]?.split(":")[0];
  const prices: Record<string, [number, number]> = {
    "gpt-4o": [2.5, 10],
    "gpt-4.1-mini": [0.4, 1.6],
    "gpt-4o-mini": [0.15, 0.6],
    "claude-sonnet-4-6": [3, 15],
    "gemini-3.8-flash": [5, 25],
  };
  const price = model ? prices[model] : undefined;
  if (!price) throw new Error("AI model has no configured budget bound.");
  let output = 6000;
  if (host === "generativelanguage.googleapis.com") {
    const config = z.record(z.unknown()).parse(body["generationConfig"] ?? {});
    output = z
      .number()
      .int()
      .min(1)
      .max(8000)
      .parse(config["maxOutputTokens"] ?? 6000);
    body["generationConfig"] = { ...config, maxOutputTokens: output };
  } else {
    const field = url.endsWith("/responses") ? "max_output_tokens" : "max_tokens";
    output = z
      .number()
      .int()
      .min(1)
      .max(8000)
      .parse(body[field] ?? 6000);
    body[field] = output;
  }
  return {
    body: JSON.stringify(body),
    cost: Math.ceil((((inputBytes + 2048) * price[0] + output * price[1]) / 1e6) * 1e6) / 1e6,
  };
}
export async function budgetedAiFetch(url: string, init: RequestInit) {
  if (process.env["MULTI_WORKER_ENABLED"] !== "true") return fetch(url, init);
  const bound = boundAiRequest(url, init);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admitted = await supabaseAdmin
    .rpc("reserve_ai_budget", { _cost: bound.cost })
    .throwOnError();
  if (!admitted.data)
    throw new ScanError(
      "AI_BUDGET_LIMIT",
      "$10 daily AI reservation cap reached. Pending worker jobs wait until the next UTC day.",
    );
  return fetch(url, { ...init, body: bound.body });
}
