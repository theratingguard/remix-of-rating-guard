# Phase 1 multi-worker system

Single scans are admitted into a transactional PostgreSQL outbox and return a saved
scan ID immediately. BullMQ executes scanner -> analyzer -> legal stages. PostgreSQL
is the source of truth; deterministic Redis job IDs and stage/generation checks make
handoffs recoverable. Bulk uses the same workers, respecting existing paused/cancelled
batches. No existing paused batch is automatically resumed during cutover.

## VPS runtime

Redis is loopback-only, 512MB, `noeviction`, with AOF enabled. `allkeys-lru` is unsuitable
for durable BullMQ jobs because it can evict jobs and locks. Memory exhaustion must fail
explicitly, never lose jobs silently. Redis and PM2 startup are enabled on boot.

This ESM repository uses `ecosystem.config.cjs`, not an incompatible CommonJS `.js`.
Build using `bun run build` and `bun run build:workers`. PM2 starts one API process and
2 scanner, 3 analyzer, 2 legal processes, running as `ratingguard`. Each worker's local
concurrency is one; BullMQ global stage concurrency is 2/3/2. Scanner starts are globally
limited to at most one every six seconds, or slower if configured. A single-vCPU VPS
does not imply eight simultaneous CPU-heavy Chromium workloads.

Jobs have three **total** attempts, not three extra attempts. The requested 1s/5s/30s
sequence uses a custom increasing backoff; only the first two waits occur with three
total attempts. Completed Redis stage jobs retain 100; failed retain 500. Terminal
failures are recorded in PostgreSQL and copied to a bounded 500-entry DLQ. Invalid
URLs, authorization, billing and no-review failures are not pointlessly retried.

Workers renew BullMQ locks, send heartbeats every 30s (90s expiry), and log cluster
health every five minutes. PM2 restarts crashed workers with bounded restart backoff.
Settings polls actual status every five seconds. `/api/workers/status` requires an
authorized Super Admin bearer session, not a public API key.

## Safety limits

Every paid AI request (including retries, fallback, legal drafting, replies, appeals,
batch insights and provider tests) reserves a conservative token-cost upper estimate
atomically against $10 per UTC day in PostgreSQL before dispatch. Output tokens are
bounded, input uses UTF-8 bytes plus overhead, and uncertain failures are not refunded.
Budget exhaustion delays pending jobs until the next UTC day; unavailable ledgers fail
closed. This is a conservative **admission reservation** limit, not an exact provider
invoice including taxes or a guarantee against future provider price changes. Model
pricing bounds must be maintained when providers/models change.

The application uses Supabase's HTTP/PostgREST API, not direct SQL connections.
Service-role HTTP requests are globally bounded to 20 in-flight requests using Redis
leases. This is not a claim that Supabase's managed database pool was reconfigured.

Queue payloads contain task IDs/generation only, never credentials or review text.
Worker logs, tasks, budget rows and status are Super Admin-only. Login/authentication
implementation and the OpenAI credential remain unchanged.

## Operations

Run PM2 as root to read existing private environment files; child apps use the existing
unprivileged ratingguard user. Keep PM2's dump private because it contains environment
values. Child log files live in the ratingguard-owned `/opt/ratingguard-worker-logs`
directory, not inaccessible root-owned PM2 log paths. Do not run the legacy systemd app or scan-worker timer alongside PM2: duplicate
process managers could process the same bulk queue. Save `pm2 save` only after all eight
processes and a real scan chain are verified. Gracefully stop PM2 and restore the prior
systemd deployment if cutover fails. Do not rewrite published Git history.

Errors retain original source reviews and evidence boundaries. A risky count or removal
chance is never fabricated to pass a scan test. A task becomes complete only after legal
and PDF persistence succeeds (unless Auto-PDF is intentionally disabled in Settings).
