import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let testUserId: string;
let scanId: string;
let reviewId: string;
let staffCreatedByTest = false;
const token = randomUUID();
const reviewUrl = `https://www.google.com/maps/reviews/data=!1s${token}`;
const businessName = `E2E Case Business ${token.slice(0, 8)}`;

test.beforeAll(async () => {
  const url = process.env.E2E_SUPABASE_URL;
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_EMAIL;
  if (!url || !serviceKey || !email) {
    throw new Error("Local Supabase service-role URL/key and E2E_EMAIL are required.");
  }

  admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let matchedUserId: string | undefined;
  for (let page = 1; !matchedUserId; page += 1) {
    const userResult = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (userResult.error) throw userResult.error;
    matchedUserId = userResult.data.users.find((user) => user.email === email)?.id;
    if (matchedUserId || userResult.data.users.length < 1000) break;
  }
  if (!matchedUserId) throw new Error("E2E_EMAIL must belong to an existing local auth user.");
  testUserId = matchedUserId;

  const existingStaff = await admin
    .from("staff")
    .select("id,status")
    .eq("id", testUserId)
    .maybeSingle();
  if (existingStaff.error) throw existingStaff.error;
  if (existingStaff.data) {
    if (existingStaff.data.status !== "active") {
      throw new Error("The local E2E account must already have an active staff profile.");
    }
  } else {
    const result = await admin.from("staff").insert({
      id: testUserId,
      name: "E2E Staff",
      mobile: `e2e-${token.slice(0, 20)}`,
      email,
      region_city: "Test City",
      region_state: "Test State",
      status: "active",
    });
    if (result.error) throw result.error;
    staffCreatedByTest = true;
  }

  const scanResult = await admin
    .from("scans")
    .insert({
      user_id: testUserId,
      source_url: `https://www.google.com/maps/place/${token}`,
      business_name: businessName,
      address: "Test City, Test State",
      status: "complete",
      is_seed: false,
      reviews_retrieved: 1,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (scanResult.error) throw scanResult.error;
  scanId = scanResult.data.id;

  const reviewResult = await admin
    .from("reviews")
    .insert({
      scan_id: scanId,
      rating: 1,
      text: "The owner offered payment in exchange for changing my review.",
      review_uri: reviewUrl,
      risk: "high",
      policy_category: "Conflict of interest",
      evidence: "offered payment in exchange for changing my review",
      reason: "The review describes a specific incentive tied to changing its content.",
      confidence: 90,
    })
    .select("id")
    .single();
  if (reviewResult.error) throw reviewResult.error;
  reviewId = reviewResult.data.id;
});

test.afterAll(async () => {
  if (!admin) return;
  if (scanId) {
    const cases = await admin.from("staff_cases").delete().eq("scan_id", scanId);
    if (cases.error) throw cases.error;
    if (reviewId) {
      const reviews = await admin.from("reviews").delete().eq("id", reviewId);
      if (reviews.error) throw reviews.error;
    }
    const scans = await admin.from("scans").delete().eq("id", scanId);
    if (scans.error) throw scans.error;
    const remaining = await admin
      .from("staff_cases")
      .select("id", { count: "exact", head: true })
      .eq("scan_id", scanId);
    if (remaining.error) throw remaining.error;
    expect(remaining.count).toBe(0);
  }
  if (staffCreatedByTest && testUserId) {
    const staff = await admin.from("staff").delete().eq("id", testUserId);
    if (staff.error) throw staff.error;
  }
});

test("logs in, assigns a case, reads it, records submission, and cleans up its own data", async ({
  page,
}) => {
  await page.goto("/admin/case-assignment");
  await expect(page.getByLabel("Active staff member")).toBeVisible();
  await page.getByLabel("Review URL(s), one per line").fill(reviewUrl);
  await page.getByLabel("Active staff member").selectOption(testUserId);
  await page.getByRole("button", { name: /Assign 1 eligible case/ }).click();
  await expect(page.getByText("1 case assigned.")).toBeVisible();

  await page.goto("/staff/cases");
  await expect(page.getByText(businessName)).toBeVisible();
  await expect(page.getByText(/Case assigned/i)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Record manual submission" }).click();
  await expect(page.getByText("submitted", { exact: true }).first()).toBeVisible();

  const storedCase = await admin
    .from("staff_cases")
    .select("status")
    .eq("scan_id", scanId)
    .eq("review_id", reviewId)
    .single();
  if (storedCase.error) throw storedCase.error;
  expect(storedCase.data.status).toBe("submitted");
});

test("blocks an unauthenticated visitor from the staff case dashboard", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/staff/cases");
    await expect(page).toHaveURL(/\/auth(?:[/?#]|$)/);
  } finally {
    await context.close();
  }
});
