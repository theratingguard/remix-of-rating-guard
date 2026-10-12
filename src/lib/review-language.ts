export type ReviewLanguage = "english" | "hindi" | "hinglish" | "regional" | "unknown";

const hinglishMarkers =
  /\b(?:hai|hain|tha|thi|nahi|nahin|bahut|bohot|acha|accha|bekar|paise|khana|paisa|bilkul|mat|karo|kiya|mera|meri|hum|aap|yahan|wahan|kyun|kyunki|lekin|par|aur|ko|ka|ke|ki)\b/iu;

export function detectReviewLanguage(text: string): {
  language: ReviewLanguage;
  confidence: "low" | "medium" | "high";
  script: "latin" | "devanagari" | "other" | "none";
} {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return { language: "unknown", confidence: "low", script: "none" };

  const devanagari = (text.match(/\p{Script=Devanagari}/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  if (devanagari > 0 && latin > 0)
    return { language: "hinglish", confidence: "high", script: "other" };
  if (devanagari / letters.length >= 0.5)
    return { language: "hindi", confidence: "high", script: "devanagari" };
  if (latin / letters.length >= 0.7) {
    const latinText = text.replace(/[^\p{Script=Latin}\p{N}\s]/gu, " ");
    if (hinglishMarkers.test(latinText))
      return { language: "hinglish", confidence: "medium", script: "latin" };
    const englishMarkers =
      /\b(?:the|and|was|were|with|this|that|service|staff|food|room|place|experience|would|not|very|good|bad)\b/iu;
    return englishMarkers.test(latinText)
      ? { language: "english", confidence: "medium", script: "latin" }
      : { language: "regional", confidence: "low", script: "latin" };
  }
  return { language: "regional", confidence: "low", script: "other" };
}

export function languageEvidence(text: string) {
  const lowered = text.toLocaleLowerCase();
  const regionalSlangMarkers = [
    ...lowered.matchAll(
      /\b(?:bekar|bakwas|faltu|ghatiya|paagal|nikamma|बेकार|बकवास|घटिया|पागल)\b/giu,
    ),
  ].map((match) => match[0]);
  const defamationMarkers = [
    ...lowered.matchAll(
      /\b(?:fraud|criminal|thief|scammer|liar|corrupt|धोखेबाज़|चोर|फ्रॉड|बेईमान|chor|dhokebaaz|fraudster)\b/giu,
    ),
  ].map((match) => match[0]);
  const fakeEngagementMarkers = [
    ...lowered.matchAll(
      /\b(?:paid to write|fake review|fake reviews|bought reviews|fake ratings|पैसे देकर|खरीदे हुए रिव्यू|paid review|paise dekar|nakli review)\b/giu,
    ),
  ].map((match) => match[0]);
  return {
    regionalSlangMarkers: [...new Set(regionalSlangMarkers)],
    defamationMarkers: [...new Set(defamationMarkers)],
    fakeEngagementMarkers: [...new Set(fakeEngagementMarkers)],
  };
}
