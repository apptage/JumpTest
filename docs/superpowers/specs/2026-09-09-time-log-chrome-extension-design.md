# Time Log Chrome Extension

Chrome Manifest V3 popup for GammaQuality time tracking: sign in, pick a project (optional WBS task), Play / Pause / Stop, plus the same manual hours form as Project Hub. Postgres is the source of truth for every session — start, pause stretches, stop, project, task, hours, and notes — not Chrome storage alone.

## Status

Draft for review. Do not implement until this spec is approved.

## Decisions locked

| Topic | Choice |
|---|---|
| Browser | Chrome only (Manifest V3). No Firefox. |
| Timer home | Service worker + `chrome.storage.local` cache. **Database is source of truth.** |
| Fields before Play | Project required, WBS task optional (same as Hub Time tab). Last project + last WBS remembered in the extension. |
| Entry modes | Live timer **and** Hub-style manual “+” (hours, date, optional WBS, optional note). |
| Visual | GammaQuality dark (ink / orange tokens), not Clockify light. |
| Note on Stop | Optional, same as Hub. |
| Web app v1 | Same `time_logs` rows. Hub Time tab maps new columns and shows running / from–to. No Hub play button in v1. |

## Goals

- Developers and QA log time without opening the full app.
- One click Play after project (and optional task) is chosen; Pause freezes; Stop completes the row.
- Every timer action is persisted in Postgres with timestamps, not only a final hours number.
- Manual “+” remains available for forgotten time.
- Hub totals keep working off `hours`.

## Non-goals (v1)

- Firefox / Safari / Edge stores.
- Signup, password reset, or Google OAuth in the popup (web app only).
- Tags, billable flag, From/To steppers.
- Changing project or WBS while a timer is running or paused (Stop first).
- Multi-device live sync of the ticking clock in the Hub UI (Hub may show “In progress”; Play/Pause stay in the extension).
- Notifications, idle detection, or auto-stop at midnight.

---

## Full-stack design

### 1. Architecture and boundaries

New package at `extension/`, built with Vite, loaded unpacked from `extension/dist`. Same Supabase URL and anon key as the web app (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). It does not import `ReleaseTracker.jsx`.

```
Popup (React)              Service worker                 Supabase
─────────────              ──────────────                 ────────
Login / logout             Badge + alarms                 Auth JWT
Project + WBS pickers      Rehydrate from DB              RPC timer transitions
Play / Pause / Stop        Cache for instant UI           time_logs + segments
Today’s list + “+” form    Does not compute hours         RLS
                           (RPC does)
```

**Popup** — UI only. It never owns elapsed time. Closing it does not stop the clock.

**Service worker** — keeps the toolbar badge in sync, wakes on `chrome.alarms` (every 60s), and relays Play / Pause / Stop to RPCs. Local storage is a cache (`activeLogId`, last project/WBS) so the popup paints immediately; after network it reconciles with the open `time_logs` row.

**Web app** — Project Hub Time tab remains the team view. It reads the same tables. Manual Hub submit uses `createTimeLog` with `source = 'manual'`. No second logging product.

**Data flow (timer)**

1. User selects project (required) and WBS (optional), clicks Play.
2. Popup → worker → RPC `time_log_start`.
3. RPC inserts `time_logs` (`status = running`) and the first `time_log_segments` row (`ended_at` null).
4. Pause / Resume / Stop call `time_log_pause` / `time_log_resume` / `time_log_stop`. Each call closes or opens segments and updates status, `paused_ms`, `ended_at`, and `hours` in one transaction.
5. Popup lists today’s completed logs for the selected project (current user) plus the active row if it belongs to that project.

**What must not leak**

- Popup must not write `hours` itself for timer rows.
- Worker must not use the service role. Anon key + user JWT only.
- Extension must not read other users’ logs except via existing Hub-equivalent select policies.

### 2. Auth, roles, and RLS

**Login** — `supabase.auth.signInWithPassword`. Session persisted with a `chrome.storage.local` adapter on the Supabase client (popup and worker share the same keys). Restore session on popup open. Email domain remains `@jumppace.com` (same `ALLOWED_EMAIL_DOMAIN`). No signup in the extension.

**Who can use it**

| Role | Extension | Notes |
|---|---|---|
| Developer, QA, Team Lead, Admin | Yes | Any authenticated non-Manager (`can_write()`). |
| Manager | No writes | Same as `can_write()` elsewhere. Show a permission message. |
| Anon / signed out | Login screen only | |

**Project visibility** — `projects` already `SELECT` for all authenticated users. The extension lists the same `fetchProjects()` set. WBS tasks: non-milestone `wbs_items` for the chosen project (`fetchWbsItems`).

**Role matrix (`time_logs` / `time_log_segments`)**

| Action | Own rows | Other users on same project | Manager role |
|---|---|---|---|
| SELECT | Yes | Yes, if `manages_project` **or** same `team_id` **or** `is_project_member` (match Hub intent: team can see project time) | SELECT only if they can see the project (no insert) |
| INSERT | Yes, `user_id = auth.uid()` | No | No |
| UPDATE | Yes, own `running` / `paused` / own completed note | Managers may not edit someone else’s timer | No |
| DELETE | Own rows, or `manages_project` (same as Hub “Remove”) | Managers can delete project logs | No |

`time_log_segments`: no direct client inserts. Only via RPCs (`SECURITY DEFINER` after an ownership check). SELECT follows the parent log’s visibility (join on `time_log_id`).

**One open timer per user** — unique index on `user_id` where `status IN ('running', 'paused')`. A second Play is rejected with a clear error; UI should disable Play and focus the existing session.

### 3. Data model

`time_logs` is referenced in `src/api.js` as requiring `fixes21.sql`, but that file is **not in the repo**. The migration must be **idempotent**: create the table if missing, then add timer columns.

**`public.time_logs`**

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `user_id` | uuid NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| `project_id` | uuid NOT NULL → `projects(id)` ON DELETE CASCADE | |
| `wbs_item_id` | uuid NULL → `wbs_items(id)` ON DELETE SET NULL | Optional; must belong to `project_id` (trigger or RPC check) |
| `source` | text NOT NULL | `'timer'` \| `'manual'` |
| `status` | text NOT NULL | `'running'` \| `'paused'` \| `'completed'` |
| `started_at` | timestamptz NULL | Required when `source = 'timer'` |
| `ended_at` | timestamptz NULL | Set on Stop; null while running/paused; null for manual |
| `paused_ms` | integer NOT NULL default 0 | Sum of gaps between segments |
| `hours` | numeric(6,2) NULL | Set on Stop or on manual insert; null while running/paused |
| `log_date` | date NOT NULL | Timer: local calendar date of first Play (client passes it). Manual: date field. |
| `note` | text NULL | Optional |
| `created_at` | timestamptz NOT NULL default `now()` | |
| `updated_at` | timestamptz NOT NULL default `now()` | Trigger on update |

Checks:

- `source` and `status` constrained to the enums above.
- Completed **timer** rows: `ended_at IS NOT NULL`, `hours IS NOT NULL`, `hours >= 0.01`, `ended_at >= started_at`.
- Completed **manual** rows: `hours > 0` and `hours <= 24` (same Hub cap), `started_at`/`ended_at` null, `paused_ms = 0`.
- Running/paused: `hours IS NULL`, `ended_at IS NULL`.

Indexes:

- `(project_id, log_date DESC)`
- `(user_id, log_date DESC)`
- Unique **partial**: `UNIQUE (user_id) WHERE status IN ('running', 'paused')`

**`public.time_log_segments`**

One row per continuous Play stretch.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `time_log_id` | uuid NOT NULL → `time_logs(id)` ON DELETE CASCADE | |
| `started_at` | timestamptz NOT NULL | |
| `ended_at` | timestamptz NULL | Null = this stretch is currently running |
| `created_at` | timestamptz NOT NULL default `now()` | |

At most one open segment per log (`UNIQUE (time_log_id) WHERE ended_at IS NULL`).

Example: Play 10:00, Pause 10:20, Resume 10:30, Stop 11:00 → two segments (20m + 30m), `paused_ms = 600000`, `hours = 0.83`.

**Hours formula (timer Stop, in the RPC)**

```
worked_ms = SUM( (COALESCE(ended_at, now()) - started_at) ) over segments
hours     = ROUND( worked_ms / 3600000.0 , 2)
paused_ms = (stop_now - time_logs.started_at) in ms − worked_ms
```

If `hours < 0.01` (~36s), Stop **discards** the log (delete row + segments) and returns `{ discarded: true }`. UI toasts “Session too short — not saved.”

**Backfill** (existing Hub-only rows, if the table already exists):

```
source  = 'manual'
status  = 'completed'
paused_ms = 0
-- hours, log_date, note, user_id, project_id, wbs_item_id unchanged
```

**Migration files**

- Live / staging: idempotent `fixes23.sql` (repo convention for incremental SQL).
- Repo dump sync: `supabase/migrations/202609090001_time_logs.sql` with the same objects.
- Do not leave `fixes21` as the only story; `api.js` error copy must say “run the time_logs migration (`fixes23`)” after this ships.

**RPCs** (`SECURITY DEFINER`, `search_path = public`, execute granted to `authenticated` only):

| RPC | Effect |
|---|---|
| `time_log_start(p_project uuid, p_wbs uuid, p_log_date date, p_note text)` | Insert running log + first segment. Reject if user already has running/paused. Reject if not `can_write()`. If `p_wbs` set, it must be a non-milestone item on `p_project`. |
| `time_log_pause(p_id uuid)` | Close open segment, set `status = paused`. Own row only. |
| `time_log_resume(p_id uuid)` | Open new segment, set `status = running`. Own paused row only. |
| `time_log_stop(p_id uuid, p_note text)` | Close segment, set completed + hours, or discard if `< 0.01h`. Own running/paused row. Optional note overwrites if provided. |
| `time_log_discard(p_id uuid)` | Delete own running/paused log. |

Manual inserts stay as table INSERT from the client (Hub + extension “+”), not RPCs.

### 4. API and server logic

**Web `src/api.js`**

- Extend `mapTimeLog` with `source`, `status`, `startedAt`, `endedAt`, `pausedMs`, `updatedAt`. `hours` may be `null` for in-progress rows; Hub totals **must skip** non-completed rows (`status !== 'completed'` or `hours == null`).
- `createTimeLog` always sets `source: 'manual'`, `status: 'completed'`. Keep Hub hours validation (0 < hours ≤ 24).
- Add `fetchMyOpenTimeLog()` — `status IN ('running','paused')` for `auth.uid()`, maybe empty.
- Add `fetchMyTimeLogsForProject(projectId, logDate)` — current user, that date (extension today list). Hub can keep `fetchTimeLogsForProject`.
- Add `startTimeLog` / `pauseTimeLog` / `resumeTimeLog` / `stopTimeLog` / `discardTimeLog` wrapping the RPCs. Snake_case in, camelCase out.
- Update missing-table error to `fixes23`.

**Extension client** — thin copy or shared module of those helpers only (projects, WBS, time logs, auth). Do not bundle the rest of `api.js` if it pulls the full app; prefer `extension/src/api.js` that duplicates the small surface, or a future `src/api/timeLogs.js` imported by both. Shared extract is preferred if Vite can alias it without pulling React into the worker.

**Request shapes**

`time_log_start` → mapped log including `id`, `status: 'running'`, `startedAt`.

`time_log_stop` → `{ discarded: false, log }` or `{ discarded: true, log: null }`.

### 5. UI and client state

**Popup size** — 360×560. Dark tokens from the web app (`--ink`, `--brand`, `--color-text-*`, `--color-background-*`). Load the same CSS variables (copy `index.css` tokens into `extension/src/popup.css`; do not iframe the app).

**Screens**

1. **Signed out** — email, password, Sign in. Domain hint `@jumppace.com`. Errors from Supabase shown inline.
2. **Home (idle)** — header: local date (`Wednesday, Sep 9`), **Total:** sum of *today’s completed* hours for the selected project (this user). Toolbar: Play, Plus. Body: project `<select>`, WBS `<select>` (disabled until project; placeholder “No specific task”; exclude milestones). List of today’s entries or empty state: “No time logs — hit Play or +.”
3. **Running** — project + task names (dropdowns disabled), live elapsed `H:MM:SS` from segments + now, Pause and Stop. Overflow: Discard. Badge on the Chrome icon (`ON` or minutes, brand orange).
4. **Paused** — frozen elapsed, Play (resume), Stop, Discard. Same disabled project/task.
5. **Manual +** — full-height sheet: hours, date (max today), WBS (same as home), note, Save / Cancel. Save calls `createTimeLog`. Disabled while a timer is running/paused (toast: “Stop or pause the timer first” — actually: **block manual + while running/paused** so Hub-style hours and the live session cannot double-count the same stretch). Idle only.

**Play rules**

- Play disabled until a project is selected.
- If last project/WBS exist in `chrome.storage`, preselect them.
- If an open log exists for this user, Home shows the running/paused screen regardless of stored last project (DB wins).

**List row** — hours (or “In progress”), WBS title or “General”, note snippet, from–to if `startedAt`/`endedAt` exist. Own completed rows: Remove (`deleteTimeLog`). In-progress: no Remove; use Discard.

**Hub Time tab (web, v1)**

- Totals: completed `hours` only.
- In-progress rows: label “In progress” + elapsed from `started_at` / `paused_ms`, not added to totals.
- Completed timer rows: show local `startedAt`–`endedAt` next to hours.
- Manual rows: unchanged hours + date.
- Existing log form stays; it writes `source = manual`.

**States**

| State | UI |
|---|---|
| Loading session | Spinner, no flash of login if storage has a session |
| Loading projects | Disabled selects, skeleton list |
| Empty logs | Empty copy above |
| RPC / network error | Toast + retry; timer cache unchanged until RPC confirms |
| Permission (Manager) | “Your role can’t log time.” |
| Unique open-timer violation | Show the existing session |

**Local vs fetched**

- Elapsed display: tick every 1s in the popup from `startedAt` + `pausedMs` + open segment start (from last RPC payload). Worker alarm refreshes badge from the same formula.
- Authoritative status: last successful RPC or `fetchMyOpenTimeLog` on popup open.

### 6. Performance and operations

- Popup open: parallel `fetchProjects`, `fetchMyOpenTimeLog`, and if project selected `fetchWbsItems` + `fetchMyTimeLogsForProject`.
- No N+1: one WBS query per project change.
- Segments are not listed in the popup v1 (used for hours math server-side). Hub does not need to fetch segments v1.
- Env: reuse existing Vite env files. Extension build reads the same `VITE_SUPABASE_*`. Document `npm run build:extension` (new script) and “Load unpacked” → `extension/dist`.
- Host permission in the manifest: the Supabase origin only (`https://*.supabase.co/*` or the exact project URL from env at build time).
- No new Storage buckets.
- Vercel: unchanged. Extension is not deployed to Vercel; zip/`extension/dist` is the artifact (store privately / internal docs).
- `chrome.alarms` period 1 minute so MV3 workers wake and refresh the badge; do not rely on an always-on worker.

---

## Error handling

| Case | Behavior |
|---|---|
| Invalid login | Supabase message in the form |
| Missing migration | Same graceful empty list in Hub; writes tell the user to run `fixes23` |
| Play without project | Button disabled |
| Play with open timer | RPC error; UI already on that session |
| Offline Stop | Keep running locally; retry Stop; do not fake a completed row |
| WBS from another project | RPC rejects |
| Delete completed | Owner or project manager; Hub and extension |
| Session expired | Worker/popup catch 401, clear storage, show login; running DB row stays until they sign in and Stop |

## Testing

- SQL: start / pause / resume / stop hours and `paused_ms` on the 10:00 / 10:20 / 10:30 / 11:00 example → `0.83` hours, `600000` paused_ms, two segments.
- Unique open timer: second start fails.
- Stop `< 0.01h` discards.
- Manual 2.5h / today / optional WBS appears in Hub totals.
- RLS: user A cannot pause user B’s log; user A can select B’s completed logs on a shared project.
- Extension: close popup while running; reopen; elapsed continues; Hub shows In progress; Stop writes hours; Hub total updates.
- Manager role cannot start.
- Badge clears on Stop/Discard.

## File map (implementation)

| Path | Role |
|---|---|
| `fixes23.sql` | Idempotent table + columns + RLS + RPCs |
| `supabase/migrations/202609090001_time_logs.sql` | Same for `db:push` |
| `src/api.js` | Mapper, createTimeLog source, RPCs, Hub-safe totals |
| `src/features/project-hub/index.jsx` | Time tab in-progress + from–to |
| `extension/manifest.json` | MV3, action popup, service_worker, permissions |
| `extension/src/background.js` | Alarms, badge, message router |
| `extension/src/popup/` | React screens |
| `extension/src/supabase.js` | Client + `chrome.storage` adapter |
| `package.json` | `build:extension` |

## Out of scope recap

Clockify tags/billable/From–To, Firefox, Hub Play button, required Stop note, cross-browser store listing.

---

## Spec self-review

- No TBD placeholders. Stop note is optional. Short sessions discard rather than round to zero.
- Architecture (RPC owns hours) matches “every detail in the database.”
- Scope is one product: Chrome timer + manual + Hub read path. No second time-log table.
- Ambiguity closed: one open timer per user; no project switch while running; manual + blocked while a timer is open; Hub totals ignore in-progress rows.
