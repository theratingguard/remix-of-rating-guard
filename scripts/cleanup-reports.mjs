import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
const root = "/opt/rating-guard-private/reports";
const env = {};
for (const file of ["/opt/rating-guard/.env.production", "/etc/ratingguard-worker.env"]) {
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
  }
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Retention cleanup requires private database configuration.");
const response = await fetch(
  `${env.SUPABASE_URL}/rest/v1/app_settings?key=eq.pdf_retention_days&select=value`,
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY }, signal: AbortSignal.timeout(30000) },
);
if (!response.ok)
  throw new Error(`Retention settings query failed [${response.status}]; no files deleted.`);
const rows = await response.json();
const days = rows[0]?.value;
if (!Number.isInteger(days) || days < 1 || days > 90)
  throw new Error("Invalid retention policy; no files deleted.");
const cutoff = Date.now() - days * 86400000;
let removed = 0;
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await clean(path);
    else if (
      entry.isFile() &&
      /^[0-9a-f-]{36}(?:_(?:legal|selected|evidence))?\.pdf$/.test(entry.name)
    ) {
      if ((await stat(path)).mtimeMs < cutoff) {
        await unlink(path);
        removed++;
      }
    }
  }
}
await clean(root);
console.log(`Retention ${days} days; expired PDF files deleted: ${removed}`);
