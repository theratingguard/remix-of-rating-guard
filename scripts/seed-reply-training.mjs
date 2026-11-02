import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const INDUSTRIES = [
  "hotel",
  "restaurant",
  "cafe",
  "retail",
  "healthcare",
  "dental",
  "automotive",
  "salon",
  "spa",
  "fitness",
  "plumbing",
  "hvac",
  "legal",
  "real estate",
  "education",
  "travel",
  "delivery",
  "banking",
  "insurance",
  "home services",
];

const ISSUES = {
  praise: [
    "The team was helpful and the overall experience was excellent.",
    "The service was friendly, and everything went smoothly.",
    "The experience was pleasant, and the staff made a good impression.",
    "The service met expectations, and the visit was enjoyable.",
    "The team provided excellent service and made the visit worthwhile.",
  ],
  timing: [
    "My appointment started later than expected.",
    "The wait was longer than I had planned for.",
    "Service took more time than the estimate I received.",
    "The schedule changed and communication about timing was limited.",
    "I had to wait longer than expected before receiving service.",
  ],
  price: [
    "The final price felt higher than I expected.",
    "I would have liked clearer information about the cost.",
    "The service seemed expensive for what I received.",
    "I was surprised by the charges on the final bill.",
    "The value did not match my expectations for the price.",
  ],
  staff: [
    "A staff interaction felt less welcoming than I expected.",
    "Communication from the team could have been clearer.",
    "I did not feel that my question was fully addressed.",
    "The service interaction felt rushed.",
    "I had difficulty getting a clear response from staff.",
  ],
  quality: [
    "The quality of the service did not meet my expectations.",
    "The result was different from what I had expected.",
    "Some details of the service seemed inconsistent.",
    "The work did not feel as thorough as I expected.",
    "The overall quality could have been better.",
  ],
};

const ISSUE_LABELS = {
  praise: "the positive feedback",
  timing: "the reported wait or timing",
  price: "the pricing information",
  staff: "the interaction with the team",
  quality: "the reported service quality",
  spam: "the location details in the review",
};

function replyFor(industry, rating, issueType) {
  if (issueType === "spam") {
    return `Thank you for bringing this review to our attention. We want every comment to reach the right ${industry} location, but the details in this post are not enough for us to identify a visit. We may be missing context, so we do not want to make assumptions about the reviewer or the experience. Could you confirm whether you visited this location or intended to review another one? Please contact our support team through the details on our profile and share the visit date and location privately.`;
  }

  const topic = ISSUE_LABELS[issueType];
  if (rating >= 4) {
    return `Thank you for sharing your ${industry} experience and for highlighting ${topic}. We appreciate you taking the time to let others know what went well. Feedback helps our team understand which parts of the experience matter most to customers and where we should keep our attention. We value your visit and hope to have the opportunity to serve you again. If you would like to share any additional details, please contact our support team using the information on our profile.`;
  }

  if (rating === 3) {
    return `Thank you for sharing feedback about your ${industry} experience, including ${topic}. We review comments carefully and use relevant details to guide our service improvements. We aim to apply consistent service standards and check specific concerns with the relevant team. A public comment may not include enough context to verify every circumstance, so we avoid assumptions or discussing private information here. Please contact our support team using the details on our profile so we can review the specifics privately.`;
  }

  return `Thank you for bringing your ${industry} experience and ${topic} to our attention. We take feedback seriously and review the details before drawing conclusions. We aim to apply consistent service standards and check specific concerns with the relevant team. A public comment may not include enough context for us to verify the circumstances, so we avoid assumptions or discussing private information here. Please contact our support team using the details on our profile so we can respond privately.`;
}

function wordCount(text) {
  return text.trim().split(/\s+/u).length;
}

export function buildReplyTrainingScenarios() {
  const rows = [];
  for (const industry of INDUSTRIES) {
    for (let rating = 1; rating <= 5; rating++) {
      for (const [issueType, reviews] of Object.entries(ISSUES)) {
        rows.push({
          seed_key: `${industry.replaceAll(" ", "-")}-${rating}-${issueType}`,
          question: `A ${rating}-star ${industry} review says: "${reviews[rating - 1]}"`,
          answer: replyFor(industry, rating, issueType),
          rating_band: rating,
          industry,
          issue_type: issueType,
        });
      }
    }

    rows.push({
      seed_key: `${industry.replaceAll(" ", "-")}-1-spam-location`,
      question:
        "A reviewer says they do not recognize this business and may have meant another location.",
      answer: replyFor(industry, 1, "spam"),
      rating_band: 1,
      industry,
      issue_type: "spam",
    });
  }

  const benchmarkCount = rows.filter((row) => row.issue_type !== "spam").length;
  const locationCheckCount = rows.length - benchmarkCount;
  const expectedBenchmarkKeys = new Set(
    INDUSTRIES.flatMap((industry) =>
      Array.from({ length: 5 }, (_, index) => index + 1).flatMap((rating) =>
        Object.keys(ISSUES).map(
          (issueType) => `${industry.replaceAll(" ", "-")}-${rating}-${issueType}`,
        ),
      ),
    ),
  );
  const actualBenchmarkKeys = new Set(
    rows.filter((row) => row.issue_type !== "spam").map((row) => row.seed_key),
  );
  if (
    INDUSTRIES.length !== 20 ||
    expectedBenchmarkKeys.size !== 500 ||
    actualBenchmarkKeys.size !== 500 ||
    [...expectedBenchmarkKeys].some((key) => !actualBenchmarkKeys.has(key)) ||
    benchmarkCount !== 500 ||
    locationCheckCount !== 20
  ) {
    throw new Error(
      `Expected 500 benchmark and 20 location-check scenarios; received ${benchmarkCount} and ${locationCheckCount}.`,
    );
  }
  const keys = new Set(rows.map((row) => row.seed_key));
  if (keys.size !== rows.length) throw new Error("Scenario seed keys must be unique.");
  for (const row of rows) {
    const words = wordCount(row.answer);
    if (words < 45 || words > 110) {
      throw new Error(`${row.seed_key} has ${words} reply words; expected 45–110.`);
    }
  }
  return rows;
}

async function embedBatch(request, baseUrl, model, input) {
  const response = await request(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model, input }),
  });
  if (!response.ok) throw new Error(`Ollama embeddings returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== input.length) {
    throw new Error("Ollama returned an incomplete embedding batch.");
  }
  if (
    payload.embeddings.some((embedding) => !Array.isArray(embedding) || embedding.length !== 768)
  ) {
    throw new Error("Ollama embeddings must contain exactly 768 values.");
  }
  return payload.embeddings;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    ...(!url ? ["SUPABASE_URL"] : []),
    ...(!serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const baseUrl = (
    process.env.OLLAMA_URL ??
    process.env.OLLAMA_BASE_URL ??
    "http://127.0.0.1:11434"
  ).replace(/\/+$/u, "");
  const embeddingModel = process.env.REPLY_EMBEDDING_MODEL ?? "nomic-embed-text";
  const scenarios = buildReplyTrainingScenarios();

  for (let offset = 0; offset < scenarios.length; offset += 32) {
    const batch = scenarios.slice(offset, offset + 32);
    const embeddings = await embedBatch(
      fetch,
      baseUrl,
      embeddingModel,
      batch.map((row) => `${row.industry}. ${row.question}`),
    );
    const records = batch.map((row, index) => {
      const embedding = embeddings[index];
      if (!embedding) throw new Error(`Embedding missing for ${row.seed_key}.`);
      return { ...row, embedding };
    });
    const { error } = await supabase
      .from("reply_training_data")
      .upsert(records, { onConflict: "seed_key" });
    if (error) {
      throw new Error(
        `Failed to seed scenarios ${offset + 1}-${offset + batch.length}: ${error.message}`,
      );
    }
    console.info(
      `[reply-training] Seeded ${Math.min(offset + batch.length, scenarios.length)}/${scenarios.length}`,
    );
  }

  console.info(
    `[reply-training] Complete: ${scenarios.length} scenarios, 500 benchmark + 20 location-check cases.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--check")) {
    try {
      console.info(
        `[reply-training] Scenario validation passed: ${buildReplyTrainingScenarios().length} rows.`,
      );
    } catch (error) {
      console.error("[reply-training] Scenario validation failed.", error);
      process.exitCode = 1;
    }
  } else {
    main().catch((error) => {
      console.error("[reply-training] Seed failed.", error);
      process.exitCode = 1;
    });
  }
}
