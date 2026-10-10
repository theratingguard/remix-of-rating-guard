import { settingsSchema, type AppSettings } from "./settings";
let cache: { value: AppSettings; expires: number } | null = null;
let pending: Promise<AppSettings> | null = null;
let generation = 0;
export function invalidateSettings() {
  generation++;
  cache = null;
  pending = null;
}
export async function getSettings(): Promise<AppSettings> {
  if (cache && cache.expires > Date.now()) return cache.value;
  if (pending) return pending;
  const version = generation;
  const request = (async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await supabaseAdmin.from("app_settings").select("key,value").throwOnError();
    const value = settingsSchema.parse(
      Object.fromEntries(rows.data.map((row) => [row.key, row.value])),
    );
    if (version === generation) cache = { value, expires: Date.now() + 60000 };
    return value;
  })();
  pending = request;
  try {
    return await request;
  } catch (error) {
    console.error(
      "[settings] Could not load valid application settings",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw error;
  } finally {
    if (pending === request) pending = null;
  }
}
export async function requireFeature(key: keyof AppSettings) {
  const settings = await getSettings();
  if (settings[key] !== true) throw new Error(`Feature disabled by Super Admin: ${key}.`);
  return settings;
}
