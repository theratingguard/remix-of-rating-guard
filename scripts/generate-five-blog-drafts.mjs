const siteUrl = process.env["PUBLIC_APP_URL"] ?? process.env["VITE_PUBLIC_APP_URL"];
const token = process.env["BLOG_GENERATION_TOKEN"];
if (!siteUrl || !token) {
  throw new Error(
    "Set PUBLIC_APP_URL and BLOG_GENERATION_TOKEN (a Super Admin access token) before running this script.",
  );
}

const origin = new URL(siteUrl);
if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) {
  throw new Error("PUBLIC_APP_URL must use HTTPS.");
}

const keywords = [
  "How to assess whether a Google review violates policy",
  "Organizing factual evidence for a Google review appeal",
  "Responding professionally to negative business reviews",
  "What businesses should know about Google review reporting",
  "Responsible review management and customer feedback",
];

for (const keyword of keywords) {
  const response = await fetch(new URL("/api/admin/generate-blog", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ keyword }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Blog generation failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("title" in body) ||
    typeof body.title !== "string" ||
    !("slug" in body) ||
    typeof body.slug !== "string" ||
    !("status" in body) ||
    body.status !== "draft"
  ) {
    throw new Error("The blog generator returned an unexpected response.");
  }
  console.info(`Saved draft: ${body.title} (${body.slug})`);
}
