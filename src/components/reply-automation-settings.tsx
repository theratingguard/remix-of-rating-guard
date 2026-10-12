import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getReplyAutomationSettings,
  isReplyTone,
  REPLY_TONES,
  setReplyAutomationSettings,
} from "@/lib/reply.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function ReplyAutomationSettings() {
  const load = useServerFn(getReplyAutomationSettings);
  const save = useServerFn(setReplyAutomationSettings);
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["reply-automation-settings"], queryFn: () => load() });
  const [saving, setSaving] = useState(false);
  const [savingTone, setSavingTone] = useState(false);

  const setEnabled = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await save({ data: { enabled, tone: settings.data?.tone ?? "professional" } });
      await queryClient.invalidateQueries({ queryKey: ["reply-automation-settings"] });
      toast.success(enabled ? "Automatic reply drafts enabled" : "Automatic reply drafts disabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Auto Reply.");
    } finally {
      setSaving(false);
    }
  };

  const setTone = async (tone: (typeof REPLY_TONES)[number]) => {
    if (savingTone) return;
    setSavingTone(true);
    try {
      await save({ data: { enabled: settings.data?.enabled ?? false, tone } });
      await queryClient.invalidateQueries({ queryKey: ["reply-automation-settings"] });
      toast.success("Automatic reply tone saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save reply tone.");
    } finally {
      setSavingTone(false);
    }
  };

  return (
    <div className="space-y-4">
      {settings.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load Auto Reply settings. Refresh and try again.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Enable Auto Reply</p>
          <p className="text-xs text-muted-foreground">
            Prepares drafts from recent completed scans every six hours; up to 10 per account per
            run. Drafts are never sent automatically.
          </p>
        </div>
        <Switch
          aria-label="Enable Auto Reply"
          checked={settings.data?.enabled ?? false}
          disabled={settings.isPending || settings.isError || saving}
          onCheckedChange={(enabled) => void setEnabled(enabled)}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 sm:items-center">
        <label htmlFor="auto-reply-tone" className="text-sm font-medium">
          Tone
        </label>
        <Select
          value={settings.data?.tone ?? "professional"}
          disabled={settings.isPending || settings.isError || savingTone}
          onValueChange={(tone) => {
            if (isReplyTone(tone)) void setTone(tone);
          }}
        >
          <SelectTrigger id="auto-reply-tone" aria-label="Auto Reply tone" className="capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPLY_TONES.map((tone) => (
              <SelectItem key={tone} value={tone} className="capitalize">
                {tone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-sm font-medium">Auto-post</p>
          <p className="text-xs text-muted-foreground">
            Unavailable: Google Business Profile reply posting is not connected.
          </p>
        </div>
        <Switch aria-label="Auto-post" checked={false} disabled />
      </div>

      {settings.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm">
            Pending Drafts: <span className="font-semibold">{settings.data.draftsReady}</span>
          </p>
          <Button variant="outline" asChild>
            <Link to="/replies">View Drafts</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
