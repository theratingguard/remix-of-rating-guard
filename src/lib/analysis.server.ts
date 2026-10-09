import type { PlaceReview } from "./google-places.server";
import { ScanError } from "./google-places.server";

export type RiskLevel = "high" | "medium" | "normal" | "requires_review";

export type ReviewAnalysis = {
  risk: RiskLevel;
  category: string | null;
  signals: string[];
  reason: string;
  evidence: string | null;
  confidence: number;
};

export const ANALYSIS_MODEL = "gpt-4.1-mini";
export const AI_PROVIDER = "OpenAI";

const SYSTEM = `You assess the policy risk of Google reviews against Google's prohibited & restricted content policy.
Signals to consider: potential spam, irrelevant/off-topic content, abusive language, potentially deceptive content,
conflict with business context, promotional content, repeated/suspicious patterns, conflict of interest,
personal information, not based on real experience.
CRITICAL: a NEGATIVE review is NOT a policy violation. Genuine negative feedback about a real experience is "normal".
Use "requires_review" when the text is ambiguous or too short to judge.
For each review return: risk (high|medium|normal|requires_review), category (short label or null),
signals (short phrases), reason (one sentence, transparent, never claim certainty of a violation),
evidence (exact quotes from the review text or null), confidence 0-100.`;

export async function analyzeReviews(apiKey: string, businessName: string, category: string | null, reviews: PlaceReview[]): Promise<ReviewAnalysis[]> {
  if (reviews.length === 0) return [];
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Business: ${businessName}${category ? ` (${category})` : ""}\n\n` + reviews.map((r, i) => `#${i} (${r.rating}★, ${r.relativeTime ?? "date unknown"}): ${r.text || "(no text)"}`).join("\n\n") },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "integer" },
                      risk: { type: "string", enum: ["high", "medium", "normal", "requires_review"] },
                      category: { type: ["string", "null"] },
                      signals: { type: "array", items: { type: "string" } },
                      reason: { type: "string" },
                      evidence: { type: ["string", "null"] },
                      confidence: { type: "integer" },
                    },
                    required: ["index", "risk", "signals", "reason", "confidence"],
                  },
                },
              },
              required: ["results"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report" } },
      }),
    });
  } catch {
    throw new ScanError("AI_UNAVAILABLE", "AI analysis is unavailable (network error). Try again.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`OpenAI request failed [${res.status}]: ${body.slice(0, 500)}`);
    if (res.status === 429 && body.includes("insufficient_quota")) throw new ScanError("AI_QUOTA", "OpenAI quota or billing limit reached. Add credit to your OpenAI account, then resume the queue.");
    if (res.status === 429) throw new ScanError("RATE_LIMIT", "OpenAI rate limit reached. Retrying shortly.");
    if (res.status === 401 || res.status === 403) throw new ScanError("AI_AUTH", "OpenAI rejected the API key. Update OPENAI_API_KEY in project secrets.");
    throw new ScanError("AI_UNAVAILABLE", `AI analysis is unavailable [${res.status}].`);
  }
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let results: any[] = [];
  try { results = JSON.parse(args ?? "{}").results ?? []; } catch { /* handled below */ }
  const valid: RiskLevel[] = ["high", "medium", "normal", "requires_review"];
  return reviews.map((_, i) => {
    const r = results.find((x) => x.index === i);
    if (!r) return { risk: "requires_review", category: null, signals: [], reason: "The analysis engine did not return a result for this review.", evidence: null, confidence: 0 };
    return {
      risk: valid.includes(r.risk) ? r.risk : "requires_review",
      category: r.category ?? null,
      signals: Array.isArray(r.signals) ? r.signals.slice(0, 6).map(String) : [],
      reason: String(r.reason ?? ""),
      evidence: r.evidence ?? null,
      confidence: Math.max(0, Math.min(100, Number(r.confidence) || 0)),
    };
  });
}

export const PROMPT_VERSION = "risk-v2";
export const VERIFY_MODEL = "gpt-4o-mini";

/** Explainable guard: a flag must be backed by a quote or signal; a low star rating alone is never a violation. */
export function enforceEvidence(a: ReviewAnalysis): ReviewAnalysis {
  if ((a.risk === "high" || a.risk === "medium") && !a.evidence && a.signals.length === 0) {
    return { ...a, risk: "requires_review", reason: `${a.reason} (Downgraded: no quoted evidence or policy signal was returned.)` };
  }
  return a;
}

export type Verification = { model: string; provider: string; agrees: boolean; risk: RiskLevel; reason: string; checked_at: string } | { model: string; provider: string; error: string; checked_at: string };

/** Second-model check for high/medium flags. Never upgrades risk; disagreement moves the item to "requires_review". */
export async function verifyFlags(apiKey: string, items: { text: string; rating: number; first: ReviewAnalysis }[]): Promise<Verification[]> {
  if (!items.length) return [];
  const now = new Date().toISOString();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VERIFY_MODEL,
        messages: [
          { role: "system", content: SYSTEM + "\nYou are a second, independent reviewer. Another model flagged these reviews. Judge each one yourself. Reply with risk and a one-sentence reason." },
          { role: "user", content: items.map((it, i) => `#${i} (${it.rating}★): ${it.text || "(no text)"}\nFirst model said: ${it.first.risk} — ${it.first.reason}`).join("\n\n") },
        ],
        tools: [{ type: "function", function: { name: "verify", parameters: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, risk: { type: "string", enum: ["high", "medium", "normal", "requires_review"] }, reason: { type: "string" } }, required: ["index", "risk", "reason"] } } }, required: ["results"] } } }],
        tool_choice: { type: "function", function: { name: "verify" } },
      }),
    });
    if (!res.ok) throw new Error(`verifier HTTP ${res.status}`);
    const json = await res.json();
    const out: any[] = JSON.parse(json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}").results ?? [];
    return items.map((it, i) => {
      const r = out.find((x) => x.index === i);
      if (!r) return { model: VERIFY_MODEL, provider: AI_PROVIDER, error: "No verification result returned", checked_at: now };
      const agrees = r.risk === "high" || r.risk === "medium";
      return { model: VERIFY_MODEL, provider: AI_PROVIDER, agrees, risk: r.risk, reason: String(r.reason ?? ""), checked_at: now };
    });
  } catch (e) {
    return items.map(() => ({ model: VERIFY_MODEL, provider: AI_PROVIDER, error: (e as Error).message, checked_at: now }));
  }
}

export async function reviewHash(text: string, rating: number) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${PROMPT_VERSION}|${rating}|${text.trim()}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
