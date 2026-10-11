import { z } from "zod";
import { budgetedAiFetch } from "./queue/ai-budget.server";
import { getSettings } from "./settings.server";
import { modelKeys, type ModelId } from "./settings";
export const modelStatusSchema = z.object({
  model: z.enum(["gpt", "claude", "gemini"]),
  status: z.enum(["active", "billing", "error", "disabled", "unconfigured"]),
  response_ms: z.number().nonnegative(),
  message: z.string(),
  checked_at: z.string(),
  cost_estimate_usd: z.number().nonnegative().nullable(),
});
export type ModelStatus = z.infer<typeof modelStatusSchema>;
export async function testModel(model: ModelId): Promise<ModelStatus> {
  const settings = await getSettings();
  const index = ["gpt", "claude", "gemini"].indexOf(model);
  const started = Date.now();
  const result = (status: ModelStatus["status"], message: string): ModelStatus => ({
    model,
    status,
    message,
    response_ms: Date.now() - started,
    checked_at: new Date().toISOString(),
    cost_estimate_usd: null,
  });
  if (!settings[modelKeys[index]!])
    return result("disabled", "Disabled in Settings; no paid test call.");
  const key = process.env[["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"][index]!];
  if (!key) return result("unconfigured", "Provider credential not configured.");
  const requests = [
    {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: {
        model: "gpt-4o",
        max_tokens: 20,
        store: false,
        messages: [{ role: "user", content: "Reply exactly OK." }],
      },
    },
    {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 20,
        messages: [{ role: "user", content: "Reply exactly OK." }],
      },
    },
    {
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: {
        contents: [{ parts: [{ text: "Reply exactly OK." }] }],
        generationConfig: { maxOutputTokens: 64 },
      },
    },
  ];
  try {
    const req = requests[index]!;
    const response = await budgetedAiFetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const error = z
        .object({ error: z.object({ message: z.string().optional() }).optional() })
        .safeParse(json);
      const message = error.success ? (error.data.error?.message ?? "") : "";
      const billing =
        response.status === 402 ||
        /credit balance|prepayment|credits.*deplet|insufficient_quota|billing|payment/i.test(
          message,
        );
      return result(
        billing ? "billing" : "error",
        billing
          ? `Provider billing/credits required (HTTP ${response.status}).`
          : `Provider rejected test (HTTP ${response.status}). Check provider configuration.`,
      );
    }
    const output =
      index === 0
        ? z
            .object({
              choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
            })
            .parse(json).choices[0]!.message.content
        : index === 1
          ? z
              .object({
                content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
              })
              .parse(json)
              .content.map((item) => item.text ?? "")
              .join("")
          : z
              .object({
                candidates: z
                  .array(
                    z.object({
                      content: z.object({ parts: z.array(z.object({ text: z.string() })) }),
                    }),
                  )
                  .min(1),
              })
              .parse(json)
              .candidates[0]!.content.parts.map((part) => part.text)
              .join("");
    if (!/\bOK\b/.test(output))
      return result("error", "Provider response did not pass the small text test.");
    const success = result(
      "active",
      "Actual provider test succeeded. Cost excludes taxes, account discounts and provider-specific charges.",
    );
    if (index === 0) {
      const usage = z
        .object({
          usage: z.object({
            prompt_tokens: z.number().nonnegative(),
            completion_tokens: z.number().nonnegative(),
          }),
        })
        .safeParse(json);
      if (usage.success)
        success.cost_estimate_usd =
          (usage.data.usage.prompt_tokens * 2.5 + usage.data.usage.completion_tokens * 10) /
          1000000;
    }
    if (success.cost_estimate_usd === null)
      success.message += " Cost estimate unavailable without verified token pricing.";
    return success;
  } catch (error) {
    console.error(
      "[model-test] Test failed",
      model,
      error instanceof Error ? error.name : "Unknown error",
    );
    return result("error", "Provider timed out, was unreachable, or returned invalid output.");
  }
}
