// Shared scan pipeline used by app server functions and the /api REST routes.
// Every stage transition is recorded in scan_events; failures are recorded in error_events.
import { ScanError, resolveAndFetchPlace, type PlaceResult } from "./google-places.server";
import { analyzeReviews, enforceEvidence, verifyFlags, reviewHash, ANALYSIS_MODEL, AI_PROVIDER, PROMPT_VERSION, type ReviewAnalysis } from "./analysis.server";
import { APP_VERSION } from "./version";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export function cacheKey(url: string) {
  try { const u = new URL(url.trim()); u.hash = ""; return (u.origin + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase(); } catch { return url.trim().toLowerCase(); }
}
/** 24h cache of Google place results keyed by the normalized link, so repeated links cost no Google requests. */
async function cachedPlace(url: string, load: () => Promise<PlaceResult>): Promise<PlaceResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = cacheKey(url);
  const { data: hit } = await supabaseAdmin.from("place_cache").select("payload, fetched_at").eq("place_key", key).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < CACHE_TTL_MS) return hit.payload as unknown as PlaceResult;
  const place = await load();
  await supabaseAdmin.from("place_cache").upsert({ place_key: key, payload: place as any, fetched_at: new Date().toISOString() });
  return place;
}

export type StageResponse = { ok: true; scanId: string; reviews: number } | { ok: false; code: string; message: string; scanId?: string };

export async function audit(supabase: any, userId: string, action: string, detail: Record<string, unknown>, result: "success" | "failure" = "success") {
  const resource = action.split(".")[0];
  const resource_id = (detail["scan_id"] ?? detail["batch_id"] ?? null) as string | null;
  await supabase.from("audit_log").insert({ user_id: userId, action, detail, resource, resource_id, result });
}

export async function track(supabase: any, userId: string, scanId: string, stage: string, startedAt: number, message?: string, errorCode?: string) {
  await supabase.from("scan_events").insert({
    scan_id: scanId, user_id: userId, stage, status: errorCode ? "error" : "ok", message: message ?? null,
    duration_ms: Date.now() - startedAt, error_code: errorCode ?? null,
  });
}

const MODULE: Record<string, string> = {
  INVALID_URL: "google", RESOLVE_FAILED: "google", NOT_FOUND: "google", RATE_LIMIT: "google", API_UNAVAILABLE: "google", GOOGLE_ERROR: "google", NETWORK: "google",
  NO_REVIEWS: "google", AI_UNAVAILABLE: "ai", AI_QUOTA: "ai", AI_AUTH: "ai", DB_UNAVAILABLE: "database", REPORT_ERROR: "report", TIMEOUT: "scan", INSUFFICIENT_DATA: "scan",
};
const SEVERITY: Record<string, string> = { AI_QUOTA: "CRITICAL", AI_AUTH: "CRITICAL", API_UNAVAILABLE: "CRITICAL", DB_UNAVAILABLE: "HIGH", AI_UNAVAILABLE: "HIGH", REPORT_ERROR: "HIGH", RATE_LIMIT: "MEDIUM", GOOGLE_ERROR: "MEDIUM", TIMEOUT: "MEDIUM" };

export async function recordError(supabase: any, userId: string, e: { code: string; message: string; scanId?: string | null; business?: string | null; route?: string }) {
  await supabase.from("error_events").insert({
    user_id: userId, module: MODULE[e.code] ?? "app", route: e.route ?? "scan", scan_id: e.scanId ?? null, business: e.business ?? null,
    code: e.code, message: e.message.slice(0, 500), severity: SEVERITY[e.code] ?? "LOW",
  });
}

export function validGoogleUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return /(^|\.)google\.[a-z.]+$/.test(u.hostname) || /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co)$/.test(u.hostname);
  } catch { return false; }
}

/** Scans stuck in "running" for more than 15 minutes (worker died mid-scan) are marked failed. */
async function sweepStale(supabase: any, userId: string) {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await supabase.from("scans").update({ status: "failed", error: "Scan timed out — the server stopped before it finished. Retry the scan.", completed_at: new Date().toISOString() })
    .eq("user_id", userId).eq("status", "running").lt("created_at", cutoff).select("id");
  for (const s of data ?? []) await recordError(supabase, userId, { code: "TIMEOUT", message: "Scan timed out", scanId: s.id });
}

/** Data quality grade with human-readable reasons. */
function grade(scan: any, analyzed: number, failed: number, reportOk: boolean) {
  const reasons: string[] = [];
  if (!scan.business_name || !scan.address) reasons.push("Business details incomplete");
  if (scan.rating == null) reasons.push("Google rating not available");
  if (!scan.reviews_retrieved) reasons.push("No review data available");
  if (scan.review_links === 0) reasons.push("Review links missing");
  if (failed > 0) reasons.push(`${failed} review(s) failed analysis`);
  if (analyzed < scan.reviews_retrieved) reasons.push("Not every retrieved review was analyzed");
  if (!reportOk) reasons.push("Report could not be generated");
  const q = reasons.length === 0 ? "HIGH" : reasons.length <= 2 && scan.rating != null && analyzed > 0 ? "MEDIUM" : "LOW";
  return { data_quality: q, data_quality_reasons: reasons.length ? reasons : ["All checks passed"] };
}

/** Transparent internal Review Health Score (0-100). Not an official Google score. */
function healthScore(rating: number | null, reviews: { rating: number }[], analyses: ReviewAnalysis[]) {
  if (rating == null || !reviews.length) return null;
  const lowShare = reviews.filter((r) => r.rating <= 2).length / reviews.length;
  const flagged = analyses.filter((a) => a.risk === "high" || a.risk === "medium").length / Math.max(analyses.length, 1);
  const conf = analyses.reduce((s, a) => s + a.confidence, 0) / Math.max(analyses.length, 1) / 100;
  const score = (rating / 5) * 60 + (1 - lowShare) * 15 + (1 - flagged) * 15 + conf * 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Stage 1: resolve business, read public place data, retrieve available reviews. */
export async function scanFetchCore(supabase: any, userId: string, data: { url: string; batchId?: string | undefined }): Promise<StageResponse> {
  if (!validGoogleUrl(data.url)) return { ok: false, code: "INVALID_URL", message: "This isn't a Google Maps or Business link. Paste a link like google.com/maps/place/… or maps.app.goo.gl/…" };
  const googleKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!googleKey) return { ok: false, code: "GOOGLE_API_NOT_CONFIGURED", message: "Google Places API is not configured. Add the API key in Settings." };

  await sweepStale(supabase, userId);
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: dup } = await supabase.from("scans").select("id").eq("user_id", userId).eq("source_url", data.url).eq("status", "running").gte("created_at", since).limit(1);
  if (dup?.length) return { ok: false, code: "SCAN_IN_PROGRESS", message: "A scan for this link is already running. Please wait for it to finish.", scanId: dup[0]!.id };
  const t0 = Date.now();
  const { data: scan, error } = await supabase.from("scans")
    .insert({ user_id: userId, source_url: data.url, status: "running", stage: "fetch", data_source: "google_places", batch_id: data.batchId ?? null })
    .select("id").single();
  if (error || !scan) {
    await recordError(supabase, userId, { code: "DB_UNAVAILABLE", message: error?.message ?? "scan insert failed" });
    return { ok: false, code: "DB_UNAVAILABLE", message: "Database unavailable — the scan could not be saved." };
  }
  await track(supabase, userId, scan.id, "CREATED", t0, data.batchId ? "Queued as part of a batch" : undefined);
  await audit(supabase, userId, "scan.started", { scan_id: scan.id, url: data.url });

  try {
    let t = Date.now();
    await track(supabase, userId, scan.id, "PROCESSING", t);
    const place = await cachedPlace(data.url, () => resolveAndFetchPlace(googleKey, data.url, async (cid) => {
      const { data: hit } = await supabase.from("businesses").select("place_id").eq("user_id", userId)
        .or(`maps_uri.ilike.%cid=${cid}&%,maps_uri.ilike.%cid=${cid}`).not("place_id", "is", null).limit(1);
      return hit?.[0]?.place_id ?? null;
    }));
    await track(supabase, userId, scan.id, "BUSINESS_RESOLVED", t, place.name);
    const biz = await supabase.from("businesses").upsert({
      user_id: userId, place_id: place.placeId, name: place.name, category: place.category, address: place.address,
      rating: place.rating, total_reviews: place.totalReviews, maps_uri: place.mapsUri, latitude: place.latitude, longitude: place.longitude, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,place_id" }).select("id").single();
    if (biz.error) throw new ScanError("DB_UNAVAILABLE", "Database unavailable — business could not be saved.");
    await track(supabase, userId, scan.id, "RATING_RETRIEVED", t, `Rating ${place.rating ?? "n/a"} from ${place.totalReviews ?? 0} Google reviews`);

    t = Date.now();
    if (place.reviews.length) {
      const rows = await Promise.all(place.reviews.map(async (r) => ({
        scan_id: scan.id, author: r.author, author_uri: r.authorUri, rating: r.rating, published_at: r.publishedAt,
        relative_time: r.relativeTime, text: r.text, review_uri: r.reviewUri, processing_status: "STORED", content_hash: await reviewHash(r.text, r.rating),
      })));
      const ins = await supabase.from("reviews").insert(rows);
      if (ins.error) throw new ScanError("DB_UNAVAILABLE", "Database unavailable — reviews could not be saved.");
    }
    await track(supabase, userId, scan.id, "REVIEWS_RETRIEVED", t, `${place.reviews.length} available review(s) retrieved and stored`);
    const upd = await supabase.from("scans").update({
      business_id: biz.data.id, place_id: place.placeId, business_name: place.name, category: place.category, address: place.address,
      rating: place.rating, total_reviews: place.totalReviews, maps_uri: place.mapsUri, reviews_retrieved: place.reviews.length,
      api_rating_raw: place.rating, api_total_reviews_raw: place.totalReviews,
      stage: "analyze", ...(place.reviews.length === 0 ? { status: "failed", error: "No available reviews were returned for this business.", completed_at: new Date().toISOString() } : {}),
    }).eq("id", scan.id);
    if (upd.error) throw new ScanError("DB_UNAVAILABLE", "Database unavailable — scan could not be updated.");
    if (place.reviews.length === 0) {
      await track(supabase, userId, scan.id, "FAILED", t, "No available reviews", "NO_REVIEWS");
      await recordError(supabase, userId, { code: "NO_REVIEWS", message: "No available reviews were returned", scanId: scan.id, business: place.name });
      return { ok: false, code: "NO_REVIEWS", message: "No available reviews were returned for this business.", scanId: scan.id };
    }
    return { ok: true, scanId: scan.id, reviews: place.reviews.length };
  } catch (e) {
    return fail(supabase, userId, scan.id, e, t0);
  }
}

/** Stage 2: analyze review signals (with cache + second-model verification), classify risk, prepare report. */
export async function scanAnalyzeCore(supabase: any, userId: string, data: { scanId: string }): Promise<StageResponse> {
  const aiKey = process.env["OPENAI_API_KEY"];
  const t0 = Date.now();
  const { data: scan } = await supabase.from("scans").select("*").eq("id", data.scanId).eq("user_id", userId).maybeSingle();
  if (!scan) return { ok: false, code: "NOT_FOUND", message: "Scan not found." };
  if (scan.status === "complete") return { ok: true, scanId: scan.id, reviews: scan.reviews_retrieved };
  if (!aiKey) return fail(supabase, userId, scan.id, new ScanError("AI_UNAVAILABLE", "AI analysis is unavailable — OPENAI_API_KEY is not configured."), t0);
  try {
    const { data: reviews, error } = await supabase.from("reviews").select("*").eq("scan_id", scan.id).order("created_at");
    if (error) throw new ScanError("DB_UNAVAILABLE", "Database unavailable.");
    if (!reviews?.length) throw new ScanError("INSUFFICIENT_DATA", "Insufficient data — no reviews to analyze.");
    let t = Date.now();
    await track(supabase, userId, scan.id, "REVIEWS_ANALYZING", t, `${reviews.length} review(s)`);

    // Cache: reuse an earlier analysis of identical text+rating with the same prompt & app version.
    const hashes = reviews.map((r: any) => r.content_hash).filter(Boolean);
    const { data: cachedRows } = hashes.length
      ? await supabase.from("review_analyses").select("content_hash, risk, category, signals, reason, evidence, confidence, verification").in("content_hash", hashes).eq("analysis_version", APP_VERSION).eq("prompt_version", PROMPT_VERSION)
      : { data: [] };
    const cache = new Map((cachedRows ?? []).map((c: any) => [c.content_hash, c]));
    const todo = reviews.filter((r: any) => !cache.has(r.content_hash));
    const fresh = todo.length ? await analyzeReviews(aiKey, scan.business_name ?? "", scan.category, todo.map((r: any) => ({
      author: r.author, authorUri: r.author_uri, rating: r.rating, publishedAt: r.published_at, relativeTime: r.relative_time, text: r.text ?? "", reviewUri: r.review_uri,
    }))) : [];
    const freshById = new Map<string, ReviewAnalysis>(todo.map((r: any, i: number) => [r.id, enforceEvidence(fresh[i]!)]));

    // Second-model verification for new high/medium flags.
    const toVerify = todo.filter((r: any) => ["high", "medium"].includes(freshById.get(r.id)!.risk));
    const verdicts = await verifyFlags(aiKey, toVerify.map((r: any) => ({ text: r.text ?? "", rating: r.rating, first: freshById.get(r.id)! })));
    const verById = new Map<string, any>(toVerify.map((r: any, i: number) => [r.id, verdicts[i]]));

    const final = reviews.map((r: any) => {
      const c: any = cache.get(r.content_hash);
      if (c) return { review: r, a: { risk: c.risk, category: c.category, signals: c.signals, reason: c.reason, evidence: c.evidence, confidence: c.confidence } as ReviewAnalysis, verification: c.verification, cached: true };
      let a = freshById.get(r.id)!;
      const v: any = verById.get(r.id);
      if (v && "agrees" in v && !v.agrees) a = { ...a, risk: "requires_review", reason: `${a.reason} Second model disagreed: ${v.reason}` };
      return { review: r, a, verification: v ?? null, cached: false };
    });
    const ins = await supabase.from("review_analyses").insert(final.map((f: any) => ({
      review_id: f.review.id, scan_id: scan.id, model: ANALYSIS_MODEL, analysis_provider: AI_PROVIDER, analysis_version: APP_VERSION,
      prompt_version: PROMPT_VERSION, content_hash: f.review.content_hash, verification: f.verification, cached: f.cached, ...f.a,
    })));
    if (ins.error) throw new ScanError("DB_UNAVAILABLE", "Database unavailable — analysis could not be saved.");
    const failedIds = final.filter((f: any) => f.a.confidence === 0 && f.a.risk === "requires_review").map((f: any) => f.review.id);
    await supabase.from("reviews").update({ processing_status: "ANALYZED" }).eq("scan_id", scan.id);
    if (failedIds.length) await supabase.from("reviews").update({ processing_status: "FAILED" }).in("id", failedIds);
    await track(supabase, userId, scan.id, "ANALYSIS_COMPLETED", t, `${todo.length} analyzed, ${reviews.length - todo.length} reused from cache, ${toVerify.length} verified by second model`);

    const analysis = final.map((f: any) => f.a as ReviewAnalysis);
    const n = (k: string) => analysis.filter((a: ReviewAnalysis) => a.risk === k).length;
    const high = n("high"), medium = n("medium");

    t = Date.now();
    await track(supabase, userId, scan.id, "REPORT_GENERATING", t);
    const recommended = high + medium > 0
      ? `Review the ${high + medium} flagged review(s) and, where you believe Google policy is violated, report each one through the official Google reporting path with the evidence below.`
      : "No potentially risky reviews detected among the available reviews. No reporting action recommended.";
    const rep = await supabase.from("reports").insert({
      scan_id: scan.id, user_id: userId, report_number: "RPT-" + scan.id.replace(/-/g, "").slice(0, 8).toUpperCase(), recommended_action: recommended,
      summary: `${reviews.length} available review(s) analyzed: ${high} high, ${medium} medium, ${n("normal")} normal, ${n("requires_review")} requires review.`,
      high_risk_count: high, medium_risk_count: medium, normal_count: n("normal"),
      report_data: { business: scan.business_name, rating: scan.rating, total_reviews: scan.total_reviews, reviews_retrieved: reviews.length, analysis_version: APP_VERSION, prompt_version: PROMPT_VERSION, model: ANALYSIS_MODEL },
    });
    const reportOk = !rep.error;
    if (!reportOk) await recordError(supabase, userId, { code: "REPORT_ERROR", message: rep.error.message, scanId: scan.id, business: scan.business_name });

    // Rating verification: stored value must equal the raw Google value captured at fetch time.
    const mismatch = scan.api_rating_raw != null && Number(scan.rating) !== Number(scan.api_rating_raw);
    if (mismatch) await recordError(supabase, userId, { code: "RATING_DATA_MISMATCH", message: `Stored ${scan.rating} vs Google ${scan.api_rating_raw}`, scanId: scan.id, business: scan.business_name });
    const links = reviews.filter((r: any) => r.review_uri).length;

    // Seed action-center rows for flagged reviews.
    const flagged = final.filter((f: any) => f.a.risk === "high" || f.a.risk === "medium");
    if (flagged.length) await supabase.from("review_actions").upsert(flagged.map((f: any) => ({
      review_id: f.review.id, scan_id: scan.id, user_id: userId, status: f.review.review_uri ? "GOOGLE_REPORTING_PATH_AVAILABLE" : "ACTION_RECOMMENDED",
    })), { onConflict: "review_id", ignoreDuplicates: true });

    await supabase.from("scans").update({
      status: "complete", stage: "done", high_count: high, medium_count: medium, normal_count: n("normal"), requires_review_count: n("requires_review"),
      completed_at: new Date().toISOString(), rating_mismatch: mismatch, reviews_failed_analysis: failedIds.length,
      review_health_score: healthScore(scan.rating == null ? null : Number(scan.rating), reviews, analysis),
      ...grade({ ...scan, review_links: links }, analysis.length - failedIds.length, failedIds.length, reportOk),
    }).eq("id", scan.id);
    await track(supabase, userId, scan.id, reportOk ? "REPORT_READY" : "FAILED", t, reportOk ? undefined : "Report could not be saved", reportOk ? undefined : "REPORT_ERROR");
    if (reportOk && flagged.length) await track(supabase, userId, scan.id, "ACTION_AVAILABLE", t, `${flagged.length} review(s) in the Action Center`);
    await audit(supabase, userId, "scan.completed", { scan_id: scan.id, high, medium });
    return { ok: true, scanId: scan.id, reviews: reviews.length };
  } catch (e) {
    await supabase.from("reviews").update({ processing_status: "FAILED" }).eq("scan_id", scan.id).neq("processing_status", "ANALYZED");
    return fail(supabase, userId, scan.id, e, t0, scan.business_name);
  }
}

async function fail(supabase: any, userId: string, scanId: string, e: unknown, t0: number, business?: string | null): Promise<StageResponse> {
  const code = e instanceof ScanError ? e.code : "UNKNOWN";
  const message = e instanceof Error ? e.message : "Unexpected error.";
  console.error("scan failed", code, message);
  await supabase.from("scans").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", scanId);
  await track(supabase, userId, scanId, "FAILED", t0, message, code);
  await recordError(supabase, userId, { code, message, scanId, business: business ?? null });
  await audit(supabase, userId, "scan.failed", { scan_id: scanId, code }, "failure");
  return { ok: false, code, message, scanId };
}
