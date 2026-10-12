export const REPLY_MODEL = "gpt-4.1-mini";
export const REPLY_TONES = [
  "professional",
  "friendly",
  "calm",
  "apologetic",
  "firm",
  "short",
  "detailed",
] as const;

export type ReplyTone = (typeof REPLY_TONES)[number];

export type ReplySuggestion = {
  id: string;
  summary: string;
  riskExplanation: string;
  recommendedAction: string;
  reply: string;
  tone: string;
  model: string;
};
