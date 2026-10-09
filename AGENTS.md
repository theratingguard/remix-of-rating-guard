<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All data runs through the local demo database in src/integrations/supabase/client.ts (Supabase-compatible API, localStorage-persisted, seeded from src/lib/seed.ts) — the app ships with no external APIs.
- "Server functions" in src/lib/*.functions.ts use the local `localFn` builder from src/lib/mock-server.ts, not TanStack createServerFn — they must run in the browser against the demo database.
