# JumpTest

A single-page React app for managing releases across **Developer**, **QA**, and
**Admin** roles, backed entirely by **Supabase** (Auth, Postgres, Storage).

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Run the database setup** — in the Supabase **SQL editor**, run all of
   [`supabase_setup.sql`](supabase_setup.sql). It creates every table
   (`profiles`, `projects`, `releases`, `bugs`, `comments`, `notifications`,
   `checklist_items`, `release_checklist`), RLS policies, the signup trigger
   (first user = Admin, `@jumppace.com` only), and the public Storage buckets
   (`apks`, `screenshots`) with upload policies.

3. **Backfill (only if you already had accounts before the tables existed)** —
   run [`backfill_existing_users.sql`](backfill_existing_users.sql).

4. **Credentials** — branch maps to Supabase project:
   - `main` → **GammaQuality** (production)
   - `staging` → **GammaQuality-Staging**

   ```bash
   npm run env:sync   # creates .env.<mode>.local for your current branch
   ```

   Edit that file with keys from **Supabase Dashboard → Project Settings → API**.
   Then `npm run dev` (auto-picks staging on `staging` branch, production on `main`).

   Supabase CLI (migrations): `npm run db:link` then `npm run db:push`.

5. **Email confirmation** — for quick testing, turn it off at
   **Authentication → Sign In / Providers → Email → Confirm email**. The app
   handles both modes.

6. **Run**
   ```bash
   npm run dev
   ```

## Roles

| | Developer | QA | Admin |
|---|---|---|---|
| Submit releases (pick project, upload APK / link) | ✅ | — | ✅ |
| Delete own release | ✅ | — | (any) ✅ |
| Update release status / QA note | — | ✅ | ✅ |
| Report bugs + screenshots | — | ✅ | ✅ |
| Move bug → In progress / Fixed | ✅ | — | ✅ |
| Verify / reopen bug | — | ✅ | ✅ |
| Comment on releases | ✅ | ✅ | ✅ |
| Manage projects, checklists, users, tester assignment | — | — | ✅ |

Accounts are restricted to **`@jumppace.com`** (enforced in UI and DB trigger).
First account to sign up becomes **Admin**.

## Features

- **Projects** — admin-created (name, type, platform). Releases must pick one.
- **Releases** — APK download link, TestFlight link, or Web link (builds are
  shared as permanent links — WeTransfer/expiring hosts are rejected); version,
  notes, status workflow (Pending / In QA / QA Complete / Repeat Bug).
- **Bugs** — QA files bugs (title, description, severity, screenshot) with their
  own workflow (Open / In Progress / Fixed / Verified). Open-bug count badge on
  cards and a Bugs tab in the detail view.
- **Comments** — threaded discussion per release.
- **Notifications** — in-app bell; developers are notified when a bug is filed on
  their release, QA when a bug is marked fixed.
- **Checklists** — admin defines a QA checklist per project; QA must complete it
  before a release can be marked QA Complete.
- **Tester assignment** — admin assigns a QA to a release; only that tester (or
  an admin) can run QA actions on it.
- **Analytics** — per-project release count, bug count, avg submission→QA-complete
  time, repeat-bug rate.
- **History + changelog** — per-project timeline; export QA-complete releases as a
  Markdown changelog (copy or download).

## Files

- `src/ReleaseTracker.jsx` — root component + all screens/modals
- `src/api.js` — all Supabase queries, mutations, and Storage uploads + mappers
- `src/constants.js` — enums, colors, org domain
- `src/ui.jsx` — shared styles and presentational components
- `src/supabaseClient.js` — client init
- `supabase_setup.sql` — full schema, RLS, triggers, Storage
- `backfill_existing_users.sql` — one-time profile backfill
# JumpTest
