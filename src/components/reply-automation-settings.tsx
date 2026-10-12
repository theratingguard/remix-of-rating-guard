import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getReplyAutomationSettings, setReplyAutomationEnabled } from "@/lib/reply.functions";
import { Switch } from "@/components/ui/switch";

export function ReplyAutomationSettings() {
  const load = useServerFn(getReplyAutomationSettings);
  const save = useServerFn(setReplyAutomationEnabled);
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["reply-automation-settings"], queryFn: () => load() });
  const [saving, setSaving] = useState(false);

  const setEnabled = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await save({ data: { enabled } });
      await queryClient.invalidateQueries({ queryKey: ["reply-automation-settings"] });
      toast.success(enabled ? "Automatic reply drafts enabled" : "Automatic reply drafts disabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update automatic reply drafts.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Automatically prepare reply drafts</p>
          <p className="text-xs text-muted-foreground">
            Checks recent completed scans every six hours; capped at 10 drafts per account per run.
          </p>
        </div>
        <Switch
          aria-label="Automatically prepare reply drafts"
          checked={settings.data?.enabled ?? false}
          disabled={settings.isPending || settings.isError || saving}
          onCheckedChange={(enabled) => void setEnabled(enabled)}
        />
      </div>
      {settings.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not load automatic reply settings.
        </p>
      )}
      {settings.data && (
        <>
          <p className="text-xs text-muted-foreground">
            {settings.data.draftsReady} saved draft{settings.data.draftsReady === 1 ? "" : "s"}{" "}
            await review.
          </p>
          <p className="text-xs text-muted-foreground">
            Auto-posting is unavailable. Approved replies must be posted manually.
          </p>
        </>
      )}
    </div>
  );
}
