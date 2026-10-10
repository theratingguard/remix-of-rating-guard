import { describe, expect, it } from "vitest";
import { readOpenAIStream } from "./openai-stream.server";

describe("OpenAI stream integrity (unit fixtures)", () => {
  it("accepts completed streamed output including a final unterminated line", async () => {
    const response = new Response(
      'data: {"type":"response.output_text.delta","delta":"fixture"}\n\ndata: {"type":"response.completed"}',
    );
    expect(await readOpenAIStream(response)).toBe("fixture");
  });
  it.each(["response.failed", "response.incomplete", "error"])("rejects %s", async (type) => {
    await expect(readOpenAIStream(new Response(`data: {"type":"${type}"}\n`))).rejects.toThrow();
  });
  it("rejects truncated and malformed streams", async () => {
    await expect(
      readOpenAIStream(
        new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n'),
      ),
    ).rejects.toThrow("completed");
    await expect(readOpenAIStream(new Response("data: not-json\n"))).rejects.toThrow();
  });
});
