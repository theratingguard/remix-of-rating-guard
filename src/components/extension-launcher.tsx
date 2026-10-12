import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ExtensionLauncher({ scanId }: { scanId: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function openAssistant() {
    setBusy(true);
    setStatus("");
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "rating-guard-extension" ||
        !["assistant-ready", "assistant-error"].includes(event.data?.type) ||
        event.data?.scanId !== scanId
      )
        return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      setBusy(false);
      setStatus(
        event.data.type === "assistant-ready"
          ? "Extension assistant opened. Select a supported review below."
          : event.data.message || "Extension authorization failed.",
      );
    };
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      setStatus("Extension not detected. Install it using the setup guide.");
      setBusy(false);
    }, 2500);
    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "rating-guard-app", type: "open-assistant", scanId },
      window.location.origin,
    );
  }

  return (
    <section className="surface space-y-2 p-4">
      <Button type="button" variant="outline" disabled={busy} onClick={openAssistant}>
        {busy ? "Checking extension…" : "Auto Report via Extension"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Opens the exact Google Maps review and prepares a verified draft. You must inspect it and
        submit it yourself in Google Maps.
      </p>
      {status && (
        <p role="status" className="text-sm">
          {status}{" "}
          {status.startsWith("Extension not detected") && (
            <a
              className="text-brand underline"
              href="https://github.com/theratingguard/remix-of-rating-guard/blob/main/docs/extension-setup.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Install guide
            </a>
          )}
        </p>
      )}
    </section>
  );
}
