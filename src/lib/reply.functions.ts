import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const REPLY_MODEL = "gpt-4.1-mini";
export const REPLY_TONES = ["professional", "friendly", "calm", "apologetic", "firm", "short", "detailed"] as const;

export type ReplySuggestion = { summary: string; riskExplanation: string; recommendedAction: string; reply: string; tone: string; model: string };

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", err: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "error" || ev.type === "response.failed") err = ev.error?.message ?? ev.response?.error?.message ?? "AI request failed.";
      } catch { /* partial */ }
    }
  }
  if (err) throw new Error(err);
  return text;
}

/** Vala AI — review intelligence assistant: summary, risk explanation and an editable reply draft. */
export const suggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: z.string().uuid(), tone: z.enum(REPLY_TONES) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; suggestion: ReplySuggestion } | { ok: false; message: string }> => {
    const { supabase, userId } = context;
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) return { ok: false, message: "AI service is not configured — OPENAI_API_KEY missing." };

    const { data: r, error } = await supabase
      .from("reviews")
      .select("id, scan_id, author, rating, text, review_analyses(risk, category, reason, evidence), scans(business_name, category)")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (error) return { ok: false, message: "Database unavailable — could not load the review." };
    if (!r) return { ok: false, message: "Review not found." };
    const a: any = Array.isArray((r as any).review_analyses) ? (r as any).review_analyses[0] : (r as any).review_analyses;
    const s: any = (r as any).scans;

    const instructions = `You are Vala AI, a review intelligence assistant for a business owner replying to a Google review.
Rules for the reply: address what the review actually says; never invent facts, names, dates or offers; never admit legal liability; never attack or accuse the reviewer; never promise impossible actions; never mention AI, internal analysis, risk flags or reporting; never claim Google removed anything; concise and human.
Positive review → appreciation. Normal negative → calm customer-service reply inviting offline contact. Potentially risky → cautious, neutral reply.
Tone requested: ${data.tone}.
A negative review is not a policy violation. Explain risk only from the given analysis; if none, say no clear policy concern.
Return ONLY JSON: {"summary": string (1 sentence), "riskExplanation": string (1-2 sentences), "recommendedAction": string (1 sentence), "reply": string}`;
    const input = `Business: ${s?.business_name ?? "the business"} (${s?.category ?? "unknown category"})
Reviewer: ${r.author}
Rating: ${r.rating}/5
Review text: ${r.text || "(no text — rating only)"}
Analysis: ${a ? `risk=${a.risk}; category=${a.category ?? "none"}; reason=${a.reason ?? "-"}; evidence=${a.evidence ?? "-"}` : "not analyzed"}`;

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: REPLY_MODEL, instructions, input: [{ role: "user", content: input }],
          stream: true, store: false,
        }),
      });
    } catch { return { ok: false, message: "AI service is unreachable. Try again shortly." }; }
    if (!res.ok) {
      let msg = "";
      try { const j = await res.json(); msg = j?.error?.message ?? j?.message ?? ""; } catch { /* noop */ }
      if (res.status === 429) return { ok: false, message: "AI is rate limited. Wait a minute and try again." };
      if (res.status === 402) return { ok: false, message: msg || "OpenAI quota reached. Add credit to your OpenAI account." };
      return { ok: false, message: msg || `AI service error [${res.status}].` };
    }
    let text: string;
    try { text = await readStream(res); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "AI request failed." }; }
    let p: any;
    try { p = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return { ok: false, message: "The reply suggestion could not be read. Try again." }; }
    if (!p?.reply) return { ok: false, message: "The AI returned no reply." };

    await supabase.from("audit_log").insert({ user_id: userId, action: "review.reply_suggested", detail: { review_id: r.id, scan_id: r.scan_id, tone: data.tone, model: REPLY_MODEL } });
    return { ok: true, suggestion: { summary: String(p.summary ?? ""), riskExplanation: String(p.riskExplanation ?? ""), recommendedAction: String(p.recommendedAction ?? ""), reply: String(p.reply), tone: data.tone, model: REPLY_MODEL } };
  });
