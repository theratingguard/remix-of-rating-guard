import { afterEach, describe, expect, it, vi } from "vitest";
import { translateChatText } from "./chat-translation.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("translateChatText", () => {
  it("uses the configured local Ollama endpoint and returns a validated translation", async () => {
    vi.stubEnv("OLLAMA_URL", "http://ollama-test:11434/");
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ response: "Hello from Nairobi." }), { status: 200 }),
    );

    await expect(
      translateChatText("Habari kutoka Nairobi.", "sw", "en", { request }),
    ).resolves.toBe("Hello from Nairobi.");
    expect(request).toHaveBeenCalledWith(
      "http://ollama-test:11434/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      stream: false,
      prompt: expect.stringContaining("Swahili (Kenya, Tanzania)"),
    });
  });

  it("does not call Ollama when the source and target languages match", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(translateChatText("Habari", "sw", "sw", { request })).resolves.toBe("Habari");
    expect(request).not.toHaveBeenCalled();
  });

  it("fails explicitly when Ollama cannot translate", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    await expect(
      translateChatText("Hello", "en", "am", { request }),
    ).rejects.toThrow("Ollama translation returned HTTP 503.");
  });
});
