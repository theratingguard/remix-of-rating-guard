import { chromium, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (typeof baseURL !== "string" || !email || !password) {
    throw new Error("E2E_BASE_URL, E2E_EMAIL, and E2E_PASSWORD are required for auth setup.");
  }

  const authFile = "playwright/.auth/admin.json";
  await mkdir(dirname(authFile), { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(new URL("/auth", baseURL).toString());
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname !== "/auth", { timeout: 30_000 });
    await context.storageState({ path: authFile });
    await context.close();
  } finally {
    await browser.close();
  }
}
