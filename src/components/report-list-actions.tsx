import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { emailReport, reportEmailStatus } from "@/lib/report-pdf.functions";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { Button } from "./ui/button";
import { PrivatePdfButton } from "./private-pdf-button";
export function ReportListActions({ scanId }: { scanId: string }) {
  const status = useServerFn(reportEmailStatus),
    send = useServerFn(emailReport);
  const features = useFeatureSettings();
  const emailStatus = useQuery({ queryKey: ["report-email-status"], queryFn: () => status() });
  const [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false);
  const url = `https://ratingguard.online/reports/${scanId}`;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Private report link copied; authorized login required.");
          } catch (error) {
            console.error("[share] Copy failed", error);
            toast.error("Could not copy report link.");
          }
        }}
      >
        Copy Link
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!features.data?.whatsapp_share_enabled}
        asChild={Boolean(features.data?.whatsapp_share_enabled)}
      >
        {features.data?.whatsapp_share_enabled ? (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Rating Guard private report (authorized login required): ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        ) : (
          "WhatsApp disabled"
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!emailStatus.data?.configured || busy}
        title={
          emailStatus.error?.message ??
          (!emailStatus.data?.configured ? "Configure SMTP and enable Email Share" : "")
        }
        onClick={() => setOpen(!open)}
      >
        Email
      </Button>
      <PrivatePdfButton scanId={scanId}>Download PDF</PrivatePdfButton>
      {(features.error || emailStatus.error) && (
        <p role="alert">
          Share configuration failed: {features.error?.message ?? emailStatus.error?.message}
        </p>
      )}
      {open && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await send({ data: { scanId, email } });
              toast.success("SMTP accepted the report recipient; delivery not confirmed.");
              setOpen(false);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Email failed.");
            } finally {
              setBusy(false);
            }
          }}
          className="flex gap-2"
        >
          <input
            aria-label="Report recipient email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border bg-background p-2"
          />
          <Button type="submit" disabled={busy}>
            Send confidential PDF
          </Button>
        </form>
      )}
    </div>
  );
}
