import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, LoaderCircle, Play, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  getSeoAutomationStatus,
  searchOpenStreetMapLeads,
  triggerSeoAutomation,
  updateSeoProposal,
} from "@/lib/seo-automation.functions";

const connectorLabels = {
  search_console: "Google Search Console",
  ga4: "Google Analytics 4",
  matomo: "Matomo",
  openstreetmap: "OpenStreetMap lead search",
  google_places: "Google Places",
} as const;

function connectionLabel(value: string) {
  if (value === "connected") return "Connected";
  if (value === "not_connected") return "Not connected";
  if (value === "disabled") return "Disabled";
  if (value === "available_free") return "Available · free data";
  return "Not configured";
}

function outlineSections(outline: Json): string[] {
  if (outline === null || typeof outline !== "object" || Array.isArray(outline)) return [];
  const sections = outline["sections"];
  return Array.isArray(sections)
    ? sections.filter((section): section is string => typeof section === "string")
    : [];
}

export function SeoAutomationDashboard() {
  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getSeoAutomationStatus);
  const searchLeads = useServerFn(searchOpenStreetMapLeads);
  const trigger = useServerFn(triggerSeoAutomation);
  const updateProposal = useServerFn(updateSeoProposal);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("3000");
  const [leadCategory, setLeadCategory] = useState<
    | "all"
    | "dentists"
    | "doctors"
    | "hotels"
    | "lawyers"
    | "real_estate"
    | "home_services"
    | "restaurants"
    | "retail"
  >("all");
  const status = useQuery({
    queryKey: ["seo-automation", "status"],
    queryFn: () => loadStatus(),
    refetchInterval: 15_000,
  });
  const content = useQuery({
    queryKey: ["seo-automation", "content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_content_drafts")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const meta = useQuery({
    queryKey: ["seo-automation", "meta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_meta_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const links = useQuery({
    queryKey: ["seo-automation", "links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_link_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const issues = useQuery({
    queryKey: ["seo-automation", "issues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_audit_issues")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const leads = useQuery({
    queryKey: ["seo-automation", "leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_leads")
        .select("*")
        .eq("source", "openstreetmap")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  async function runNow() {
    setBusyId("manual-run");
    try {
      await trigger();
      toast.success("SEO automation run queued.");
      await queryClient.invalidateQueries({ queryKey: ["seo-automation"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not queue the SEO automation run.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reviewProposal(
    table: "seo_content_drafts" | "seo_meta_suggestions" | "seo_link_suggestions",
    id: string,
    decision: "approved" | "rejected",
  ) {
    setBusyId(id);
    try {
      const result = await updateProposal({ data: { table, id, status: decision } });
      if (!result.updated) throw new Error("This suggestion is no longer pending.");
      toast.success(
        decision === "approved"
          ? "Suggestion approved for manual implementation."
          : "Suggestion rejected.",
      );
      await queryClient.invalidateQueries({ queryKey: ["seo-automation"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not review this suggestion.");
    } finally {
      setBusyId(null);
    }
  }

  async function findLeads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("osm-search");
    try {
      const result = await searchLeads({
        data: {
          latitude: Number(latitude),
          longitude: Number(longitude),
          radiusMeters: Number(radiusMeters),
          category: leadCategory,
        },
      });
      toast.success(`Saved ${result.saved} OpenStreetMap business listings.`);
      if (result.found !== result.saved)
        toast.info("Unnamed or previously saved map listings were not added again.");
      await queryClient.invalidateQueries({ queryKey: ["seo-automation", "leads"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OpenStreetMap search failed.");
    } finally {
      setBusyId(null);
    }
  }

  const loadError = [
    status.error,
    content.error,
    meta.error,
    links.error,
    issues.error,
    leads.error,
  ].find(Boolean);
  const run = status.data?.last_run;

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Superadmin controls</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">SEO Automation</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Daily, capped technical audits and local Ollama suggestions. Nothing is published or
            applied to live metadata automatically.
          </p>
        </div>
        <Button onClick={() => void runNow()} disabled={busyId !== null || status.isPending}>
          {busyId === "manual-run" ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <Play className="mr-2 size-4" />
          )}
          Run now
        </Button>
      </header>

      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          Could not load all SEO automation data. Ensure the SEO migration is applied and the
          superadmin session is valid. Details: {loadError.message}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Worker status">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Worker status</p>
            <p className="mt-2 text-xl font-semibold">
              {status.isPending
                ? "Checking…"
                : status.data?.worker === "not_running"
                  ? "Not running"
                  : status.data?.worker === "active"
                    ? "Running · active"
                    : "Running · idle"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Schedule: {status.data?.schedule ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Last run</p>
            <p className="mt-2 text-sm font-semibold">
              {run ? new Date(run.started_at).toLocaleString() : "No run recorded"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {run
                ? `${run.status} · ${run.tasks_completed} proposals · ${run.audit_pages} pages · ${run.issue_count} issues`
                : "Daily schedule set for 03:00 UTC"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tasks completed today: {status.data?.tasks_completed_today ?? "—"}
            </p>
            {run?.error && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {run.error}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Local Ollama</p>
            <p className="mt-2 text-xl font-semibold">
              {status.data?.ollama === "connected"
                ? "Model available"
                : status.data?.ollama === "model_missing"
                  ? "Model not installed"
                  : status.isPending
                    ? "Checking…"
                    : "Not connected"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Model: {status.data?.ollama_model ?? "llama3.2:3b"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Queued / active jobs</p>
            <p className="mt-2 text-xl font-semibold">
              {status.data
                ? `${status.data.queue["waiting"]} / ${status.data.queue["active"]}`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Concurrency: 1 · prevent overlapping runs
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-semibold">Free integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Provider credentials and data connections are reported honestly; none are treated as
            connected until configured and verified.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(connectorLabels).map(([key, label]) => {
              const value =
                status.data?.connectors[key as keyof typeof connectorLabels] ?? "not_configured";
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  key={key}
                >
                  <span>{label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {connectionLabel(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="font-semibold">Free business discovery · OpenStreetMap</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search businesses around a coordinate. OpenStreetMap does not provide verified review
              counts or ratings; those fields remain empty rather than being inferred.
            </p>
          </div>
          <form
            onSubmit={(event) => void findLeads(event)}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <label className="space-y-1 text-sm">
              Latitude
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="number"
                min="-90"
                max="90"
                step="any"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Longitude
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="number"
                min="-180"
                max="180"
                step="any"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Radius (meters)
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="number"
                min="500"
                max="10000"
                step="500"
                value={radiusMeters}
                onChange={(event) => setRadiusMeters(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Category
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={leadCategory}
                onChange={(event) => setLeadCategory(event.target.value as typeof leadCategory)}
              >
                <option value="all">All businesses</option>
                <option value="dentists">Dentists</option>
                <option value="doctors">Doctors and clinics</option>
                <option value="hotels">Hotels and guest houses</option>
                <option value="lawyers">Lawyers</option>
                <option value="real_estate">Real estate</option>
                <option value="home_services">Home services</option>
                <option value="restaurants">Restaurants and cafes</option>
                <option value="retail">Retail</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button type="submit" disabled={busyId !== null} className="w-full">
                {busyId === "osm-search" && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                Search free map data
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              Saved OpenStreetMap leads ({leads.data?.length ?? "—"})
            </h3>
            {(leads.data ?? []).map((lead) => (
              <article
                key={lead.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{lead.business_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lead.category ?? "Business"} · {lead.address ?? "Address unavailable"}
                  </p>
                  {lead.website_url && (
                    <a
                      className="text-xs text-primary underline"
                      href={lead.website_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lead.website_url}
                    </a>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Rating / reviews: unavailable in OSM
                </span>
              </article>
            ))}
            {!leads.isPending && !leads.data?.length && (
              <p className="text-sm text-muted-foreground">No saved OpenStreetMap leads yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <h2 className="font-semibold">Technical SEO issues ({issues.data?.length ?? "—"})</h2>
            {(issues.data ?? []).map((issue) => (
              <article key={issue.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {issue.issue_type.replaceAll("_", " ")} · {issue.severity}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{issue.page_url}</p>
                {typeof issue.details === "object" &&
                  issue.details !== null &&
                  Object.keys(issue.details).length > 0 && (
                    <pre className="mt-2 overflow-x-auto text-xs">
                      {JSON.stringify(issue.details, null, 2)}
                    </pre>
                  )}
              </article>
            ))}
            {!issues.isPending && !issues.data?.length && (
              <p className="text-sm text-muted-foreground">No open issues recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <h2 className="font-semibold">
              Pending content outlines ({content.data?.length ?? "—"})
            </h2>
            {(content.data ?? []).map((draft) => (
              <article key={draft.id} className="rounded-lg border p-3">
                <p className="font-medium">{draft.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keyword: {draft.target_keyword}
                </p>
                <ul className="mt-2 list-inside list-disc text-sm">
                  {outlineSections(draft.outline).map((section, index) => (
                    <li key={`${draft.id}-${index}`}>{section}</li>
                  ))}
                </ul>
                <ReviewActions
                  busy={busyId === draft.id}
                  onApprove={() => void reviewProposal("seo_content_drafts", draft.id, "approved")}
                  onReject={() => void reviewProposal("seo_content_drafts", draft.id, "rejected")}
                />
              </article>
            ))}
            {!content.isPending && !content.data?.length && (
              <p className="text-sm text-muted-foreground">No pending outlines.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <h2 className="font-semibold">
              Pending metadata suggestions ({meta.data?.length ?? "—"})
            </h2>
            {(meta.data ?? []).map((suggestion) => (
              <article key={suggestion.id} className="rounded-lg border p-3 text-sm">
                <p className="break-all text-xs text-muted-foreground">{suggestion.page_url}</p>
                <p className="mt-2">
                  <span className="font-medium">Title:</span> {suggestion.proposed_title}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Description:</span>{" "}
                  {suggestion.proposed_description}
                </p>
                <ReviewActions
                  busy={busyId === suggestion.id}
                  onApprove={() =>
                    void reviewProposal("seo_meta_suggestions", suggestion.id, "approved")
                  }
                  onReject={() =>
                    void reviewProposal("seo_meta_suggestions", suggestion.id, "rejected")
                  }
                />
              </article>
            ))}
            {!meta.isPending && !meta.data?.length && (
              <p className="text-sm text-muted-foreground">No pending metadata suggestions.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <h2 className="font-semibold">
              Internal-link suggestions ({links.data?.length ?? "—"})
            </h2>
            {(links.data ?? []).map((suggestion) => (
              <article key={suggestion.id} className="rounded-lg border p-3 text-sm">
                <p className="break-all text-xs text-muted-foreground">{suggestion.source_url}</p>
                <p className="mt-1">
                  Link text: <span className="font-medium">{suggestion.anchor_text}</span>
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  Target: {suggestion.target_url}
                </p>
                <p className="mt-1">{suggestion.rationale}</p>
                <ReviewActions
                  busy={busyId === suggestion.id}
                  onApprove={() =>
                    void reviewProposal("seo_link_suggestions", suggestion.id, "approved")
                  }
                  onReject={() =>
                    void reviewProposal("seo_link_suggestions", suggestion.id, "rejected")
                  }
                />
              </article>
            ))}
            {!links.isPending && !links.data?.length && (
              <p className="text-sm text-muted-foreground">No pending internal-link suggestions.</p>
            )}
          </CardContent>
        </Card>
      </section>
      <p className="text-xs text-muted-foreground">
        Approving marks a proposal ready for manual implementation; it never publishes content or
        modifies site metadata. The worker is capped at 2 outlines, 5 metadata rewrites, and 5 link
        suggestions per UTC day.
      </p>
    </main>
  );
}

function ReviewActions({
  busy,
  onApprove,
  onReject,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={busy} onClick={onApprove}>
        <Check className="mr-1 size-4" />
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
        <X className="mr-1 size-4" />
        Reject
      </Button>
    </div>
  );
}
