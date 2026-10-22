import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEGAL_COUNTRIES } from "./legal-laws/country-laws";
import { addCountryWorker, listCountryWorkers, removeCountryWorker } from "./worker-manager.server";

export const getLegalWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => listCountryWorkers(context.supabase));

export const setLegalWorkerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ country: z.enum(LEGAL_COUNTRIES), enabled: z.boolean() }).parse(data),
  )
  .handler(({ context, data }) =>
    data.enabled
      ? addCountryWorker(context.supabase, data.country)
      : removeCountryWorker(context.supabase, data.country),
  );
