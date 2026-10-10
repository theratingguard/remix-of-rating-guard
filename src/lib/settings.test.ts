import { describe, expect, it } from "vitest";
import { defaultSettings, enabledModelIndices, settingsSchema } from "./settings";
describe("AI control configuration", () => {
  it("validates all supported settings and bounds", () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
    for (const [key, value] of [
      ["rate_limit_per_min", 11],
      ["pdf_retention_days", 91],
      ["bulk_daily_limit", 0],
      ["single_hourly_limit", 1.5],
      ["gpt_enabled", "true"],
    ]) {
      expect(settingsSchema.safeParse({ ...defaultSettings, [key as string]: value }).success).toBe(
        false,
      );
    }
  });
  it("selects only enabled providers and first enabled in single mode", () => {
    expect(enabledModelIndices({ ...defaultSettings, claude_enabled: false })).toEqual([0, 2]);
    expect(
      enabledModelIndices({ ...defaultSettings, gpt_enabled: false, multi_model_enabled: false }),
    ).toEqual([1]);
    expect(
      enabledModelIndices({ ...defaultSettings, claude_enabled: false, gemini_enabled: false }),
    ).toEqual([0]);
    expect(() =>
      enabledModelIndices({
        ...defaultSettings,
        gpt_enabled: false,
        claude_enabled: false,
        gemini_enabled: false,
      }),
    ).toThrow("All AI");
  });
});
