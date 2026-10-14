import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import type { DashboardScanRow } from "@/lib/data";
import { createScansCsv } from "@/lib/scan-csv";
import { uploadStorageFile } from "@/lib/storage.functions";
import { Button } from "@/components/ui/button";

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return { size: bytes.length, base64: btoa(chunks.join("")) };
}

export function ScansCsvExportButton({
  scans,
  className,
  label = "Export CSV",
}: {
  scans: DashboardScanRow[];
  className?: string;
  label?: string;
}) {
  const saveCsv = useServerFn(uploadStorageFile);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    setBusy(true);
    setError(null);
    setUrl(null);
    try {
      const encoded = encodeBase64(createScansCsv(scans));
      if (encoded.size > 24 * 1024 * 1024)
        throw new Error("CSV exceeds the 24 MB VPS storage limit.");
      const filename = `scans-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.csv`;
      const saved = await saveCsv({
        data: {
          folder: "reports",
          filename,
          contentType: "text/csv;charset=utf-8",
          base64: encoded.base64,
        },
      });
      setUrl(saved.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save CSV to VPS storage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void exportCsv()}
        disabled={!scans.length || busy}
      >
        <Download className="h-3.5 w-3.5" />
        {busy ? "Saving to VPS..." : label}
      </Button>
      {url && (
        <p role="status" className="mt-2 text-xs">
          CSV saved privately on VPS storage.{" "}
          <a className="text-brand underline" href={url}>
            Open or download CSV
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-risk-high">
          {error}
        </p>
      )}
    </div>
  );
}
