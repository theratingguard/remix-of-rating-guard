import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mergeContent, type SiteContent } from "@/lib/site-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const SECTION_LABELS: Record<keyof SiteContent["sections"], string> = {
  problem: "Problem", responsible: "Responsible action", how: "How it works", ai: "AI intelligence", reply: "Reply assistant", reporting: "Reporting", security: "Security", faq: "FAQ",
};

function move<T>(arr: T[], i: number, d: number) { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j]!, a[i]!]; return a; }

export function HomepageEditor() {
  const [c, setC] = useState<SiteContent | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("site_content").select("published, draft, published_at").eq("id", "home").maybeSingle().then(({ data }) => {
      const d = data?.draft && Object.keys(data.draft as object).length ? data.draft : data?.published;
      setHasDraft(JSON.stringify(data?.draft ?? {}) !== "{}" && JSON.stringify(data?.draft) !== JSON.stringify(data?.published));
      setC(mergeContent(d)); setPublishedAt(data?.published_at ?? null);
    });
  }, []);
  if (!c) return <p className="text-sm text-muted-foreground">Loading homepage content…</p>;
  const up = (p: Partial<SiteContent>) => { setC({ ...c, ...p }); setDirty(true); };

  const save = async (publish: boolean) => {
    setBusy(true);
    const patch: any = { draft: c, updated_at: new Date().toISOString() };
    if (publish) { patch.published = c; patch.published_at = new Date().toISOString(); }
    const { error } = await supabase.from("site_content").update(patch).eq("id", "home");
    setBusy(false);
    if (error) { toast.error(`Could not save: ${error.message}`); return; }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({ user_id: u.user!.id, action: publish ? "homepage.published" : "homepage.draft_saved", detail: {} });
    setDirty(false); setHasDraft(!publish);
    if (publish) setPublishedAt(patch.published_at);
    toast.success(publish ? "Homepage published" : "Draft saved");
  };

  const T = ({ k, label, area }: { k: keyof SiteContent; label: string; area?: boolean }) => (
    <div className="space-y-1.5"><Label>{label}</Label>
      {area ? <Textarea rows={3} value={c[k] as string} onChange={(e) => up({ [k]: e.target.value } as any)} /> : <Input value={c[k] as string} onChange={(e) => up({ [k]: e.target.value } as any)} />}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${dirty || hasDraft ? "bg-risk-medium/20 text-risk-medium" : "bg-risk-normal/15 text-risk-normal"}`}>{dirty ? "Unsaved changes" : hasDraft ? "Draft (not published)" : "Published"}</span>
        <span className="text-muted-foreground">{publishedAt ? `Last published ${new Date(publishedAt).toLocaleString()}` : "Showing default content"}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><a href="/?preview=draft" target="_blank" rel="noreferrer"><ExternalLink /> Preview Homepage</a></Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => save(false)}>Save draft</Button>
          <Button size="sm" disabled={busy} onClick={() => save(true)}>Publish</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {T({ k: "heroTitle", label: "Hero headline" })}{T({ k: "announcement", label: "Announcement banner (empty = hidden)" })}
        {T({ k: "heroSubtitle", label: "Hero subtitle", area: true })}{T({ k: "trustStatement", label: "Trust statement", area: true })}
        {T({ k: "ctaPrimary", label: "Primary button" })}{T({ k: "ctaSecondary", label: "Secondary button" })}
        {T({ k: "seoTitle", label: "SEO title" })}{T({ k: "contactEmail", label: "Contact email" })}
        {T({ k: "seoDescription", label: "SEO description", area: true })}{T({ k: "footerTagline", label: "Footer text", area: true })}
      </div>

      <div><h4 className="mb-2 text-sm font-semibold">Sections shown</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(SECTION_LABELS) as (keyof SiteContent["sections"])[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={c.sections[k]} onCheckedChange={(v) => up({ sections: { ...c.sections, [k]: v } })} />{SECTION_LABELS[k]}</label>
          ))}
        </div>
      </div>

      <div><h4 className="mb-2 text-sm font-semibold">How it works steps</h4>
        <div className="space-y-2">{c.steps.map((s, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Input value={s.title} onChange={(e) => up({ steps: c.steps.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
            <Input value={s.body} onChange={(e) => up({ steps: c.steps.map((x, j) => j === i ? { ...x, body: e.target.value } : x) })} />
          </div>))}
        </div>
      </div>

      <div><div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold">FAQ</h4>
        <Button size="sm" variant="outline" onClick={() => up({ faq: [...c.faq, { q: "New question", a: "Answer", visible: true }] })}><Plus /> Add question</Button></div>
        <div className="space-y-3">{c.faq.map((f, i) => (
          <div key={i} className="rounded-lg border border-card-border p-3">
            <div className="flex items-center gap-2">
              <Input value={f.q} onChange={(e) => up({ faq: c.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} />
              <Switch checked={f.visible} onCheckedChange={(v) => up({ faq: c.faq.map((x, j) => j === i ? { ...x, visible: v } : x) })} aria-label="Visible" />
              <Button size="icon" variant="ghost" onClick={() => up({ faq: move(c.faq, i, -1) })} aria-label="Move up"><ArrowUp /></Button>
              <Button size="icon" variant="ghost" onClick={() => up({ faq: move(c.faq, i, 1) })} aria-label="Move down"><ArrowDown /></Button>
              <Button size="icon" variant="ghost" onClick={() => up({ faq: c.faq.filter((_, j) => j !== i) })} aria-label="Delete"><Trash2 /></Button>
            </div>
            <Textarea className="mt-2" rows={2} value={f.a} onChange={(e) => up({ faq: c.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} />
          </div>))}
        </div>
      </div>

      {(["footerLinks", "socialLinks"] as const).map((key) => (
        <div key={key}><div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold">{key === "footerLinks" ? "Legal / footer links" : "Social links"}</h4>
          <Button size="sm" variant="outline" onClick={() => up({ [key]: [...c[key], { label: "Link", href: "https://" }] } as any)}><Plus /> Add link</Button></div>
          <div className="space-y-2">{c[key].map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input value={l.label} onChange={(e) => up({ [key]: c[key].map((x, j) => j === i ? { ...x, label: e.target.value } : x) } as any)} />
              <Input value={l.href} onChange={(e) => up({ [key]: c[key].map((x, j) => j === i ? { ...x, href: e.target.value } : x) } as any)} />
              <Button size="icon" variant="ghost" onClick={() => up({ [key]: c[key].filter((_, j) => j !== i) } as any)} aria-label="Delete"><Trash2 /></Button>
            </div>))}
          </div>
        </div>
      ))}
    </div>
  );
}
