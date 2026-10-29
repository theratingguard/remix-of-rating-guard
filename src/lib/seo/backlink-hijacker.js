import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

const ALLOWED_SOURCE_TYPES = new Set(["editorial", "guest_post", "forum", "directory", "other"]);

function publicHttpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error(`${label} must use HTTP or HTTPS.`);
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    url.hostname.includes(":") ||
    url.username ||
    url.password
  )
    throw new Error(`${label} must use a public domain name, not a local or IP address.`);
  url.hash = "";
  return url.toString();
}

function normalizeRow(row, index) {
  const competitorUrl = publicHttpUrl(row.competitor_url ?? "", `Row ${index + 2} competitor_url`);
  const referringPageUrl = publicHttpUrl(
    row.referring_page_url ?? "",
    `Row ${index + 2} referring_page_url`,
  );
  const sourceType = String(row.source_type ?? "other").trim().toLowerCase();
  if (!ALLOWED_SOURCE_TYPES.has(sourceType))
    throw new Error(`Row ${index + 2} source_type is not supported.`);
  const targetDomain = new URL(referringPageUrl).hostname.toLowerCase();
  const contactEmail = String(row.contact_email ?? "").trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    throw new Error(`Row ${index + 2} contact_email is invalid.`);
  return {
    competitor_url: competitorUrl,
    referring_page_url: referringPageUrl,
    target_domain: targetDomain,
    source_type: sourceType,
    anchor_text: String(row.anchor_text ?? "").trim().slice(0, 300) || null,
    contact_email: contactEmail.slice(0, 254) || null,
    notes: String(row.notes ?? "").trim().slice(0, 2000) || null,
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error(
      "Usage: node src/lib/seo/backlink-hijacker.js <authorized-backlink-export.csv>",
    );
  }
  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey)
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");

  const contents = await readFile(file, "utf8");
  const parsed = Papa.parse(contents, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0]?.message}`);
  const rows = parsed.data;
  if (!rows.length) throw new Error("The CSV has no backlink records.");
  if (rows.length > 5000) throw new Error("Import is limited to 5,000 records per run.");
  const targets = rows.map((row, index) => normalizeRow(row, index));

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let offset = 0; offset < targets.length; offset += 250) {
    const batch = targets.slice(offset, offset + 250);
    const { error } = await supabase
      .from("backlink_targets")
      .upsert(batch, {
        onConflict: "competitor_url,referring_page_url",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Could not save backlink export: ${error.message}`);
  }
  console.info(
    `[backlink-import] Imported ${targets.length} rows from the provided authorized export. No web pages were fetched.`,
  );
}

main().catch((error) => {
  console.error("[backlink-import] Import failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
