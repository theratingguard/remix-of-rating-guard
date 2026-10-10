import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./settings";
import { getSettings, invalidateSettings, requireFeature } from "./settings.server";
const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ throwOnError: select }) }) },
}));
beforeEach(() => {
  invalidateSettings();
  vi.useFakeTimers();
  select.mockReset().mockResolvedValue({
    data: Object.entries(defaultSettings).map(([key, value]) => ({ key, value })),
  });
});
afterEach(() => vi.useRealTimers());
describe("Settings cache and failure handling", () => {
  it("deduplicates and caches for exactly one minute then reloads", async () => {
    await Promise.all([getSettings(), getSettings()]);
    await vi.advanceTimersByTimeAsync(59999);
    await getSettings();
    expect(select).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await getSettings();
    expect(select).toHaveBeenCalledTimes(2);
    invalidateSettings();
    await getSettings();
    expect(select).toHaveBeenCalledTimes(3);
  });
  it("does not replace missing settings or failed reads with enabled defaults", async () => {
    select.mockResolvedValueOnce({ data: [] });
    await expect(getSettings()).rejects.toThrow();
    select.mockRejectedValueOnce(new Error("Database offline"));
    await expect(getSettings()).rejects.toThrow("Database offline");
    await expect(getSettings()).resolves.toEqual(defaultSettings);
  });
  it("enforces disabled feature guards", async () => {
    await expect(requireFeature("email_share_enabled")).rejects.toThrow("Feature disabled");
  });
});
