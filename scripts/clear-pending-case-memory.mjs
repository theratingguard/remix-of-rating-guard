const expectedDefault = 1466;
const pageSize = 500;
const deleteBatchSize = 50;

const execute = process.argv.includes("--execute");
const expectedArgument = process.argv.find((argument) =>
  argument.startsWith("--expected-count="),
);
const expectedCount = expectedArgument
  ? Number(expectedArgument.slice("--expected-count=".length))
  : expectedDefault;

if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
  throw new Error("--expected-count must be a non-negative integer.");
}

const supabaseUrl = process.env["SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.");
}

const baseUrl = new URL(supabaseUrl);
if (
  !["https:", "http:"].includes(baseUrl.protocol) ||
  baseUrl.username ||
  baseUrl.password ||
  (baseUrl.protocol === "http:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname))
) {
  throw new Error("SUPABASE_URL must be HTTPS, or localhost for local development.");
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

async function request(path, init) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { ...headers, ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  return response;
}

const ids = [];
for (let offset = 0; ; offset += pageSize) {
  const query = new URLSearchParams({
    select: "id",
    outcome: "eq.pending",
    order: "id",
    limit: String(pageSize),
    offset: String(offset),
  });
  const response = await request(`/rest/v1/case_memory?${query}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.id !== "string")) {
    throw new Error("Pending case-memory query returned an invalid response.");
  }
  ids.push(...rows.map((row) => row.id));
  if (rows.length < pageSize) break;
}

console.log(`Pending case-memory records found: ${ids.length}`);
console.log("Source reviews and scans will not be deleted.");

if (ids.length !== expectedCount) {
  throw new Error(
    `Expected exactly ${expectedCount} pending records but found ${ids.length}; nothing was deleted.`,
  );
}

if (!execute) {
  console.log("Dry run only. Re-run with --execute to delete these pending memory records.");
  process.exit(0);
}

let deleted = 0;
for (let offset = 0; offset < ids.length; offset += deleteBatchSize) {
  const batch = ids.slice(offset, offset + deleteBatchSize);
  const query = new URLSearchParams({
    id: `in.(${batch.join(",")})`,
    outcome: "eq.pending",
    select: "id",
  });
  const response = await request(`/rest/v1/case_memory?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("Pending memory deletion returned an invalid response.");
  }
  deleted += rows.length;
}

if (deleted !== expectedCount) {
  throw new Error(
    `Expected to delete ${expectedCount} pending records but deleted ${deleted}. Check the database before retrying.`,
  );
}

const remainingQuery = new URLSearchParams({
  select: "id",
  outcome: "eq.pending",
  limit: "1",
});
const remainingResponse = await request(`/rest/v1/case_memory?${remainingQuery}`);
const remainingRows = await remainingResponse.json();
if (!Array.isArray(remainingRows) || remainingRows.length > 0) {
  throw new Error(
    "Pending case-memory records remain or were added during cleanup; verify the database.",
  );
}

console.log(`Deleted ${deleted} pending case-memory records.`);
