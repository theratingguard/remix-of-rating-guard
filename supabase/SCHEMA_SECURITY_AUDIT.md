# Rating Guard Remix — Supabase schema and security audit

## Production update — 2026-10-10

### Deployed repair verification — 13:26 UTC

The VPS repair deployment passed its build, non-emitting TypeScript check,
61 regression tests and full lint (zero errors, ten warnings). The additive
content-security migration is now applied: `site_content` has its initial row,
anonymous table SELECT is denied, and `get_published_site_content()` returns
published content only. The separate `scan_history` table requested by the
owner also exists with RLS enabled and no browser grants; application history
continues to use `scans` and `reports`.

The account inventory now contains one user and zero confirmed users. A normal
confirmation resend with the real production callback returned HTTP 200.
This is not proof of email delivery or successful login. Production health
returns HTTP 503 with explicit missing OpenAI configuration; privileged queue
configuration is still unavailable. Both requested Google short links resolve
to CID-only URLs and are rejected as `UNSUPPORTED_LINK`, without guessing a
business or fabricating reviews. The public homepage returned HTTPS 200,
while the integrated browser still failed real-domain DNS resolution.

The remaining text records earlier audit/application-baseline evidence, not
the current user count or the complete deployment inventory.

The additive migration `migrations/20261010110000_application.sql` was subsequently
validated on the intended project inside a rolled-back transaction (catalog count
remained zero), then applied successfully with authorization from the end-to-end
production task. Post-apply catalog checks show 17 public tables, all 17 with RLS
enabled, and 18 public policies. Anonymous `scans` read privilege and authenticated
`claim_scan_jobs` execution privilege are both false. Auth user count remains zero.
No existing users or data were deleted. The original audit below records the
pre-migration state; it is not the current table inventory state.

Authenticated cross-user reads/writes, actual account login, and provider-backed
scan/report persistence still require end-to-end verification. This migration
implements owner-scoped records, not an organization model that the app does not
currently define. It does not create an admin account or grant admin privileges.

The transaction-only ownership test in `tests/ownership.sql` passed on the target:
an authenticated SQL role with an owner claim could read/write its own records,
could not see another owner's scan, and was denied another owner's profile
insert. All fixtures were rolled back. This is a database-policy test, not evidence
of a real browser login or JWT-backed end-to-end report persistence.

## Scope and verified state

This is an application-contract audit and a proposed, **not executable or applied**, schema plan for Supabase project `bdudkvrsbznpmyfzsahm`.

Evidence checked:

- The authenticated Supabase dashboard identifies the requested project as healthy.
- Read-only SQL Editor catalog queries in that project returned no `public` tables/views, no `public` policies, no `storage` buckets/policies, and zero public-schema data tables. A read-only REST request for `scans` returned `PGRST205` (table absent from the schema cache).
- The only current public-schema function is Supabase's `rls_auto_enable`; the application's `has_role`, `claim_scan_jobs`, and `acquire_worker_lock` RPCs do not exist there.
- A read-only `auth.users` count returned zero. No user identities were inspected or modified.
- `drizzle/schema.ts` is empty and `drizzle/migrations/meta/_journal.json` contains no migration entries. The generated TypeScript database types therefore describe application expectations, not confirmed live DDL.
- The app directly queries the tables and RPCs listed below. No migration, DDL, database write, reset, or paid scan was run as part of this audit.
- Authentication settings accepted the configured public key, but this does not prove table access, RLS, or persistence.

**Conclusion:** dashboard and SQL Editor database connectivity are verified, and the app's expected database objects are absent. The project's authentication endpoint is reachable, but there are currently zero auth users. RLS, report persistence, and end-to-end scanning are not functional/verified. Do not treat this as a production-ready app database until the schema is reviewed, approved, migrated additively, and tested.

## Application schema contract

Column types below are taken from the checked-in generated TypeScript types. They must be reconciled with the current application writes and reads before producing executable DDL; generated types do not establish database defaults, constraints, indexes, or policies.

Proposed physical types: entity identifiers and auth user IDs are UUIDs; `place_key`, `site_content.id`, and `system_state.id` are text; timestamps are `timestamptz`; payloads (`detail`, `payload`, `report_data`, `verification`, `published`, `draft`) are `jsonb`; `signals`, `indicators`, and `data_quality_reasons` are `text[]`. Counts, ratings from individual reviews, confidence, and duration values are integers; business/Google aggregate ratings and coordinates use `numeric`/`double precision`. Text and nullable columns follow the generated row nullability. Defaults must be verified from every insert path before DDL is finalized.

| Table | Application columns |
|---|---|
| `profiles` | `user_id`, `name`, `username`, `avatar_path`, `status`, `created_at`, `updated_at` |
| `user_roles` | `id`, `user_id`, `role` (`admin` or `user`) |
| `businesses` | `id`, `user_id`, `place_id`, `name`, `category`, `address`, `rating`, `total_reviews`, `maps_uri`, `latitude`, `longitude`, `is_seed`, `created_at`, `updated_at` |
| `scan_batches` | `id`, `user_id`, `batch_number`, `total`, `created_at` |
| `scans` | `id`, `user_id`, `batch_id`, `business_id`, `source_url`, `place_id`, `business_name`, `category`, `address`, `rating`, `total_reviews`, `maps_uri`, `data_source`, `status`, `stage`, `error`, `is_seed`, `reviews_retrieved`, `high_count`, `medium_count`, `normal_count`, `requires_review_count`, `reviews_failed_analysis`, `rating_mismatch`, `api_rating_raw`, `api_total_reviews_raw`, `data_quality`, `data_quality_reasons`, `review_health_score`, `started_at`, `completed_at`, `created_at` |
| `reviews` | `id`, `scan_id`, `author`, `author_uri`, `rating`, `published_at`, `relative_time`, `text`, `review_uri`, `risk`, `policy_category`, `indicators`, `reason`, `evidence`, `confidence`, `processing_status`, `content_hash`, `created_at` |
| `review_analyses` | `id`, `review_id`, `scan_id`, `risk`, `category`, `signals`, `reason`, `evidence`, `confidence`, `verification`, `model`, `analysis_provider`, `analysis_version`, `prompt_version`, `content_hash`, `cached`, `created_at` |
| `review_actions` | `id`, `review_id`, `scan_id`, `user_id`, `status`, `note`, `created_at`, `updated_at` |
| `reports` | `id`, `scan_id`, `user_id`, `report_number`, `summary`, `recommended_action`, `high_risk_count`, `medium_risk_count`, `normal_count`, `report_data`, `status`, `is_seed`, `created_at` |
| `scan_events` | `id`, `scan_id`, `user_id`, `stage`, `status`, `message`, `error_code`, `duration_ms`, `created_at` |
| `scan_jobs` | `id`, `batch_id`, `user_id`, `url`, `position`, `status`, `attempts`, `error`, `scan_id`, `next_run_at`, `locked_until`, `created_at`, `updated_at` |
| `error_events` | `id`, `user_id`, `scan_id`, `module`, `code`, `message`, `business`, `route`, `severity`, `status`, `resolution`, `created_at` |
| `audit_log` | `id`, `user_id`, `action`, `resource`, `resource_id`, `detail`, `result`, `created_at` |
| `debug_findings` | `id`, `finding_code`, `module`, `component`, `route`, `severity`, `status`, `description`, `expected`, `actual`, `root_cause`, `reproduction`, `fix`, `verification`, `created_at`, `updated_at` |
| `place_cache` | `place_key`, `payload`, `fetched_at` |
| `site_content` | `id`, `published`, `draft`, `published_at`, `updated_at` |
| `system_state` | `id`, `queue_paused`, `pause_reason`, `paused_at`, `daily_link_cap`, `last_worker_run`, `worker_lock_until`, `updated_at` |

The generated types also expose `acquire_worker_lock(_seconds integer) -> boolean`, `claim_scan_jobs(_limit integer) -> scan_jobs[]`, and `has_role(_user_id uuid, _role app_role) -> boolean`. The queue calls the first two through the service client; authenticated queue operations call `has_role`.

### Relationships and uniqueness required by current code

Generated relationship metadata declares:

- `scans.batch_id → scan_batches.id`; `scans.business_id → businesses.id`.
- `scan_jobs.batch_id → scan_batches.id`; `scan_jobs.scan_id → scans.id`.
- `reviews.scan_id → scans.id`.
- `review_analyses.review_id → reviews.id`; `review_analyses.scan_id → scans.id`.
- `review_actions.review_id → reviews.id`; `review_actions.scan_id → scans.id`.
- `reports.scan_id → scans.id` (one report per scan).
- `scan_events.scan_id → scans.id`; `error_events.scan_id → scans.id`.

Required conflict targets and lookup patterns in source:

- Unique `businesses(user_id, place_id)` for the business upsert (with nullable `place_id` semantics reviewed explicitly).
- Unique `review_actions(review_id)` and `review_analyses(review_id)` to match their one-to-one generated relationships and upserts/reads.
- Unique `reports(scan_id)` and `reports(report_number)`.
- Unique `scan_batches.batch_number`; unique `(scan_jobs.batch_id, scan_jobs.position)`.
- Primary key / unique `profiles.user_id`, `place_cache.place_key`, `site_content.id`, and `system_state.id`.
- A non-unique analysis-cache index on `(content_hash, analysis_version, prompt_version)`.

Analysis and report persistence should upsert on `review_id` and `scan_id`, respectively, so retried analysis/report stages remain idempotent with those unique constraints. The local scan pipeline now uses those conflict targets.

Foreign keys must not silently cascade-delete accounts or reports. Prefer `NO ACTION`/`RESTRICT` unless a separately reviewed retention requirement justifies a cascade. Add supporting indexes on referencing columns and on owner/history access patterns.

## Security findings

1. **Worker endpoint accepted a public credential — fixed in the local worktree.** `src/routes/api/public/hooks/scan-worker.ts` now rejects publishable/anon keys, requires `SCAN_WORKER_SECRET`, and compares the bearer token with a timing-safe comparison. The production scheduler/runtime must still be configured with the same newly generated secret; until then this endpoint correctly fails closed.
2. **Privileged retry update lacked an ownership predicate — fixed in the local worktree.** `retryJob` now verifies the user-scoped job belongs to `context.userId`, repeats the owner and retryable-status predicates in the service-role update, and surfaces database errors.
3. **Authenticated request could trigger global worker work — fixed in the local worktree.** `processQueueNow` now requires a successful `has_role(..., 'admin')` check. This depends on the reviewed `has_role` function and role rows being installed in the future schema.
4. **Admin-only UI and operations are not consistently role-gated in application code.** The authenticated layout checks sign-in, while Settings/homepage editing and operational server functions rely on RLS for protection and several operations have no explicit `has_role` check. Enforce admin checks server-side for global/admin operations and use owner-scoped policies for user data; hiding navigation is not authorization.
5. **Service-role use bypasses RLS.** Keep `client.server.ts` imported only inside server handlers; validate user ownership/role before every privileged read/write, and never return credentials or raw privileged records to the browser.
6. **Several reads turn database failures into empty/default results.** This can make missing schema or denied access look like a successful empty history/dashboard. Preserve explicit error reporting for required persisted data and test permission failures separately.
7. **Avatar storage is used but not represented in the database types.** The client uploads to `avatars/<user-id>/...` and signs private URLs. Create a private bucket and folder-owner storage policies, with size/MIME limits, only after confirming the deployed app's upload behavior.

## Proposed migration plan (not applied)

### 0. Mandatory preflight

1. Obtain authorized, read-only catalog results for all schemas: relations, columns, nullability/defaults, constraints, indexes, RLS flags/policies, grants, functions, triggers, storage buckets/policies, and row counts. Table Editor's empty view is not sufficient proof that there is no existing data or objects elsewhere.
2. Compare that inventory with this app contract and current generated types. Resolve any pre-existing objects by additive alteration only; stop on unexpected objects, rows, policies, or ownership.
3. Confirm which auth users exist and the intended initial administrator. Do not create, remove, or modify users/passwords as part of schema setup.
4. Confirm and install a rotated server-side Supabase secret and a dedicated worker secret only through an authorized server secret store. Publishable key only in client environment.
5. Approve the final migration diff and exact rollback/forward-repair procedure before any DDL.

### 1. Additive schema

Create the 17 application tables above with UUID primary keys where the app expects IDs; `timestamptz` timestamps; `jsonb` for structured payloads; numeric types matching rating/confidence/coordinate/count semantics; text arrays for `signals`, `indicators`, and `data_quality_reasons`; and explicit nullability/defaults reconciled to all current inserts. Keep role as `app_role ('admin','user')`; keep workflow/risk/action states as constrained text or reviewed enums based on every value written by the application. Add check constraints for ratings, confidence, counters, and nonnegative limits only after verifying the full write contract.

Create the foreign keys in the relationship list, with non-destructive delete behavior. Add unique constraints and indexes above, plus:

- `(user_id, created_at DESC)` history indexes on owner-scoped `scans`, `scan_batches`, `reports`, `error_events`, and `audit_log`.
- `(scan_id, created_at)` on reviews/events/errors; `(scan_id, risk)` for analysis/report views.
- Partial queue-claim index on `(next_run_at, created_at)` for pending jobs, plus `(status, locked_until)` as needed by the claim function.
- `(user_id, source_url, created_at DESC)` for duplicate scan checks, with a partial running-scan index if it is compatible with existing duplicate semantics.
- `(severity, status)` for `debug_findings`.

Use migrations checked into version control as the only schema source of truth; replace the empty Drizzle placeholder or establish a single documented Supabase SQL migration workflow rather than maintaining competing schemas.

### 2. RLS and grants

Enable RLS on every exposed application table. Begin with no access policies (deny by default), then add least-privilege policies:

- `profiles`: authenticated user may select/insert/update only the row with `user_id = auth.uid()`; no self-role or cross-user changes.
- `user_roles`: user may read their own role; only an existing admin/service role may manage roles. Never allow self-promotion.
- Owner tables (`businesses`, `scan_batches`, `scans`, `review_actions`, `reports`, `scan_events`, `error_events`, `audit_log`): owner checks use `user_id = auth.uid()`. Limit insert/update columns and require owner values to match the JWT.
- Child tables without `user_id` (`reviews`, `review_analyses`): authorize through an `EXISTS` check on the parent `scans.user_id = auth.uid()`.
- `scan_jobs`: owner may read only their jobs/batches; client writes remain denied because enqueue/retry operations use validated server handlers.
- `site_content`: anonymous/public clients may read `published` content only through a safe read path; draft reads and all writes require admin authorization.
- `system_state` and `debug_findings`: admin-only reads/writes; service role only for worker state/locking.
- `place_cache`: service-role only; do not expose cached Places payloads directly to anonymous/authenticated clients.

Keep `anon` and `authenticated` grants limited to operations protected by RLS; revoke direct access to worker tables/functions unless needed. Policies for child rows must verify both the parent scan and any cross-reference (`review_id`, `scan_id`) agree, preventing a caller from attaching another user's review to an owned scan.

### 3. Functions, queue and storage

- Implement `has_role` as a narrowly granted, stable `SECURITY DEFINER` helper with fixed `search_path`, and prevent callers from probing arbitrary users' roles. Grant only the necessary authenticated/service execution.
- Implement `claim_scan_jobs` using row locking (`FOR UPDATE SKIP LOCKED`), bounded `_limit`, pending/due filters, atomic attempt/lock updates, and service-role-only execution.
- Implement `acquire_worker_lock` atomically with expiry and service-role-only execution.
- Initialize the single `system_state` row (`id='main'`) idempotently only after checking for an existing row; choose an approved daily cap. Never reset existing queue state.
- Create a private `avatars` bucket with object policies bound to the first path segment (`auth.uid()`); preserve the app's signed-URL behavior.
- Configure a dedicated worker secret in the trusted scheduler and app runtime. Never use Supabase publishable/anon keys as bearer authentication.

### 4. Verification and rollout gates

After explicit approval and applying the reviewed migration, verify catalog shape, RLS enabled/policy expressions, function security/grants, indexes, bucket policies, and non-destructive row counts. Run auth session/profile create/read/update tests as a normal user and denied cross-user/admin tests. Then run a no-cost persistence round-trip using a controlled fixture (scan → reviews → analyses → report → history read); do not call live Google/OpenAI APIs without explicit authorization. Confirm report/history errors surface rather than rendering success-shaped empty data. Run build, TypeScript, targeted tests, then lint and full tests; report known baseline failures separately.

## Current operational blockers

- The VPS is still inaccessible over SSH; SSH-key/password authentication was denied. Therefore no environment secret was or can be installed on `/opt/rating-guard`.
- GitHub HTTPS fetch access to the public repository is verified and matches local `main` at `fa274da9fb5f8eb9426536599500d08fa0f5fbe0`. GitHub SSH currently fails with `Permission denied (publickey)`; the local key is encrypted and is not registered with the authenticated `theratingguard` account. Keep the working HTTPS remote until a matching key is registered and unlocked.
- A newly rotated Supabase server secret is not available in the authorized deployment environment. Do not reuse credentials pasted into chat or configure an unrotated secret.
- Root/www DNS and production HTTPS were not verified as part of this schema audit.
- Existing local changes are uncommitted and must be preserved; nothing was pushed.
