import { createHash } from "node:crypto";
import { queueRedis } from "./queue/config.server";
import { logServerError } from "./errors.server";
import { logEvent } from "./logger.server";

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export type RateLimitStore = {
  increment(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult>;
};

const redisIncrement = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count <= tonumber(ARGV[2]) and 1 or 0, redis.call('PTTL', KEYS[1])}`;

const redisStore: RateLimitStore = {
  async increment(key, limit, windowMs) {
    const result = (await queueRedis().eval(redisIncrement, 1, key, windowMs, limit)) as [
      number,
      number,
    ];
    return { allowed: result[0] === 1, retryAfterMs: Math.max(0, result[1]) };
  },
};

export function createMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, { count: number; expiresAt: number }>();
  return {
    async increment(key, limit, windowMs, now) {
      let window = windows.get(key);
      if (!window || window.expiresAt <= now) {
        window = { count: 0, expiresAt: now + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      if (windows.size > 10_000)
        for (const [existingKey, existing] of windows)
          if (existing.expiresAt <= now) windows.delete(existingKey);
      return {
        allowed: window.count <= limit,
        retryAfterMs: Math.max(0, window.expiresAt - now),
      };
    },
  };
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  if (forwarded?.trim()) return forwarded.trim();
  const chain = request.headers.get("x-forwarded-for");
  if (chain?.trim()) return chain.split(",")[0]!.trim();
  return "unknown";
}

export async function rateLimitResponse(
  request: Request,
  policy: RateLimitPolicy,
  store: RateLimitStore = redisStore,
): Promise<Response | null> {
  const ipHash = createHash("sha256").update(requestIp(request)).digest("hex");
  try {
    const result = await store.increment(
      `ratingguard:rate-limit:${policy.name}:${ipHash}`,
      policy.limit,
      policy.windowMs,
      Date.now(),
    );
    if (result.allowed) return null;
    logEvent("warn", "api.rate-limit", "Request rejected by rate limiter", {
      policy: policy.name,
      limit: policy.limit,
    });
    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  } catch (error) {
    logServerError(`rate-limit.${policy.name}`, error);
    return Response.json(
      { error: "Request protection is temporarily unavailable. Please retry shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const generalApiRateLimit: RateLimitPolicy = {
  name: "general",
  limit: 60,
  windowMs: 60_000,
};

export const sensitiveApiRateLimit: RateLimitPolicy = {
  name: "sensitive",
  limit: 10,
  windowMs: 60_000,
};
