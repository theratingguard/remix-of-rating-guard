import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const script = readFileSync(join(process.cwd(), "chrome-extension", "session-token.js"), "utf8");
const validate = new Function(`${script};return globalThis.ratingGuardSessionToken;`)() as (
  token: string,
  now: number,
) => string;
const now = Date.parse("2026-10-11T06:00:00Z");
function token(claims: Record<string, unknown>) {
  return `e30.${btoa(JSON.stringify(claims)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.signature`;
}
const claims = {
  role: "authenticated",
  sub: "00000000-0000-4000-8000-000000000001",
  exp: now / 1000 + 3600,
};
describe("extension session boundary", () => {
  it("accepts a current user session shape for subsequent server verification", () => {
    const jwt = token(claims);
    expect(validate(jwt, now)).toBe(jwt);
  });
  it.each(["service_role", "anon", "supabase_admin"])("rejects %s JWTs before storing", (role) => {
    expect(() => validate(token({ ...claims, role }), now)).toThrow("never an admin");
  });
  it.each([now / 1000 - 1, now / 1000 + 86401])(
    "rejects expired or long-lived expiry %s",
    (exp) => {
      expect(() => validate(token({ ...claims, exp }), now)).toThrow("short-lived");
    },
  );
  it("rejects opaque secrets, missing subject and malformed payload", () => {
    expect(() => validate("sb_secret_invalid", now)).toThrow("not an API secret");
    expect(() => validate(token({ ...claims, sub: undefined }), now)).toThrow("short-lived");
    expect(() => validate("e30.bad.signature", now)).toThrow("Malformed");
  });
});
