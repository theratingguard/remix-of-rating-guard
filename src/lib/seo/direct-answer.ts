const WORD_PATTERN = /\S+/g;

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function createDirectAnswer(query: string, source: string): string {
  const cleanQuery = cleanText(query).match(WORD_PATTERN)?.slice(0, 10).join(" ") || "this question";
  const sourceText = cleanText(source);
  const sourceSentence = sourceText.match(/[^.!?]+[.!?]/)?.[0]?.trim();
  const contextualLead =
    sourceSentence && (sourceSentence.match(WORD_PATTERN)?.length ?? 99) <= 11
      ? `The page explains: ${sourceSentence}`
      : "Rating Guard helps businesses assess potentially policy-relevant Google reviews and organize supporting evidence.";
  const answer = [
    `For businesses asking about ${cleanQuery}:`,
    contextualLead,
    "Google independently decides whether reviews violate its policies; removal is not guaranteed.",
    "Review the original evidence and current Google policies before reporting.",
  ].join(" ");
  const words = answer.match(WORD_PATTERN) ?? [];
  return words.length > 50 ? words.slice(0, 50).join(" ") : answer;
}
