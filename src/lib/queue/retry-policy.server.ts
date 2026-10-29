import { ScanError } from "../google-places.server";

export function workerErrorCode(error: unknown): string | undefined {
  if (error instanceof ScanError) return error.code;
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export function isPermanentWorkerError(error: unknown) {
  return (
    [
      "AI_AUTH",
      "AI_QUOTA",
      "INVALID_URL",
      "AMBIGUOUS_BUSINESS",
      "INVALID_PROVIDER_DATA",
      "NO_REVIEWS",
      "NOT_FOUND",
    ].includes(workerErrorCode(error) ?? "")
  );
}
