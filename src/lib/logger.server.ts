export type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  metadata?: Record<string, unknown>;
};

const sensitiveKey = /authorization|password|secret|token|api.?key|credential|cookie|private.?key/i;
const sensitiveValue =
  /(?:Bearer\s+)[A-Za-z0-9._~+/=-]+|(?:sb_(?:publishable|secret)_)[A-Za-z0-9_-]+|(?:\b[a-f0-9]{32,}\b)|(?:\b(?:password|token|secret|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi;
const databaseCredentials = /(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@/\s]+(@)/gi;

function redact(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string")
    return value
      .replace(databaseCredentials, "$1[REDACTED]$2")
      .replace(sensitiveValue, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redact(item, "", seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey, seen)]),
    );
  }
  return value;
}

export function logEvent(
  level: LogLevel,
  context: string,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message: String(redact(message)),
    ...(metadata ? { metadata: redact(metadata) as Record<string, unknown> } : {}),
  };
  const serialized = JSON.stringify(entry);
  if (level === "debug") console.debug(serialized);
  else if (level === "info") console.info(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.error(serialized);
}
