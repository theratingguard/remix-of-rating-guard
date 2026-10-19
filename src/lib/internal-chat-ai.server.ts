import { z } from "zod";
import { budgetedAiFetch } from "./queue/ai-budget.server";

type ChatAiDependencies = {
  request?: (url: string, init: RequestInit) => Promise<Response>;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  openAiApiKey?: string;
};

const replySchema = z.string().trim().min(1).max(4000);

function replyPrompt(message: string) {
  return [
    "You are Rating Guard's AI support assistant replying on behalf of the Superadmin.",
    "Be helpful, warm, polite, concise, and truthful. Do not claim to be a human.",
    "Reply in the same language and writing style as the user.",
    `User message: ${JSON.stringify(message)}`,
  ].join("\n");
}

async function generateWithOllama(
  request: NonNullable<ChatAiDependencies["request"]>,
  baseUrl: string,
  model: string,
  prompt: string,
) {
  const response = await request(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model,
      stream: false,
      options: { num_ctx: 2048, num_predict: 220, temperature: 0.4 },
      prompt,
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  return replySchema.parse(z.object({ response: z.string() }).parse(payload).response);
}

async function generateWithOpenAi(
  request: NonNullable<ChatAiDependencies["request"]>,
  apiKey: string,
  prompt: string,
) {
  const response = await request("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 256,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are Rating Guard's AI support assistant replying on behalf of the Superadmin. Be helpful, warm, polite, concise, and truthful. Do not claim to be a human. Reply in the same language and writing style as the user.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const content = z
    .object({
      choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
    })
    .parse(payload).choices[0]!.message.content;
  return replySchema.parse(content);
}

export async function generateInternalChatReply(
  message: string,
  dependencies: ChatAiDependencies = {},
) {
  const request = dependencies.request ?? fetch;
  const paidRequest = dependencies.request ?? budgetedAiFetch;
  const baseUrl = (
    dependencies.ollamaBaseUrl ??
    process.env["OLLAMA_URL"] ??
    process.env["OLLAMA_BASE_URL"] ??
    "http://127.0.0.1:11434"
  ).replace(/\/+$/, "");
  const model = dependencies.ollamaModel ?? process.env["OLLAMA_MODEL"] ?? "llama3.2:3b";
  const apiKey = dependencies.openAiApiKey ?? process.env["OPENAI_API_KEY"];
  const prompt = replyPrompt(message);

  try {
    return await generateWithOllama(request, baseUrl, model, prompt);
  } catch (ollamaError) {
    console.warn(
      "[internal-chat] Ollama reply failed; trying the OpenAI fallback.",
      ollamaError instanceof Error ? ollamaError.message : "Unknown Ollama error",
    );
  }

  if (!apiKey) {
    throw new Error("Ollama failed and the OpenAI chat fallback is not configured.");
  }

  try {
    return await generateWithOpenAi(paidRequest, apiKey, prompt);
  } catch (openAiError) {
    console.error(
      "[internal-chat] OpenAI fallback failed.",
      openAiError instanceof Error ? openAiError.message : "Unknown OpenAI error",
    );
    throw new Error("Both Ollama and the OpenAI chat fallback failed.");
  }
}
