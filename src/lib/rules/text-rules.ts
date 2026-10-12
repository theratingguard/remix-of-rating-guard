import { completeChecks, contextual, makeCheck, observed } from "./checks";
import type { RuleCheck, RuleReviewContext } from "./types";

export const TEXT_RULE_CATALOG = [
  "text-uppercase-majority",
  "text-shouting-uppercase",
  "text-exclamation-run",
  "text-question-run",
  "text-punctuation-abuse",
  "text-emoji-volume",
  "text-repeated-character",
  "text-under-five-words",
  "text-over-five-hundred-words",
  "text-business-name-repetition",
  "text-competitor-mention",
  "text-repeated-word-ratio",
  "text-identical-sentences",
  "text-sentence-length-template",
  "text-multiple-links",
  "text-email-address",
  "text-phone-number",
  "text-repeated-phrase",
  "text-symbol-only",
  "text-copy-match",
  "text-near-copy-match",
  "text-single-word-review",
  "text-grammar-anomalies",
  "text-translation-pattern",
  "text-language-mismatch",
] as const;

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const words = (value: string) => value.match(/[\p{L}\p{N}]+/gu) ?? [];

function sentenceLengths(text: string) {
  return text
    .split(/[.!?]+/u)
    .map((sentence) => words(sentence).length)
    .filter((length) => length > 0);
}

export function evaluateTextRules(input: RuleReviewContext): RuleCheck[] {
  const { text } = input;
  const evaluations = new Map<string, RuleCheck>();
  const put = (check: RuleCheck) => evaluations.set(check.id, check);
  const letters = text.match(/\p{L}/gu) ?? [];
  const uppercase = text.match(/\p{Lu}/gu) ?? [];
  const wordList = words(text);
  const lowerText = text.toLocaleLowerCase();
  const links = text.match(/(?:https?:\/\/|www\.)\S+/giu) ?? [];
  const sentences = sentenceLengths(text);
  const repeatedCharacters = text.match(/(\p{L})\1{2,}/giu) ?? [];

  put(
    observed(
      "text-uppercase-majority",
      "text",
      letters.length ? uppercase.length / letters.length > 0.5 : null,
      3,
      "More than half of alphabetic characters are uppercase.",
    ),
  );
  put(
    observed(
      "text-shouting-uppercase",
      "text",
      letters.length >= 20 ? uppercase.length / letters.length >= 0.8 : null,
      2,
      "At least 80% of alphabetic characters are uppercase.",
    ),
  );
  put(
    observed(
      "text-exclamation-run",
      "text",
      /!{3,}/u.test(text),
      2,
      "Contains a run of three or more exclamation marks.",
    ),
  );
  put(
    observed(
      "text-question-run",
      "text",
      /\?{3,}/u.test(text),
      1,
      "Contains a run of three or more question marks.",
    ),
  );
  put(
    observed(
      "text-punctuation-abuse",
      "text",
      /[!?]{5,}/u.test(text),
      1,
      "Contains a run of five or more mixed or repeated exclamation/question marks.",
    ),
  );

  const emojiCount = text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  put(
    observed(
      "text-emoji-volume",
      "text",
      emojiCount > 5,
      1,
      `Contains ${emojiCount} emoji characters; volume alone is not proof of manipulation.`,
    ),
  );
  put(
    observed(
      "text-repeated-character",
      "text",
      repeatedCharacters.length > 0,
      1,
      `Contains elongated spelling pattern(s): ${repeatedCharacters.slice(0, 3).join(", ")}.`,
    ),
  );
  put(
    observed(
      "text-under-five-words",
      "text",
      wordList.length > 0 && wordList.length < 5,
      1,
      `Review contains ${wordList.length} words; shortness alone does not establish authenticity.`,
    ),
  );
  put(
    observed(
      "text-over-five-hundred-words",
      "text",
      wordList.length > 500,
      1,
      `Review contains ${wordList.length} words; length alone does not establish copy-pasting.`,
    ),
  );

  const businessName = input.businessName?.trim();
  const businessOccurrences = businessName
    ? (
        lowerText.match(
          new RegExp(`\\b${escapeRegExp(businessName.toLocaleLowerCase())}\\b`, "gu"),
        ) ?? []
      ).length
    : null;
  put(
    observed(
      "text-business-name-repetition",
      "text",
      businessOccurrences === null ? null : businessOccurrences > 3,
      2,
      `Business name appears ${businessOccurrences ?? 0} times.`,
    ),
  );

  const competitors = input.competitorNames ?? [];
  const mentionedCompetitors = competitors.filter(
    (name) => name.trim() && new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "iu").test(text),
  );
  put(
    observed(
      "text-competitor-mention",
      "text",
      competitors.length ? mentionedCompetitors.length > 0 : null,
      1,
      `Mentions supplied competitor name(s): ${mentionedCompetitors.join(", ")}.`,
    ),
  );

  const tokenCounts = new Map<string, number>();
  for (const word of wordList)
    tokenCounts.set(word.toLocaleLowerCase(), (tokenCounts.get(word.toLocaleLowerCase()) ?? 0) + 1);
  const repeatedTokenRatio =
    wordList.length >= 12 ? Math.max(0, ...tokenCounts.values()) / wordList.length : null;
  put(
    observed(
      "text-repeated-word-ratio",
      "text",
      repeatedTokenRatio === null ? null : repeatedTokenRatio > 0.35,
      1,
      `Most repeated word occurs ${repeatedTokenRatio === null ? 0 : Math.round(repeatedTokenRatio * wordList.length)} times.`,
    ),
  );

  const normalizedSentences = text
    .split(/[.!?]+/u)
    .map(normalize)
    .filter(Boolean);
  const duplicateSentence =
    normalizedSentences.length >= 2 &&
    new Set(normalizedSentences).size < normalizedSentences.length;
  put(
    observed(
      "text-identical-sentences",
      "text",
      normalizedSentences.length >= 2 ? duplicateSentence : null,
      2,
      "One or more normalized sentences repeat within the review.",
    ),
  );

  const sameLength = sentences.length >= 3 && new Set(sentences).size === 1;
  put(
    observed(
      "text-sentence-length-template",
      "text",
      sentences.length >= 3 ? sameLength : null,
      1,
      "All supplied sentence lengths match exactly; this is only a weak style signal.",
    ),
  );
  put(
    observed(
      "text-multiple-links",
      "text",
      links.length > 1,
      2,
      `Contains ${links.length} URL-like link(s).`,
    ),
  );
  put(
    observed(
      "text-email-address",
      "text",
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text),
      1,
      "Contains an email address.",
    ),
  );
  put(
    observed(
      "text-phone-number",
      "text",
      /(?:\+?\d[\d\s().-]{7,}\d)/u.test(text),
      1,
      "Contains a phone-number-like digit sequence; confirm context before acting.",
    ),
  );

  const phraseTokens = wordList.map((word) => word.toLocaleLowerCase());
  const repeatedPhrase =
    phraseTokens.length >= 8 &&
    Array.from({ length: phraseTokens.length - 5 }, (_, index) =>
      phraseTokens.slice(index, index + 3).join(" "),
    ).some((phrase, index, all) => all.indexOf(phrase) !== index);
  put(
    observed(
      "text-repeated-phrase",
      "text",
      phraseTokens.length >= 8 ? repeatedPhrase : null,
      1,
      "A three-word phrase repeats within the review.",
    ),
  );
  put(
    observed(
      "text-symbol-only",
      "text",
      text.length > 0 ? wordList.length === 0 : null,
      1,
      "Review contains no recognizable words.",
    ),
  );

  const history = input.history?.map((item) => item.text) ?? [];
  const exactMatch = history.some((candidate) => normalize(candidate) === normalize(text));
  put(
    observed(
      "text-copy-match",
      "text",
      history.length ? exactMatch : null,
      3,
      "Review text exactly matches another supplied review after normalization.",
    ),
  );
  const nearMatch =
    history.length > 0 && history.some((candidate) => tokenOverlap(text, candidate) >= 0.8);
  put(
    observed(
      "text-near-copy-match",
      "text",
      history.length ? nearMatch : null,
      2,
      "Review text substantially overlaps another supplied review.",
    ),
  );
  put(
    observed(
      "text-single-word-review",
      "text",
      wordList.length > 0 ? wordList.length === 1 : null,
      1,
      "Review consists of a single word; this does not show whether it is genuine.",
    ),
  );
  put(makeCheck("text-grammar-anomalies", "text", "not_assessed"));
  put(makeCheck("text-translation-pattern", "text", "not_assessed"));
  put(
    observed(
      "text-language-mismatch",
      "text",
      input.expectedLanguage ? languageMismatch(text, input.expectedLanguage) : null,
      1,
      `Text script does not appear to match configured language ${input.expectedLanguage ?? "unknown"}.`,
    ),
  );

  return completeChecks("text", TEXT_RULE_CATALOG, evaluations);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(words(normalize(left)));
  const rightTokens = new Set(words(normalize(right)));
  if (leftTokens.size < 5 || rightTokens.size < 5) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function languageMismatch(text: string, language: string) {
  const scripts: Record<string, RegExp> = {
    en: /\p{Script=Latin}/u,
    fr: /\p{Script=Latin}/u,
    de: /\p{Script=Latin}/u,
    es: /\p{Script=Latin}/u,
    it: /\p{Script=Latin}/u,
    nl: /\p{Script=Latin}/u,
    pt: /\p{Script=Latin}/u,
    hi: /\p{Script=Devanagari}/u,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    zh: /\p{Script=Han}/u,
    ko: /\p{Script=Hangul}/u,
    ar: /\p{Script=Arabic}/u,
    ru: /\p{Script=Cyrillic}/u,
  };
  const expectedScript = scripts[language.toLocaleLowerCase().split("-")[0] ?? ""];
  const hasLetters = /\p{L}/u.test(text);
  return expectedScript && hasLetters ? !expectedScript.test(text) : null;
}
