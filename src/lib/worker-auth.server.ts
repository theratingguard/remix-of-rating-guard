import { timingSafeEqual } from "node:crypto";

export function matchesWorkerSecret(
  token: string | undefined,
  expected: string | undefined,
): boolean {
  if (!token || !expected) return false;
  const received = Buffer.from(token);
  const configured = Buffer.from(expected);
  return received.length === configured.length && timingSafeEqual(received, configured);
}
