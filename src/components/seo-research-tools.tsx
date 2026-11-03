import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Mail, Save, SearchCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SeoEditorialTemplates } from "@/components/seo-editorial-templates";
import { supabase } from "@/integrations/supabase/client";
import { analyzeSemanticContent, type SemanticAnalysis } from "@/lib/seo/semantic-analyzer";

type BacklinkTarget = {
  id: string;
  competitor_url: string;
  referring_page_url: string;
  target_domain: string;
  source_type: string;
  anchor_text: string | null;
  notes: string | null;
  outreach_subject: string | null;
  outreach_body: string | null;
};

function safePageUrl(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes("."))
    throw new Error("Enter a public HTTP or HTTPS page URL.");
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    url.hostname.includes(":") ||
    url.username ||
    url.password
  )
    throw new Error("Use a public domain name.");
  return url.toString();
}

export function SeoResearchTools() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [referringUrl, setReferringUrl] = useState("");
  const [sourceType, setSourceType] = useState("editorial");
  const [anchorText, setAnchorText] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [articleText, setArticleText] = useState("");
  const [referenceExcerpts, setReferenceExcerpts] = useState(["", "", ""]);
  const [analysis, setAnalysis] = useState<SemanticAnalysis | null>(null);
  const targets = useQuery({
    queryKey: ["seo-research", "backlinks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backlink_targets")
        .select(
          "id,competitor_url,referring_page_url,target_domain,source_type,anchor_text,notes,outreach_subject,outreach_body",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as BacklinkTarget[];
    },
  });

  async function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const competitor = safePageUrl(competitorUrl);
      const referring = safePageUrl(referringUrl);
      const { error } = await supabase.from("backlink_targets").upsert(
        {
          competitor_url: competitor,
          referring_page_url: referring,
          target_domain: new URL(referring).hostname.toLowerCase(),
          source_type: sourceType,
          anchor_text: anchorText.trim() || null,
        },
        { onConflict: "competitor_url,referring_page_url", ignoreDuplicates: true },
      );
      if (error) throw error;
      toast.success("Target saved for human review.");
      setCompetitorUrl("");
      setReferringUrl("");
      setAnchorText("");
      await queryClient.invalidateQueries({ queryKey: ["seo-research", "backlinks"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save backlink target.");
    } finally {
      setBusy(false);
    }
  }

  async function generateEmail(id: string) {
    setBusy(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sign in again to generate an outreach draft.");
      const response = await fetch("/api/admin/generate-backlink-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId: id }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Could not generate the outreach draft.";
        throw new Error(message);
      }
      toast.success("Outreach email draft saved; review it before sending.");
      await queryClient.invalidateQueries({ queryKey: ["seo-research", "backlinks"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the draft.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (articleText.trim().length < 100 || articleText.length > 30_000)
        throw new Error("Article text must contain 100 to 30,000 characters.");
      const excerpts = referenceExcerpts.map((text) => text.trim()).filter(Boolean);
      if (excerpts.some((excerpt) => excerpt.length > 10_000))
        throw new Error("Each reference excerpt must be no longer than 10,000 characters.");
      const result = analyzeSemanticContent(articleText, targetQuery, excerpts);
      const { error } = await supabase.from("nlp_content_analyses").insert({
        target_query: targetQuery.trim(),
        article_text: articleText,
        reference_excerpts: excerpts,
        extracted_entities: result.extractedEntities,
        missing_topics: result.missingTopics,
        semantic_score: result.semanticScore,
      });
      if (error) throw error;
      setAnalysis(result);
      toast.success("Analysis saved. The score is an editorial coverage heuristic, not a ranking prediction.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze the article.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="seo-research-heading">
      <header>
        <h2 id="seo-research-heading" className="font-display text-2xl font-bold">
          Backlink & content research
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review authorized backlink exports and editorial excerpts. These tools do not scrape
          competitor sites, send emails, or predict search rankings.
        </p>
      </header>
      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div>
            <h3 className="font-semibold">Backlink opportunities</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a referring URL from a backlink report you are authorized to use. Outreach
              drafts are saved for manual review and are never sent automatically.
            </p>
          </div>
          <form onSubmit={(event) => void addTarget(event)} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              Competitor page URL
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="url"
                required
                value={competitorUrl}
                onChange={(event) => setCompetitorUrl(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Referring page URL
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="url"
                required
                value={referringUrl}
                onChange={(event) => setReferringUrl(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Source type
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value)}
              >
                <option value="editorial">Editorial</option>
                <option value="guest_post">Guest post</option>
                <option value="forum">Forum</option>
                <option value="directory">Directory</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Observed anchor (optional)
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                maxLength={300}
                value={anchorText}
                onChange={(event) => setAnchorText(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy} className="md:col-span-2 md:justify-self-start">
              {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Save target
            </Button>
          </form>
          {targets.error && (
            <p role="alert" className="text-sm text-destructive">
              Could not load targets. Ensure the admin migration is applied: {targets.error.message}
            </p>
          )}
          <div className="space-y-3">
            {(targets.data ?? []).map((target) => (
              <article key={target.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-semibold">{target.target_domain} · {target.source_type}</p>
                    <a className="block break-all text-primary underline" href={target.referring_page_url} target="_blank" rel="noreferrer">
                      {target.referring_page_url}
                    </a>
                    <p className="break-all text-xs text-muted-foreground">
                      Competitor reference: {target.competitor_url}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void generateEmail(target.id)}>
                    {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Mail className="mr-2 size-4" />}
                    Generate outreach draft
                  </Button>
                </div>
                {target.outreach_body && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="font-semibold">{target.outreach_subject}</p>
                    <p className="mt-2 whitespace-pre-wrap">{target.outreach_body}</p>
                  </div>
                )}
              </article>
            ))}
            {!targets.isPending && !targets.data?.length && (
              <p className="text-sm text-muted-foreground">No saved backlink targets yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div>
            <h3 className="font-semibold">Semantic content review</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste your article and up to three comparison excerpts you are permitted to use.
              This on-site heuristic highlights topic coverage; it is not BERT/MUM scoring or a
              Google ranking forecast.
            </p>
          </div>
          <form onSubmit={(event) => void analyzeArticle(event)} className="space-y-4">
            <label className="block space-y-1 text-sm">
              Target query
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                minLength={2}
                maxLength={180}
                required
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              Article (100–30,000 characters)
              <textarea
                className="min-h-40 w-full rounded-md border bg-background p-3"
                minLength={100}
                maxLength={30_000}
                required
                value={articleText}
                onChange={(event) => setArticleText(event.target.value)}
              />
            </label>
            <div className="grid gap-3 lg:grid-cols-3">
              {referenceExcerpts.map((excerpt, index) => (
                <label key={index} className="space-y-1 text-sm">
                  Reference excerpt {index + 1} (optional)
                  <textarea
                    className="min-h-28 w-full rounded-md border bg-background p-3"
                    maxLength={10_000}
                    value={excerpt}
                    onChange={(event) =>
                      setReferenceExcerpts((current) =>
                        current.map((value, item) => item === index ? event.target.value : value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <SearchCheck className="mr-2 size-4" />}
              Analyze and save
            </Button>
          </form>
          {analysis && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-lg font-semibold">Topic coverage score: {analysis.semanticScore}/100</p>
              <div>
                <h4 className="text-sm font-semibold">Detected concepts and entities</h4>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {analysis.extractedEntities.map((entity) => (
                    <li key={entity} className="rounded-full border px-3 py-1 text-xs">{entity}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold">Candidate topics absent from your article</h4>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {analysis.missingTopics.map((topic) => (
                    <li key={topic} className="rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1 text-xs text-destructive">{topic}</li>
                  ))}
                  {!analysis.missingTopics.length && <li className="text-sm text-muted-foreground">No missing terms found in the provided references.</li>}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SeoEditorialTemplates />
    </section>
  );
}
