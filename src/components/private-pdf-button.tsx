import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { downloadPrivateReport } from "@/lib/private-report.functions";
import { Button } from "./ui/button";
import { openPrivatePdf } from "@/lib/private-report";

export function PrivatePdfButton({
  scanId,
  variant = "full",
  children,
}: {
  scanId: string;
  variant?: "full" | "legal" | "selected";
  children: React.ReactNode;
}) {
  const download = useServerFn(downloadPrivateReport);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        const preview = window.open("about:blank", "_blank");
        if (!preview) {
          toast.error("Allow pop-ups to preview this PDF. No file was downloaded.");
          return;
        }
        setBusy(true);
        try {
          const result = await download({ data: { scanId, variant } });
          openPrivatePdf(result, preview);
        } catch (error) {
          preview.close();
          toast.error(error instanceof Error ? error.message : "Private PDF preview failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing private PDF..." : children}
    </Button>
  );
}
