import { logEvent } from "./logger.server";

const databaseOperation =
  /^(?:(?:Could not|Unable to|Failed to) (?:load|check|verify|count|record|save|update|send|assign|close|delete|insert|fetch|read|write)\b[^:]*:|Reply was saved, but its analysis could not be stored:|Cases were assigned, but audit events could not be written:)/i;

export function sanitizeDbError(_error: unknown): string {
  return "We couldn't complete that request. Please try again.";
}

export function logServerError(context: string, error: unknown): void {
  const metadata: Record<string, unknown> = {
    errorType: error instanceof Error ? error.name : typeof error,
  };
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && /^[A-Z0-9]{2,8}$/.test(code)) metadata["errorCode"] = code;
  }
  logEvent("error", context, "Server operation failed", metadata);
}

export function isDatabaseOperationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (databaseOperation.test(error.message)) return true;
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
  }
  return false;
}
