import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("Production multi-model enable flag", () => {
  it("enables three providers with MULTI_MODEL_ENABLED=true", async () => {
    vi.stubEnv("MULTI_MODEL_ENABLED", "true");
    vi.stubEnv("REVIEW_ANALYSIS_MODE", "");
    vi.resetModules();
    const mode = await import("./analysis.server");
    expect(mode.THREE_MODEL_MODE).toBe(true);
    expect(mode.PROMPT_VERSION).toBe("risk-consensus-v2-retry");
    expect(mode.AI_PROVIDER).toBe("OpenAI + Anthropic + Google");
  });
  it("preserves existing single-provider mode when not enabled", async () => {
    vi.stubEnv("MULTI_MODEL_ENABLED", "false");
    vi.stubEnv("REVIEW_ANALYSIS_MODE", "");
    vi.resetModules();
    expect((await import("./analysis.server")).THREE_MODEL_MODE).toBe(false);
  });
});
