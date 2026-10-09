# Rating Guard — Real Google + AI Scanning

Goal: replace every simulated part with real Google Places (New) data and AI analysis using your own OpenAI key. Keep the current look and screens.

## What you will get
- A real login, with your super admin account (theratingguard@gmail.com) set up as admin.
- Single and bulk scans that pull real Google business data: name, address, rating, total reviews, Maps link and up to 5 reviews.
- AI review analysis: risk level, category, explanation, summary and a professional report.
- Bulk scans of up to 1,000 links/day, running in the background with progress, retries and caching.
- Full scan history, saved reports and real System Status (Google key, AI key, database checks).
- Nothing is ever invented. If Google returns nothing, the scan clearly says so.

## Steps
1. **Turn on Lovable Cloud** (database, login, server functions, scheduled jobs).
2. **Create the database tables** to match the current screens: businesses, scans, reviews, analyses, reports, batches, job queue, place cache, scan events, audit log, user roles. Each user can only see their own data, and admins can see everything.
3. **Secure keys**: you add `GOOGLE_PLACES_API_KEY` and `OPENAI_API_KEY` through the secure form. They stay on the server only.
4. **Real Google scanning (server side)**:
   - Follow `maps.app.goo.gl` short links to the full Maps page.
   - Extract the place ID, name or coordinates.
   - Use Places Text Search to find the business, with Geocoding as a fallback.
   - Use Place Details to get the rating, review count, reviews and Maps link.
   - Cache each place for 24h so repeated links cost nothing.
5. **AI analysis (server side)**: OpenAI with structured JSON output, one request per business covering all its reviews. Results are cached per review, so a review is never analysed twice.
6. **Background bulk queue**:
   - Links are added to a job queue, and a scheduled worker runs every minute.
   - It handles a small batch each run, with a lock so two runs never overlap.
   - Failed items retry with backoff, up to 3 times.
   - Google or OpenAI quota/billing errors pause the whole queue, and the reason shows in Settings.
   - The progress table refreshes live.
7. **Cost/rate protection**:
   - A daily cap of 1,000 links (adjustable).
   - Only signed-in users can scan.
   - Duplicate links are skipped and Google responses are cached.
   - Limited concurrency.
8. **Built to add more sources later**: one "review source" layer with Google Places as the first source, so Business Profile can plug in later without changing the rest.
9. **Switch every screen from demo storage to the real database**, keeping the same UI. Clear demo data is kept only as visibly labelled samples, or removed (your choice below).
10. **Test with real calls**:
    - A single scan and a bulk scan of about 5 links.
    - The error cases: a bad link, a missing key and a place with no reviews.
    - A cost check, plus re-running the existing tests and a full click-through.

## Known limits (from Google, not the app)
- Places API returns at most 5 reviews per business, with no way to fetch more. Full review lists need Business Profile access later.
- The Google key's application restriction must be **None**. A website restriction blocks server requests. The API restrictions should stay limited to Places (New) + Geocoding.

## Technical details
- Server logic uses TanStack `createServerFn` with auth middleware, replacing `localFn`. The queue worker is a public cron route that checks a shared secret.
- The fake client in `src/integrations/supabase/client.ts` is replaced by the generated Cloud client. Types are regenerated.
- OpenAI is called with raw `fetch` from the server only, using the Responses API with a strict json_schema. 429/5xx errors get bounded backoff, and 401/402/403 errors pause the queue.
- Tables: `place_cache(place_key, payload, fetched_at)` and `scan_jobs(batch_id, url, status, attempts, next_run_at, locked_until)`, plus a unique index on (batch_id, url).
