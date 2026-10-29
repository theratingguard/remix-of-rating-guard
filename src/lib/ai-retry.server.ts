export class ProviderHttpError extends Error {
  constructor(
    public status: number,
    public permanent: boolean,
    public billing = false,
  ) {
    super(`Provider HTTP ${status}${permanent ? " (authentication, quota or billing)" : ""}`);
  }
}
export async function requireProviderResponse(response: Response) {
  if (response.ok) return;
  const body = await response.text();
  const billing =
    response.status === 402 ||
    (response.status === 400 &&
      /billing|payment|insufficient[_ ]?(credits?|quota)|out of credits/i.test(body));
  const permanent =
    [400, 401, 402, 403, 404].includes(response.status) ||
    (response.status === 429 && /insufficient_quota|billing|credit|quota_exceeded/i.test(body));
  throw new ProviderHttpError(response.status, permanent, billing);
}
export async function retryAi<T>(operation: (attempt: number) => Promise<T>, label: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      console.warn(
        "[ai-retry]",
        label,
        JSON.stringify({
          attempt,
          error: error instanceof Error ? error.message : "Unknown failure",
        }),
      );
      if (
        attempt === 3 ||
        (error instanceof ProviderHttpError && error.permanent) ||
        (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
        (error instanceof Error && "code" in error && error.code === "AI_BUDGET_LIMIT")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error("AI attempts exhausted.");
}
