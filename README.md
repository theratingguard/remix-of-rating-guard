# Rating Guard Remix

Rating Guard Remix helps authorized users review publicly available Google
Business Profile reviews, analyze potential policy risks, and save reports.

## Development

This project uses TanStack Start, React, and Vite.

```sh
npm install
npm run dev
```

Available validation scripts:

```sh
npm run build
npm run lint
npm test
```

## Environment

Copy `.env.example` to `.env` and provide credentials for the authorized
Supabase project and any enabled integrations. Use only a Supabase publishable
key in browser-visible `VITE_*` variables. Keep server-side secret keys out of
browser variables, source control, and logs.

Set `VITE_PUBLIC_APP_URL` only to a production domain that has been verified
and authorized for this deployment.

## Deployment

The production deployment target and runtime entry point must be configured
for the chosen host. Do not assume a Vercel or Cloudflare deployment target.

Production uses Nitro's Node server behind Nginx/systemd. Build with
`npm run build`, then run `npm start`. Preserve private environment files and
the previous output before replacing a deployed build.

Apply the application baseline only to a validated empty database. Existing
deployments apply the additive `20261010130000_content_security.sql` migration:
it preserves existing homepage content, initializes a missing row, restricts
draft reads to administrators, and exposes only published content through
`get_published_site_content()`. Never reset existing data to rerun the baseline.
Use `supabase/tests/ownership.sql` and `supabase/tests/content-security.sql`
for transaction-only policy tests; no fixtures should survive.

Homepage previews use the protected `/homepage-preview` route. Content editing
requires an explicitly authorized admin role, not just a signed-in account.
Google link admission accepts HTTPS Maps links on the enumerated Google domains
and official short-link hosts; unsupported country domains must use google.com
or an official short link. Reviews are the up-to-five reviews supplied by Places,
not a full-review export.

Configure `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SCAN_WORKER_SECRET`
only on the server. Bulk admission remains disabled unless
`SCAN_WORKER_SCHEDULED=true` is set after a real scheduler has been verified.
Do not claim background progress based on an open browser or a configured key.
Unconfirmed users must complete email verification; the login screen offers
the supported confirmation-resend operation without bypassing verification.
