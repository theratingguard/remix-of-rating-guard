# Rating Guard enterprise foundation

**Brand:** Rating Guard — Powered by Software Vala™

## Repository audit

- The application is **TanStack Start, React, Vite, and TypeScript**, not
  Remix. `package.json` and `bun.lock` are the dependency and lockfile sources;
  the repository also contains npm-oriented README commands.
- `src/routes/` holds file-based routes; `src/components/` contains the UI;
  `src/lib/` contains workflows and business logic; `src/integrations/supabase/`
  contains the generated Supabase client, auth middleware, and database types.
- `supabase/migrations/` is the authoritative SQL history. `drizzle/schema.ts`
  is empty and Drizzle is not the active application persistence layer.
- Server errors pass through `src/lib/errors.server.ts`; the
  `src/lib/logger.server.ts` logger emits JSON and redacts common credential
  values. `.gitignore` excludes private `.env*` files while allowing
  `.env.example`.
- Existing application code already includes Google review analysis, evidence
  capture, policy/rules evaluation, removal submissions and outcomes, task and
  team management, geographic management, and an established dashboard shell.
  These features were retained rather than replaced.
- `src/lib/review-quality.ts` calculates a bounded 0–100 **readiness** score,
  not a reviewer “harm” score. It records unavailable evidence instead of
  inferring facts. `src/lib/evidence.server.ts` stores a content hash and
  explicitly limited Places metadata; it does not claim to collect screenshots.
  `src/lib/rules-engine.server.ts` provides explainable rule signals, and
  `src/lib/removal-workflow.ts` models submissions, outcomes, and appeals.
- `src/integrations/supabase/client.ts` initializes Supabase JS from environment
  variables. The repository's `AGENTS.md` instead describes a browser-local demo
  database. This configuration discrepancy must be resolved before treating
  either persistence mode as the deployment contract.
- Git was already on `main` with a large set of unrelated modified and
  untracked files. They were preserved. No commit was created.

## Architecture and reference review

No reference source was copied. The current stack and UI remain in place; the
new database layer is additive and is not wired into legacy application records.

| Reference | Inspection result | Decision |
|---|---|---|
| [ReplyBuzz](https://github.com/witrfaruk/ReplyBuzz) | MIT; Next.js UI; README says its backend was removed. | Keep the existing Rating Guard shell and adapt no components. |
| [Tenex](https://github.com/krishnikbarman/tenex) | MIT; Supabase multi-tenant examples include broad membership write policies. | Use only as a schema reference; implement narrower scope checks and RLS. |
| [supabase-tenant-rbac](https://github.com/point-source/supabase-tenant-rbac) | BSD-3-Clause reference for permission-oriented RBAC. | Implement a local `rbac.has_permission` design; no source copied. |
| [multitenancy-rbac-supabase-template](https://github.com/chrisorei/multitenancy-rbac-supabase-template) | MIT schema reference. | Adapt table concepts additively; no source copied. |
| [reviewsentry-ai](https://github.com/diusazzad/reviewsentry-ai) | README claims MIT; the inspected LICENSE URL was unavailable. | No code copied; retain the existing policy/rules implementation. |
| [takedown_atlas](https://github.com/moinsen-dev/takedown_atlas) | License could not be verified from the inspected repository URLs. | No code copied; reuse the existing removal workflow. |
| [forensics-pipeline](https://github.com/icancodefyi/forensics-pipeline) | License could not be verified from the inspected repository URLs; its focus is sensitive image discovery. | No code copied; defer pending license, privacy, and product-scope review. |
| [review-removal-deindexing](https://github.com/bhmarketer-ai/review-removal-deindexing) | License was not verified in the retained inspection results. | No code copied; use the existing cautious readiness/evidence logic. |

The existing removal workflow already records verification references and
manual outcomes; it does not submit requests automatically. The evidence and
policy modules are safer fits than importing opaque scoring or collection
pipelines. Any future integration must retain source provenance, avoid treating
negative reviews as policy violations, and avoid collecting sensitive material
without an explicit, reviewed purpose.

## Organization hierarchy

```text
Platform Super Admin
└── Reseller
    └── Client Organization
        ├── Geographic scopes (Global → Country → State → Division → District)
        └── Teams
            ├── Team Manager / Team Leader
            └── Team Members / Client Users
```

Geographic scopes are an organization-scoped overlay, not children of a team.
A `global_manager` is global only within its assigned organization; only
`super_admin` has platform-wide scope. Membership status and active
organization/reseller/team status are checked before a permission is granted.

## Permission matrix

Permissions are stored as keys in `rbac.permission_catalog` and granted through
`rbac.role_permission_grants`. The following describes the seeded system-role
grants; each grant is further limited to the member's assigned scope.

| Role | Scope | Seeded capabilities |
|---|---|---|
| Platform Super Admin | Platform | All catalog permissions; platform membership administration. |
| Reseller Admin | Assigned reseller | Manage/read client organizations, teams, memberships, roles, cases, reviews, reports, audit events, exports, geography, and permitted billing settings. |
| Organization Admin | Assigned organization | Manage/read the organization's teams, memberships, roles, cases, reviews, reports, audit events, exports, geography, and commercial settings. |
| Team Manager | Assigned team | Read the team; manage memberships and roles, cases and reviews; read reports/audit events; invite users and export. |
| Team Leader | Assigned team | Same seeded team-scoped permission set as Team Manager; both remain limited to assigned team scope. |
| Team Member | Assigned team | Read cases, reviews, and reports. |
| Client User | Assigned organization | Read organization, cases, reviews, and reports. |
| Global Manager | Assigned geographic root/descendants | Read teams; manage/read memberships, roles, cases, reviews, and geography; read reports/audit events; export, within the assigned geographic scope. |
| Country Manager | Assigned country/descendants | Same permission keys as geographic managers, constrained to the country subtree. |
| State Manager | Assigned state/descendants | Same permission keys, constrained to the state subtree. |
| Divisional Manager | Assigned division/descendants | Same permission keys, constrained to the division subtree. |
| District Manager | Assigned district | Same permission keys, constrained to the district subtree. |

Authorization is deny-by-default. Membership writes require an allowed scoped
permission and a role whose granted permissions are a subset of the actor's
permissions in that same scope. The database, not frontend role labels, is the
authority. Invitations are not readable or writable by browser roles: the
token hash is restricted to trusted server/database administration until a
reviewed invitation endpoint exists.

## Database design and migration status

[`supabase/migrations/20261028120000_enterprise_tenant_rbac.sql`](../supabase/migrations/20261028120000_enterprise_tenant_rbac.sql)
is an **unapplied, additive migration** defining:

- `resellers`, `organizations`, `organization_teams`, `geographic_scopes`
- `platform_admin_memberships`, `tenant_reseller_memberships`,
  `organization_memberships`, `team_memberships`,
  `geographic_scope_memberships`
- `rbac.role_definitions`, `rbac.permission_catalog`,
  `rbac.role_permission_grants`
- `invitations` and immutable `audit_events`
- Foreign keys, scope indexes, role-scope checks, permission functions,
  membership audit triggers, and RLS policies on all public tenant tables.

Tenant-owned legacy application records have **not** been assigned an
organization ID or backfilled. Their ownership mapping was not verified, so
this migration deliberately does not alter or reassign existing records. The
new tables therefore do not yet provide end-to-end tenant
isolation for legacy scans, reports, reviews, or other application data.
Suspension is the supported lifecycle operation; audit references restrict
hard deletion. Geographic scope structure is protected against client-side
reparenting; hierarchy changes require trusted administration.
Geographic roles also have no relational connection to existing teams or
business data yet; their permission grants must not be presented as enforced
access to those records until scoped query paths and ownership mappings exist.
This tenant migration does not itself implement the separate staff
`reports_to` chain. The eight staff roles are validated by the staff hierarchy
migrations; `profiles.parent_id` is only a mirror of `staff.reports_to`.

The first platform Super Admin must be provisioned by a trusted database
administrator after the migration, because there is intentionally no
self-service or frontend bootstrap path.

[`supabase/tests/enterprise-tenant-rbac.sql`](../supabase/tests/enterprise-tenant-rbac.sql)
is a rollback-only database test for same-tenant permissions, cross-tenant
reads/writes, geographic descendant scope and structure, role-escalation
denial, invitation scope validation, and audit immutability including a
service-role update attempt. It passed as part of the production rollback-only
probe; it has not been run locally.

A read-only inventory of the production Supabase project confirmed existing
`public.teams` and `public.reseller_memberships` tables. The first production
SQL validation attempt stopped at the `public.teams` name collision before
committing any changes. The migration and test now use distinct
`public.organization_teams` and `public.tenant_reseller_memberships` names so
they do not replace those existing application tables. A corrected combined
migration and tenant-isolation probe passed against the production project in a
rollback-only transaction. It exposed and fixed an invitation-table privilege
gap before passing; a follow-up read confirmed that all probe tables and users
were rolled back. A persistent apply was not completed: the Supabase dashboard
session expired before the migration could be submitted, and no database
objects or users were changed. The migration remains unapplied.

The migration uses `CREATE TABLE IF NOT EXISTS` for its new tables and
`CREATE INDEX IF NOT EXISTS` for their indexes; it does not add columns to
existing application tables. It is still a one-time migration, not safe to
blindly rerun: triggers and policies require the migration history to be
reconciled and the SQL to be applied once by the configured migration runner.

The production migration ledger's latest version is `20261015200000`, while
the current database already contains tables that collide with later local
migration names. Directly applying only the new SQL from the dashboard would
leave the ledger and repository migration history inconsistent. The Supabase
CLI is unavailable here, so the migration must wait for a reconciled migration
history and an authorized migration runner.

## Environment and operations

Copy [`.env.example`](../.env.example) to a private `.env` and replace
placeholders. Required Supabase variables are `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` for server access and
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` for browser access.
`SUPABASE_SERVICE_ROLE_KEY` is optional for server-only administrative tasks;
it must never use a `VITE_` prefix or be sent to a browser. The Supabase client
already fails fast and names missing URL/key variables. Development and
production configuration is supplied through environment files/host settings;
the example defaults to development and contains placeholders only.
Integration secrets are optional and should be configured only for enabled
features.

`package.json` provides lint, type-check, test, build, and E2E scripts;
`bun.lock` is the repository lockfile. No dependencies or lockfile were
changed. The worktree environment did not provide Node, npm, Bun, Supabase CLI,
or PostgreSQL, so these checks could not execute here. Existing login-alias
regression tests are present in `src/test/auth.test.tsx`, but are also
unexecuted.

## Authentication investigation and blockers

The auth UI contains login-ID-to-email alias handling and regression coverage.
The production browser login with `demo_global@ratingguard.online` and the
provided password passed and reached `/dashboard`. The dashboard itself denied
private report access, and `/dashboard/global` returned 404 in the earlier
attempt. A read-only production Auth query found a confirmed global account
with a stored password hash; the hash was not exposed. Its application role is
`User`, and it has no linked `staff` record. An exact account lookup across
Auth email local-parts and profile usernames found no other requested demo
account. No password was reset and no user or role was created or changed.
Browser-level dashboard/button coverage for the missing accounts remains
blocked; a screenshot of the authenticated Global dashboard shows the access
denial. The live site's login page still displays an email-only field; the
workspace auth route accepts either an email or login ID and maps a bare ID to
`@ratingguard.online`, but that change is not deployed.

## Verification record and next step

- Passed: final `git diff --check`, package JSON parse, and `.env.example`
  placeholder scan.
- Passed: production rollback-only SQL probe ran the migration and tenant/RLS
  tests; follow-up inspection confirmed no schema or fixture data persisted.
- Passed: production browser login for the existing Global account; its private
  report access check failed as currently configured.
- Not run: persistent SQL migration, auth unit tests, lint, type-check,
  production build, or multi-role browser E2E.
- Blocked: Supabase admin UI session expired before persistent migration or
  account provisioning. VPS SSH remains rejected with `Permission denied`.
- Retried: VPS SSH access was still rejected; local Node, Bun, and Supabase CLI
  remain unavailable. VS Code test discovery reports no registered test
  controller, so the auth unit test could not be executed through that runner.
- The VPS host responds on SSH port 22 and the configured identity file exists,
  but the server rejects that key; no SSH-agent identities are available. The
  terminal exposed to this session is local PowerShell, not the user's open VPS
  terminal, and no VS Code terminal bridge is available here.
- Not performed: password/hash changes, migration application, or production
  data changes. The VPS deployment was also not performed because its configured
  SSH identity was rejected (`Permission denied`).

**Next step for Part 3:** provision a disposable Supabase staging project (or
provide an authorized staging connection), confirm the current schema and
legacy-record ownership mapping, run this migration and rollback-only test
there, then implement an explicit tenant backfill and connect the app's
server-side reads/writes to the scoped permission model before enabling
tenant-sensitive routes.

## Eight-level hierarchy dashboards

The application now has a shared hierarchy dashboard at these role paths:

| Role | Dashboard |
|---|---|
| Global Manager | `/dashboard/global` |
| Country Manager | `/dashboard/country` |
| State Manager | `/dashboard/state` |
| Divisional Manager | `/dashboard/divisional` |
| District Manager | `/dashboard/district` |
| Team Manager | `/dashboard/team-manager` |
| Team Leader | `/dashboard/team-leader` |
| Team Member | `/dashboard/team-member` |

`src/lib/management-hierarchy.ts` maps persisted role labels and URL aliases to
the canonical roles. `src/routes/_authenticated/route.tsx` redirects a hierarchy
user to their own dashboard and denies access to other manager, staff, client,
and reseller workspace routes. The Team Member retains task and evidence pages.
`src/components/app-shell.tsx` shows only the role-specific dashboard and
permitted personal navigation for hierarchy accounts.

`src/components/hierarchy-dashboard.tsx` presents the signed-in role, direct
reports, unique IDs, status, assigned-task counts, task totals, an Add Direct
Report form, per-report review-task assignment, and a hidden profile/wallet
widget. The server derives the child role from the authenticated staff record;
the submitted form cannot choose a role or parent.
The trusted Super Admin user-creation form can provision the initial
Global Manager; subsequent hierarchy accounts are created by their immediate
parent dashboard.

The HTTP endpoints are:

| Endpoint | Server behavior |
|---|---|
| `GET /api/hierarchy/get-team` | Returns the authenticated manager's direct reports, task summary, and profile. |
| `POST /api/hierarchy/add-member` | Creates the immediate next role, sets `staff.reports_to` to the authenticated user, and creates the related team when adding a Team Leader. |
| `POST /api/hierarchy/assign-task` | Assigns a local review to an active direct report through a database RPC. |

`public.hierarchy_direct_reports()` filters `staff.reports_to = auth.uid()`,
the normalized immediate child role, and active/approved status.
`public.team_can_manage_member()` and task-access functions apply the same
direct-report boundary. `public.create_hierarchy_review_task()` validates the
actor, child role, assignee, Google review URL, and an existing local review
before inserting a task. Team-linked tasks retain team/manager/leader IDs;
geographic assignments may have no team IDs. The URL must already match a
review in `public.reviews` (`review_uri` or `review_url`).

The implementation migration is
[`20261101030000_hierarchy_dashboard_api.sql`](../supabase/migrations/20261101030000_hierarchy_dashboard_api.sql).
It is a local migration file only: it has **not** been applied to production.
The three API routes are registered in `src/routeTree.gen.ts`; regenerate this
file with the repository's TanStack router tooling when the JavaScript runtime
is available.

Validation remains blocked in this workspace: Node.js, npm, and Bun are not
installed, the VS Code test runner has no test controller, and no authorized
staging database or browser test session is available. The hierarchy role
mapping tests were updated but not executed. Therefore the dashboards, account
creation, task assignment, and RLS migration have not been verified by an
end-to-end browser/database test, and no production deployment or migration is
claimed.
