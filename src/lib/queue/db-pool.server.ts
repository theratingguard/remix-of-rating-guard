import { randomUUID } from "node:crypto";
import { queueRedis } from "./config.server";

const acquire = `
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1])
if redis.call('ZCARD',KEYS[1])>=20 then return 0 end
redis.call('ZADD',KEYS[1],ARGV[2],ARGV[3])
return 1`;
// Supabase uses HTTP/PostgREST, not a direct SQL connection pool. Bound server-side
// service-role requests across all PM2 processes to 20 in-flight requests.
export async function pooledDatabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (process.env["MULTI_WORKER_ENABLED"] !== "true") return fetch(input, init);
  const redis = queueRedis(),
    token = randomUUID(),
    started = Date.now();
  while (!(await redis.eval(acquire, 1, "rg:db-pool", Date.now(), Date.now() + 60000, token))) {
    if (Date.now() - started > 30000)
      throw new Error("Database request pool exhausted (20 requests).");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  try {
    const response = await fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
    });
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    await redis.zrem("rg:db-pool", token);
  }
}
