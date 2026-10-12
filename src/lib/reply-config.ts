export const REPLY_MODEL = "gpt-4.1-mini";
export const REPLY_TONES = [
  "professional",
  "friendly",
  "formal",
  "calm",
  "apologetic",
  "firm",
  "short",
  "detailed",
] as const;

export type ReplyTone = (typeof REPLY_TONES)[number];

export const isReplyTone = (tone: string): tone is ReplyTone =>
  REPLY_TONES.some((item) => item === tone);

export type ReplySuggestion = {
  id: string;
  summary: string;
  riskExplanation: string;
  recommendedAction: string;
  reply: string;
  tone: string;
  model: string;
};
