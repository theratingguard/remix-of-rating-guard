import { z } from "zod";

const eventSchema = z.object({ type: z.string(), delta: z.string().optional() });

export async function readOpenAIStream(response: Response): Promise<string> {
  if (!response.body) throw new Error("AI returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    completed = false;
  function line(value: string) {
    if (!value.startsWith("data:")) return;
    const payload = value.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    const event = eventSchema.parse(JSON.parse(payload));
    if (
      event.type === "error" ||
      event.type === "response.failed" ||
      event.type === "response.incomplete"
    ) {
      throw new Error("AI response failed or was incomplete. Retry the request.");
    }
    if (event.type === "response.output_text.delta") {
      if (event.delta === undefined) throw new Error("AI text event was invalid.");
      text += event.delta;
    }
    if (event.type === "response.completed") completed = true;
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, end).trim());
        buffer = buffer.slice(end + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) line(buffer.trim());
    if (!completed || !text.trim())
      throw new Error("AI response ended without a completed result.");
    return text;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
