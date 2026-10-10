import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./settings";
import { getSettings } from "./settings.server";
import { testModel } from "./model-test.server";
vi.mock("./settings.server", () => ({ getSettings: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Actual model diagnostics", () => {
  it("skips disabled providers without any network call", async () => {
    vi.mocked(getSettings).mockResolvedValue({ ...defaultSettings, claude_enabled: false });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await testModel("claude")).status).toBe("disabled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("classifies provider billing failures without exposing provider payload", async () => {
    vi.mocked(getSettings).mockResolvedValue(defaultSettings);
    vi.stubEnv("ANTHROPIC_API_KEY", "unit");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { message: "Your credit balance is too low private-marker" } },
          { status: 400 },
        ),
      ),
    );
    const result = await testModel("claude");
    expect(result.status).toBe("billing");
    expect(result.message).not.toContain("private-marker");
    expect(result.response_ms).toBeGreaterThanOrEqual(0);
  });
  it("records success with usage-based GPT cost estimate", async () => {
    vi.mocked(getSettings).mockResolvedValue(defaultSettings);
    vi.stubEnv("OPENAI_API_KEY", "unit");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: "OK" } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
      ),
    );
    const result = await testModel("gpt");
    expect(result.status).toBe("active");
    expect(result.cost_estimate_usd).toBeCloseTo(0.000045);
  });
  it("rejects success-shaped invalid output", async () => {
    vi.mocked(getSettings).mockResolvedValue(defaultSettings);
    vi.stubEnv("OPENAI_API_KEY", "unit");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ choices: [] })),
    );
    expect((await testModel("gpt")).status).toBe("error");
  });
});
