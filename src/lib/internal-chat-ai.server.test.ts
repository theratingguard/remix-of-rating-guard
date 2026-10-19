import { afterEach, describe, expect, it, vi } from "vitest";
import { generateInternalChatReply } from "./internal-chat-ai.server";

function ollamaResponse(text: string) {
  return new Response(JSON.stringify({ response: text }), { status: 200 });
}

function openAiResponse(text: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateInternalChatReply", () => {
  it("returns the Ollama reply without calling the paid fallback", async () => {
    const request = vi.fn(async () => ollamaResponse("Ollama reply"));

    await expect(
      generateInternalChatReply("Namaste", {
        request,
        openAiApiKey: "test-key",
      }),
    ).resolves.toBe("Ollama reply");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("uses OpenAI when Ollama times out", async () => {
    const request = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(openAiResponse("OpenAI fallback reply"));

    await expect(
      generateInternalChatReply("Please help", {
        request,
        openAiApiKey: "test-key",
      }),
    ).resolves.toBe("OpenAI fallback reply");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toBe("http://127.0.0.1:11434/api/generate");
    expect(request.mock.calls[1]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.mock.calls[1]?.[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a clear error if Ollama fails and no OpenAI key is configured", async () => {
    const request = vi.fn(async () => {
      throw new Error("Ollama is unavailable");
    });

    await expect(generateInternalChatReply("Help", { request })).rejects.toThrow(
      "Ollama failed and the OpenAI chat fallback is not configured.",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports a clear error if both providers fail", async () => {
    const request = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(
      generateInternalChatReply("Help", {
        request,
        openAiApiKey: "test-key",
      }),
    ).rejects.toThrow("Both Ollama and the OpenAI chat fallback failed.");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
