import { defineConfig, devices } from "@playwright/test";

const requiredE2EVariables = [
  "E2E_BASE_URL",
  "E2E_EMAIL",
  "E2E_PASSWORD",
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_PUBLISHABLE_KEY",
  "E2E_SUPABASE_SERVICE_ROLE_KEY",
] as const;

for (const name of requiredE2EVariables) {
  if (!process.env[name]) {
    throw new Error(`${name} is required to run the local staff-case E2E test.`);
  }
}

const supabaseUrl = new URL(process.env.E2E_SUPABASE_URL!);
if (!["localhost", "127.0.0.1", "::1"].includes(supabaseUrl.hostname)) {
  throw new Error(
    "E2E_SUPABASE_URL must point to a local Supabase instance; remote targets are blocked.",
  );
}

const baseURL = process.env.E2E_BASE_URL!;
if (new URL(baseURL).hostname !== "127.0.0.1") {
  throw new Error("E2E_BASE_URL must use the local Playwright app server at 127.0.0.1.");
}
const authFile = "playwright/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  globalSetup: "./e2e/auth.setup.ts",
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    storageState: authFile,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY!,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
});
