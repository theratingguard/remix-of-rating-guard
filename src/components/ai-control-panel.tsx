import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAiControlPanel, saveAiSettings, runModelTests } from "@/lib/settings.functions";
import { modelKeys, modelNames, type AppSettings } from "@/lib/settings";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export function AiControlPanel() {
  const load = useServerFn(getAiControlPanel),
    save = useServerFn(saveAiSettings),
    test = useServerFn(runModelTests);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["ai-control-panel"], queryFn: () => load() });
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  if (query.error) return <p role="alert">AI controls unavailable: {query.error.message}</p>;
  if (!query.data) return <p>Loading AI controls...</p>;
  const settings = draft ?? query.data.settings;
  const storedSettings = query.data.settings;
  async function persist(next: AppSettings) {
    setBusy(true);
    try {
      const stored = await save({ data: next });
      setDraft(null);
      cache.setQueryData(["ai-control-panel"], { ...query.data, settings: stored });
      await cache.invalidateQueries({ queryKey: ["feature-settings"] });
      await cache.invalidateQueries({ queryKey: ["system-status"] });
      toast.success("Settings saved. Other running workers refresh within one minute.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  async function run(model: "gpt" | "claude" | "gemini" | "all") {
    setBusy(true);
    try {
      await test({ data: { model } });
      await query.refetch();
      toast.success("Tests finished. Inspect each actual provider status below.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Model tests failed.");
    } finally {
      setBusy(false);
    }
  }
  const toggles = [
    ["bulk_scan_enabled", "Bulk Scan"],
    ["legal_expert_enabled", "Legal Expert Mode"],
    ["auto_pdf_enabled", "Auto-PDF"],
    ["whatsapp_share_enabled", "WhatsApp Share"],
    ["email_share_enabled", "Email Share"],
    ["appeal_tracking_enabled", "Appeal Tracking"],
  ] as const;
  const limits = [
    ["bulk_daily_limit", "Bulk scan daily limit", 5000],
    ["single_hourly_limit", "Single scan hourly limit", 1000],
    ["rate_limit_per_min", "Rate limit (per min)", 10],
    ["pdf_retention_days", "PDF retention (days)", 90],
  ] as const;
  return (
    <section className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">AI Control Panel — Super Admin</h3>
      {modelKeys.map((key, index) => {
        const id = (["gpt", "claude", "gemini"] as const)[index]!;
        const status = query.data.statuses.find((item) => item.model === id);
        return (
          <div key={key} className="rounded border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span>{modelNames[index]}</span>
              <Switch
                aria-label={`${modelNames[index]} enabled`}
                checked={settings[key]}
                disabled={busy}
                onCheckedChange={(value) => void persist({ ...storedSettings, [key]: value })}
              />
              <span className="rounded border px-2 text-sm">
                {!settings[key]
                  ? "OFF"
                  : status?.status === "active"
                    ? "Active"
                    : status?.status === "billing"
                      ? "Billing"
                      : status?.status === "unconfigured"
                        ? "Unconfigured"
                        : status && status.status !== "disabled"
                          ? "Error"
                          : "Not tested"}
              </span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(id)}>
                Test {modelNames[index]}
              </Button>
            </div>
            {status && (
              <p className="mt-2 text-xs">
                {status.message} · {status.response_ms} ms · Last verified / tested:{" "}
                {new Date(status.checked_at).toLocaleString()} · Cost:{" "}
                {status.cost_estimate_usd === null
                  ? "estimate unavailable (paid test)"
                  : `$${status.cost_estimate_usd}`}
              </p>
            )}
          </div>
        );
      })}
      <label className="flex items-center gap-3">
        Multi-Model Mode
        <Switch
          aria-label="Multi-Model Mode"
          checked={settings.multi_model_enabled}
          disabled={busy}
          onCheckedChange={(value) =>
            void persist({ ...storedSettings, multi_model_enabled: value })
          }
        />
      </label>
      <p className="text-xs">
        Three enabled models: 2/3 required. Two enabled: both must agree. One enabled: explicitly
        single-model. Multi-Model OFF uses the first enabled provider (GPT, then Claude, then
        Gemini). Disabled models are not called. Retryable provider/output failures get 3 attempts.
        GPT-only may use explicitly labelled OpenAI gpt-4.1-mini fallback after retry exhaustion.
        Authentication/billing failures do not fall back.
      </p>
      <Button disabled={busy} onClick={() => void run("all")}>
        {busy ? "Working..." : "Test All Models"}
      </Button>
      <h3 className="font-semibold">Features</h3>
      {toggles.map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-3">
          {label}
          <Switch
            aria-label={label}
            checked={settings[key] && (key !== "email_share_enabled" || query.data.emailAvailable)}
            disabled={
              busy ||
              (key === "email_share_enabled" && !query.data.emailAvailable) ||
              (key === "whatsapp_share_enabled" && !query.data.whatsappAvailable)
            }
            onCheckedChange={(value) => void persist({ ...storedSettings, [key]: value })}
          />
        </label>
      ))}
      <p className="text-xs">
        {!query.data.emailAvailable &&
          "Email Share automatically unavailable: verified SMTP not configured. "}
        Share switches do not configure SMTP or WhatsApp delivery. WhatsApp opens a share link, not
        an automatic message. Auto-PDF OFF retains report data and manual PDF export. Legal OFF does
        not suppress basic policy-risk analysis.
      </p>
      <h3 className="font-semibold">Limits</h3>
      {limits.map(([key, label, max]) => (
        <label key={key} className="flex items-center justify-between gap-3">
          {label}
          <input
            aria-label={label}
            type="number"
            min={1}
            max={max}
            value={settings[key]}
            disabled={busy}
            className="w-24 rounded border bg-transparent p-2"
            onChange={(event) => setDraft({ ...settings, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <Button disabled={busy || !draft} onClick={() => void persist(settings)}>
        Save Limits
      </Button>
      <p className="text-xs">
        Limits count admitted attempts (including failures), UTC day/rolling hour. Rate maximum
        10/min; retention maximum 90 days. Lower retention revokes older downloads immediately and
        deletes expired files at 03:00.
      </p>
    </section>
  );
}
