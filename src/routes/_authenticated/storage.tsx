import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import {
  backupStorageDatabase,
  cleanupStorageTemp,
  exportStorageLogs,
  getStorageDashboard,
} from "@/lib/storage.functions";

export const Route = createFileRoute("/_authenticated/storage")({
  head: () => ({
    meta: [
      { title: "Storage Manager — Rating Guard" },
      { name: "description", content: "Manage private Rating Guard VPS storage." },
    ],
  }),
  component: StorageManager,
});

type StorageActionResult = { filename: string; size: number; url: string };

function StorageManager() {
  const queryClient = useQueryClient();
  const dashboardFn = useServerFn(getStorageDashboard);
  const cleanupFn = useServerFn(cleanupStorageTemp);
  const backupFn = useServerFn(backupStorageDatabase);
  const exportFn = useServerFn(exportStorageLogs);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<StorageActionResult | null>(null);
  const dashboard = useQuery({
    queryKey: ["storage-dashboard"],
    queryFn: () => dashboardFn(),
  });

  async function runAction(
    name: string,
    action: () => Promise<StorageActionResult | { deletedFiles: number; deletedBytes: number }>,
  ) {
    setBusy(name);
    setLastAction(null);
    try {
      const result = await action();
      if ("deletedFiles" in result) {
        toast.success(`Removed ${result.deletedFiles} expired temporary file(s).`);
      } else {
        setLastAction(result);
        toast.success(`${name} saved to VPS storage.`);
      }
      await queryClient.invalidateQueries({ queryKey: ["storage-dashboard"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${name} failed.`);
    } finally {
      setBusy(null);
    }
  }

  if (dashboard.isPending) return <p className="text-muted-foreground">Loading storage…</p>;
  if (dashboard.error)
    return (
      <p role="alert" className="text-destructive">
        Could not load storage. {dashboard.error.message}
      </p>
    );
  const data = dashboard.data;

  return (
    <section>
      <PageHeader
        title="Storage Manager"
        subtitle="Private VPS storage. Files are served only after server-side access checks."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total Size" value={data.formattedSize} />
        <Metric label="Total Files" value={data.totalFiles.toLocaleString()} />
        <Metric label="Storage Root" value={data.root} />
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Folders</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {data.folders.map((folder) => (
            <div key={folder.name} className="rounded-lg border p-4">
              <h3 className="font-semibold">📁 {folder.name}/</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {folder.formattedSize} · {folder.files.toLocaleString()} file(s)
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Storage actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Temporary files older than 7 days are removed. Database backups require a configured
          PostgreSQL connection and <code>pg_dump</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runAction("Cleanup", async () => cleanupFn())}
          >
            {busy === "Cleanup" ? "Cleaning…" : "Cleanup Temp"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runAction("Backup", () => backupFn())}
          >
            {busy === "Backup" ? "Backing up…" : "Backup Database"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runAction("Log export", () => exportFn())}
          >
            {busy === "Log export" ? "Exporting…" : "Export Logs"}
          </Button>
        </div>
        {lastAction && (
          <p role="status" className="mt-3 break-all text-sm">
            Saved on VPS: <code>{lastAction.filename}</code> · {formatBytes(lastAction.size)} ·{" "}
            <code>{lastAction.url}</code>
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Recent report files</h2>
        {data.files.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No report PDFs are stored yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3">File</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2">Modified</th>
                </tr>
              </thead>
              <tbody>
                {data.files.map((file) => (
                  <tr key={file.path} className="border-b last:border-0">
                    <td className="max-w-[360px] break-all py-2 pr-3">{file.path}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{formatBytes(file.size)}</td>
                    <td className="whitespace-nowrap py-2">
                      {new Date(file.modifiedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-xl font-semibold">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`;
}
