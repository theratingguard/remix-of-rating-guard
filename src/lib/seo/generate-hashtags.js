import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const BATCH_SIZE = 500;

export const HASHTAG_COUNTRIES = [
  { country_code: "US", suffix: "US" },
  { country_code: "GB", suffix: "UK" },
  { country_code: "ES", suffix: "ES" },
  { country_code: "FR", suffix: "FR" },
  { country_code: "DE", suffix: "DE" },
  { country_code: "AE", suffix: "UAE" },
  { country_code: "IN", suffix: "IN" },
  { country_code: "JP", suffix: "JP" },
  { country_code: "BR", suffix: "BR" },
  { country_code: "CA", suffix: "CA" },
  { country_code: "AU", suffix: "AU" },
  { country_code: "IT", suffix: "IT" },
  { country_code: "NL", suffix: "NL" },
  { country_code: "KR", suffix: "KR" },
  { country_code: "CN", suffix: "CN" },
  { country_code: "TR", suffix: "TR" },
  { country_code: "ID", suffix: "ID" },
  { country_code: "SE", suffix: "SE" },
  { country_code: "PL", suffix: "PL" },
  { country_code: "SG", suffix: "SG" },
];

const SERVICE_TERMS = [
  "GoogleReview",
  "FakeReviewRemoval",
  "ReputationManagement",
  "GoogleReviewFix",
  "ReviewRemovalService",
  "FakeReviewPolicy",
  "OnlineReputation",
  "ReviewProtection",
  "ReviewRecovery",
  "BusinessReviews",
];

const ACTIONS = [
  "",
  "Remove",
  "Delete",
  "Manage",
  "Protect",
  "Recover",
  "Check",
  "Report",
  "Support",
  "Improve",
];

export function generateCountryHashtags() {
  const rows = HASHTAG_COUNTRIES.flatMap(({ country_code, suffix }) =>
    SERVICE_TERMS.flatMap((service) =>
      ACTIONS.map((action) => {
        const countrySuffix =
          country_code === "US" && action === "" && service === "FakeReviewRemoval"
            ? "USA"
            : suffix;
        return {
          country_code,
          hashtag: `#${action}${service}${countrySuffix}`,
        };
      }),
    ),
  );

  for (const { country_code } of HASHTAG_COUNTRIES) {
    const countryRows = rows.filter((row) => row.country_code === country_code);
    if (countryRows.length !== 100 || new Set(countryRows.map((row) => row.hashtag)).size !== 100)
      throw new Error(`Expected exactly 100 unique hashtags for ${country_code}.`);
  }

  return rows;
}

function runAsCli() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (runAsCli()) {
  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey)
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rows = generateCountryHashtags();
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const { error } = await supabase
      .from("country_hashtags")
      .upsert(batch, { onConflict: "country_code,hashtag", ignoreDuplicates: true });
    if (error) throw new Error(`Could not save country hashtags: ${error.message}`);
  }
  console.info(
    `[seo-hashtags] Saved ${rows.length} hashtags across ${HASHTAG_COUNTRIES.length} countries.`,
  );
}
