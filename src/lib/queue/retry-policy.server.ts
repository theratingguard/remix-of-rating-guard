import { ScanError } from "../google-places.server";

export function isPermanentWorkerError(error: unknown) {
  return (
    error instanceof ScanError &&
    [
      "AI_AUTH",
      "AI_QUOTA",
      "INVALID_URL",
      "AMBIGUOUS_BUSINESS",
      "NO_REVIEWS",
      "NOT_FOUND",
    ].includes(error.code)
  );
}
