import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { COUNTRY_LEGAL_INFO, LEGAL_COUNTRIES, type LegalCountry } from "./legal-laws/country-laws";
import { getLegalWorker } from "./legal-workers.server";

export type LegalWorkerStats = {
  country: LegalCountry;
  enabled: boolean;
  cases: number;
  submissions: number;
  pending: number;
  approved: number;
  rejected: number;
  resolved: number;
  successRate: number | null;
  averageDaysToResponse: number | null;
};

const statsSchema = z.array(
  z.object({
    country: z.enum(LEGAL_COUNTRIES),
    enabled: z.boolean(),
    cases: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    success_rate: z.number().min(0).max(100).nullable(),
    average_days_to_response: z.number().nonnegative().nullable(),
  }),
);

export async function listCountryWorkers(db: SupabaseClient<Database>) {
  const { data } = await db.rpc("legal_worker_stats").throwOnError();
  const parsed = statsSchema.parse(data);
  return parsed.map((stat) => {
    const info = COUNTRY_LEGAL_INFO[stat.country];
    const worker = getLegalWorker(stat.country);
    if (!worker) throw new Error(`Legal worker registry is missing ${stat.country}.`);
    return {
      ...stat,
      name: info.name,
      laws: worker.laws,
      publicLawPortal: info.publicLawPortal,
      legalCaveat: info.legalCaveat,
      submitMethod: worker.submitMethod(),
      followUpSchedule: worker.followUpSchedule(),
    };
  });
}

export async function listActiveWorkers(db: SupabaseClient<Database>) {
  return (await listCountryWorkers(db)).filter((worker) => worker.enabled);
}

export async function getWorkerStats(db: SupabaseClient<Database>, country: LegalCountry) {
  const workers = await listCountryWorkers(db);
  const worker = workers.find((item) => item.country === country);
  if (!worker) throw new Error(`No legal worker stats found for ${country}.`);
  return worker;
}

export async function addCountryWorker(db: SupabaseClient<Database>, country: LegalCountry) {
  if (!getLegalWorker(country)) throw new Error(`No built-in worker exists for ${country}.`);
  await db.rpc("set_country_legal_worker", { _country: country, _enabled: true }).throwOnError();
  return getWorkerStats(db, country);
}

export async function removeCountryWorker(db: SupabaseClient<Database>, country: LegalCountry) {
  if (!getLegalWorker(country)) throw new Error(`No built-in worker exists for ${country}.`);
  await db.rpc("set_country_legal_worker", { _country: country, _enabled: false }).throwOnError();
  return getWorkerStats(db, country);
}

export function registeredCountryWorkers() {
  return LEGAL_COUNTRIES.map((country) => ({
    country,
    name: COUNTRY_LEGAL_INFO[country].name,
    worker: getLegalWorker(country),
  }));
}
