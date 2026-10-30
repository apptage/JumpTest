# Miaro Verify

**Next.js** (App Router) + **React** app for managing releases across **Developer**,
**QA**, and **Admin** roles, backed by **Supabase** (Auth, Postgres, Storage).

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

4. **Credentials** — copy [`.env.example`](.env.example) to **`.env.local`** or **`.env.production`**
   and set `NEXT_PUBLIC_SUPABASE_*` from **Supabase Dashboard → Project Settings → API**.
   Or run `npm run env:sync` once to bootstrap `.env.local` from `.env.example`.

   Production on **Vercel** uses dashboard / GitHub `VERCEL_ENV` secrets — not local files.

   Supabase CLI (migrations): `npm run db:link` then `npm run db:push`.

5. **Email confirmation** — for quick testing, turn it off at
   **Authentication → Sign In / Providers → Email → Confirm email**. The app
   handles both modes.

6. **Run**
   ```bash
   npm run dev
   ```

   Production build: `npm run build` then `npm run start`.

## Routes

| Path | Screen |
|------|--------|
| `/` | Dashboard |
| `/projecthub`, `/releases`, `/bugs`, `/wbs`, … | Workspace sections |
| `/?client=<token>` | Public client portal (read-only) |

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

## Project layout

- `app/` — Next.js App Router (`layout`, `[[...section]]` routes, global CSS)
- `src/ReleaseTracker.jsx` — authenticated shell + screens
- `src/api.js` — Supabase queries, mutations, Storage
- `src/supabaseClient.js` — Supabase client
- `scripts/build-extension.mjs` — Chrome extension bundle (esbuild → `extension/dist`)
- `supabase/` — migrations and edge functions
