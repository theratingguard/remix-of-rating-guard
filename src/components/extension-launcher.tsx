import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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
      setStatus(
        "Extension not detected. Install the unpacked extension using docs/extension-setup.md.",
      );
      setBusy(false);
    }, 8000);
    window.addEventListener("message", onMessage);
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!data.session?.access_token) throw new Error("Sign in to Rating Guard first.");
        window.postMessage(
          {
            source: "rating-guard-app",
            type: "open-assistant",
            scanId,
            token: data.session.access_token,
          },
          window.location.origin,
        );
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        setBusy(false);
        setStatus(error instanceof Error ? error.message : "Could not access the current session.");
      });
  }

  return (
    <section className="surface space-y-2 p-4">
      <Button type="button" variant="outline" disabled={busy} onClick={openAssistant}>
        {busy ? "Checking extension…" : "Auto Report via Extension"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Opens the exact Google Maps review and prepares the verified draft. You must inspect the
        report and submit it yourself in Google Maps.
      </p>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
