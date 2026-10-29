const STOP_WORDS = new Set(
  "a an and are as at be by for from has have how i in is it of on or that the their this to was what when where which who with your".split(
    " ",
  ),
);
const DOMAIN_ENTITIES = [
  "Google",
  "Google Maps",
  "Google Business Profile",
  "review policy",
  "fake engagement",
  "misleading content",
  "conflict of interest",
  "evidence",
  "moderation",
  "reporting",
  "consumer protection",
  "business reputation",
  "online reputation",
];

export type SemanticAnalysis = {
  extractedEntities: string[];
  missingTopics: string[];
  semanticScore: number;
};

function normalizedWords(text: string) {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z][a-z'-]{2,}/g)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  );
}

export function analyzeSemanticContent(
  article: string,
  targetQuery: string,
  referenceExcerpts: string[],
): SemanticAnalysis {
  const articleWords = normalizedWords(article);
  const referenceText = referenceExcerpts.join(" ");
  const candidates = new Set<string>();
  for (const entity of DOMAIN_ENTITIES) {
    if (entity.toLowerCase().split(" ").every((word) => articleWords.has(word)))
      candidates.add(entity);
  }
  for (const match of article.matchAll(/\b(?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+){0,2}\b/g)) {
    const value = match[0].trim();
    if (!/^(The|A|An|This|That|It|We|Our|Google)$/i.test(value)) candidates.add(value);
  }

  const referenceWords = normalizedWords(referenceText);
  const queryWords = normalizedWords(targetQuery);
  const topicalWords = new Set([...referenceWords, ...queryWords]);
  const missingTopics = [...topicalWords]
    .filter((word) => !articleWords.has(word) && word.length > 4)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 25);
  const coverage = topicalWords.size
    ? [...topicalWords].filter((word) => articleWords.has(word)).length / topicalWords.size
    : 1;
  const lengthScore = Math.min(1, articleWords.size / 100);
  const semanticScore = Math.round((coverage * 0.8 + lengthScore * 0.2) * 100);
  return {
    extractedEntities: [...candidates].slice(0, 40),
    missingTopics,
    semanticScore,
  };
}
