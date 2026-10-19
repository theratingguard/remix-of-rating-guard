import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  blockBrowserShortcuts,
  blockContextMenu,
  restrictCopyToReportPages,
} from "@/lib/browser-interaction-guards";

function updateUserWatermark(email: string | undefined) {
  document.getElementById("rg-user-watermark")?.remove();
  if (!email) return;

  const watermark = document.createElement("div");
  watermark.id = "rg-user-watermark";
  watermark.setAttribute("aria-hidden", "true");
  Object.assign(watermark.style, {
    position: "fixed",
    inset: "0",
    zIndex: "5",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    alignItems: "center",
    justifyItems: "center",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    opacity: "0.07",
    color: "white",
    font: "700 13px/1.4 system-ui, sans-serif",
  });

  for (let index = 0; index < 12; index += 1) {
    const label = document.createElement("span");
    label.textContent = `${email} · RATING GUARD`;
    label.style.transform = "rotate(-24deg)";
    watermark.append(label);
  }
  document.body.append(watermark);
}

export function useExtremeProtection() {
  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) =>
      restrictCopyToReportPages(event, window.location.pathname);
    document.addEventListener("keydown", blockBrowserShortcuts, true);
    document.addEventListener("contextmenu", blockContextMenu, true);
    document.addEventListener("copy", handleCopy, true);

    return () => {
      document.removeEventListener("keydown", blockBrowserShortcuts, true);
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("copy", handleCopy, true);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("[protection] Could not read the current session.", error);
        return;
      }
      if (active) updateUserWatermark(data.session?.user.email);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      updateUserWatermark(session?.user.email);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
      document.getElementById("rg-user-watermark")?.remove();
    };
  }, []);
}
