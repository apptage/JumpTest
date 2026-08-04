# GammaQuality (JumpTest) — Complete Scope of Work

**Product:** Internal release & QA tracking platform for software teams  
**Stack:** React 18 + Vite SPA · Supabase (Auth, Postgres, Storage, Edge Functions) · Firebase Cloud Messaging  
**Org:** `@jumppace.com` only · First signup = Admin

---

## 1. Authentication & Access Control

| Feature | Scope |
|--------|--------|
| Sign in / Sign up | Email + password; domain restricted to `@jumppace.com` |
| Password reset | Email reset link → recovery flow |
| Set password screen | Post-recovery password update |
| Profile bootstrap | Auto-create profile on signup; self-heal if trigger missed |
| Session persistence | Supabase Auth; JWT-gated data fetch |
| Sign out | Clears session, cache, push device registration |
| Role-based UI gates | Developer, QA, Team Lead, Manager, Admin — each sees different nav/actions |

**Roles**

| Role | Purpose |
|------|---------|
| Developer | Submit releases, fix bugs, comment |
| QA | Test releases, file/verify bugs, drive QA status |
| Team Lead | Manage team projects/users; approve bug close proposals |
| Manager | Read-only executive Command Center + Settings |
| Admin | Full org control |

---

## 2. Teams & Organization

| Feature | Scope |
|--------|--------|
| Team CRUD | Admin creates/deletes teams |
| Team assignment | Users and projects linked to a team |
| Team scoping | Non-admins see only their team's data |
| Team Lead permissions | Manage own team members (Developer ↔ QA); one lead per team |
| Default migration | Existing users/projects assigned to default team |

---

## 3. Projects Module

| Feature | Scope |
|--------|--------|
| Create project | Name, type (Mobile / Web / Both), team assignment |
| Edit / delete project | Admin or Team Lead; delete preserves releases (orphans project link) |
| Project types | Controls available platforms (Web, Mobile, or both) |
| WBS flag | `wbs_enabled` toggled when WBS items exist |
| Search & filter | By name, team, type |
| KPI strip | Counts by type + total releases |

---

## 4. Project Membership & Visibility

| Feature | Scope |
|--------|--------|
| Home members | Permanent project team (developer, QA, lead roles) |
| Support grants | Temporary cross-team access with optional expiry |
| Active membership check | Expired support auto-drops from scope |
| Data scoping | Non-admins see only projects they're active members of |
| QA eligibility | Only project QA members can be assigned to releases |
| Auto home member | Project creator added as first member (non-admin) |

---

## 5. Releases Module

### 5.1 Submit Release

| Feature | Scope |
|--------|--------|
| Project picker | Scoped to visible projects |
| Version | Normalized storage (no double `v` prefix); duplicate detection per stream |
| Platform | Web or Mobile |
| Delivery type | APK, TestFlight, or Web link |
| Environment | Production or Staging |
| Web component | Web App, Admin Panel, Landing Page, Other (per-component streams) |
| Build link | HTTPS URL required; WeTransfer/expiring hosts blocked |
| Release notes | Manual, auto-generated from WBS tasks, or bug-fix template |
| WBS task linking | Pick existing tasks and/or create new tasks at submit |
| Follow-up detection | Auto-supersedes sent-back releases on same platform/component |
| Bug carry-forward | Moves unresolved bugs atomically to new release; closes priors |
| Auto QA assign | Single eligible QA on project → auto-assigned at creation |
| Notifications | Team QA/leads + assigned QA notified on submit |

### 5.2 Release Lifecycle (QA Gate)

```
qa_pending → qa_in_progress → qa_done → approved | sent_back
closed = superseded (terminal, read-only)
```

| Feature | Scope |
|--------|--------|
| Status transitions | Forward-only QA workflow |
| Approve gate | Blocked if open critical/major bugs or incomplete checklist |
| Send Back | Only when blocking bugs exist |
| QA notes | Free-text note per release |
| SLA badges | Time-in-status warnings (24h / 72h / 48h thresholds) |
| Edit window | Developer can edit own release within 8 hours |
| Delete release | Owner or admin; confirmation required |
| Read-only closed | Superseded releases cannot receive new bugs |

### 5.3 Release Detail Modal

| Tab | Scope |
|-----|--------|
| Details | Version, platform, env, links, submitter, assigned QA, notes, lineage (supersedes/superseded-by), SLA |
| Bugs | List, file bug, status actions, screenshots, WBS task link |
| Comments | Threaded discussion |
| Checklist | Per-project QA checklist completion |

### 5.4 QA Assignment

| Feature | Scope |
|--------|--------|
| Manual assign | Team Lead/Admin assigns QA from project QA pool |
| Authorization | Only assigned QA (or team manager) can run QA actions |
| Timestamp | First assignment stamped for cycle-time analytics |

---

## 6. Bug Tracking Module

### 6.1 Bug Filing

| Field | Scope |
|-------|--------|
| Title, description | Required |
| Severity | Critical, Major, Minor |
| Screenshot | Upload to Supabase Storage |
| Tags | Mobile/Web Frontend, Backend, Auth, etc. |
| Feature/Epic | Authentication, Payments, Dashboard, etc. |
| WBS task link | **Required** on WBS-linked feature releases |
| Origin tracking | `origin_release_id`, carry-forward flags, iteration count |

### 6.2 Bug Workflow

```
open → in_progress → fixed → verified
         ↓              ↓
      disputed    pending_tl (dev proposal) → TL approve/reject
```

| Action | Who |
|--------|-----|
| File bug | QA, Admin |
| Mark In Progress / Fixed | Developer, Admin |
| Verify / Reopen | QA, Team Lead, Admin |
| Dispute (Needs Clarification) | QA ↔ Developer |
| Propose close (Not a Bug / Out of Scope / Duplicate) | Developer → `pending_tl` |
| TL approve/reject close | Team Lead, Admin |
| Delete bug | Authorized users; triggers WBS reconciliation |

### 6.3 Bug History & Audit

| Feature | Scope |
|--------|--------|
| `bug_history` log | Created, fixed, verified, carried_forward, proposed_close, etc. |
| Bug timeline UI | Per-bug audit trail in detail views |
| Bug comments | Thread per bug (separate from release comments) |

### 6.4 Blocking Logic

| Severity | Blocks Approve? | Blocks WBS task complete? |
|----------|-----------------|---------------------------|
| Critical | Yes | Yes |
| Major | Yes | Yes |
| Minor | No | No |

---

## 7. WBS (Work Breakdown Structure)

### 7.1 WBS Builder

| Feature | Scope |
|--------|--------|
| Flat item model | One status per item; grouped by platform_type → module |
| Item fields | Title, description, module, platform type, priority, est. date, assignee, dev comments |
| Statuses | Not Started, In Progress, In QA, Completed, Blocked |
| Dev-set statuses | Not Started, In Progress, Blocked |
| QA-driven statuses | In QA, Completed (via release reconciliation) |
| CRUD | Create, edit, delete, reorder items |
| Bulk add | Preset packs (Auth, Profile, E-commerce, Notifications, Admin) |
| Platform milestones | Completion/deployment dates per platform group |
| Delete WBS | Whole project or single platform group |

### 7.2 WBS Import (Migration)

| Feature | Scope |
|--------|--------|
| File upload | Excel/CSV via `xlsx` parser |
| Column mapping wizard | Auto-guess + manual map |
| Additive import | New `import_key` rows only; existing untouched |
| Status normalization | Maps spreadsheet labels → enum |

### 7.3 Release ↔ WBS Integration

| Feature | Scope |
|--------|--------|
| Link tasks at submit | Selected tasks → `in_qa` |
| New tasks at submit | Created under release platform, linked, set In QA |
| Reconciliation on Approve/Send Back | Per-task: blocking bugs → In Progress; else Completed |
| Reconciliation on bug verify/reopen/delete | Re-evaluates linked task |
| Bug counts per task | Open bugs surfaced on WBS item detail |

### 7.4 WBS Share Link

| Feature | Scope |
|--------|--------|
| Client link from WBS page | Reuses client portal token |

---

## 8. QA Checklists

| Feature | Scope |
|--------|--------|
| Template CRUD | Admin defines checklist items per project (ordered) |
| Per-release state | Checkbox completion stored per release |
| Gate enforcement | All items must be checked before Approve |
| Empty checklist | Skipped if project has no items |

---

## 9. Comments & Collaboration

| Feature | Scope |
|--------|--------|
| Release comments | Threaded (one reply level) |
| @mentions | Name-based mention detection → notification |
| Participant notify | Submitter + assigned QA notified on new comment |
| Delete comment | Supported |
| Author metadata | Name, role, timestamp stored |

---

## 10. Notifications

### 10.1 In-App (Bell)

| Feature | Scope |
|--------|--------|
| Notification feed | Last 50, unread count badge |
| Mark read / mark all read | Per-item and bulk |
| Deep link | Click → open release on dashboard |
| Poll interval | 30s refresh |

### 10.2 Push (FCM Web)

| Feature | Scope |
|--------|--------|
| Device registry | `user_devices` table; upsert on opt-in |
| Opt-in | Settings → Enable push on this device |
| Foreground | Toast + bell refresh |
| Background | Service worker; tap opens `/?release=<id>` |
| Edge Function | `send-push` fans out via FCM HTTP v1 |
| Events wired | Submit, assign, QA status, approve/send back, bug filed/fixed/disputed, comment, mention, TL close review |

---

## 11. Dashboard (Release Board)

| Feature | Scope |
|--------|--------|
| Three-column layout | Left sidebar, main board, right panel |
| Project/platform tree | Sidebar navigation with open bug counts |
| Stat cards | Count per release status in current context |
| Filters | Project, platform, release type, status |
| Release cards | Version, status, project, open bugs, assigned QA, SLA |
| Hide closed | Superseded releases hidden unless status filter applied |
| Greeting + summary | Release/project/open bug counts |
| Quick actions | Submit release, admin shortcuts (right panel) |
| Page persistence | Active page saved to `localStorage` |

---

## 12. Bugs Page (Cross-Project)

| Feature | Scope |
|--------|--------|
| Scope | Active (non-closed) releases only |
| Filters | Search, status, severity, platform, tag, feature, project, team, dev, QA, date range |
| Sort | Newest / oldest |
| KPI strip | Total, needs dev, awaiting QA, verified, carried, aging |
| Aging panel | Bugs over 5-day SLA |
| Bottlenecks | Over-SLA releases, dev/QA overload |
| Bug cards | Full detail + inline actions |
| Open release | Navigate to release detail modal |

---

## 13. Analytics Module

### 13.1 Team Lead Analytics

| Feature | Scope |
|--------|--------|
| Modes | Historical (all releases) vs Current (live board) |
| Filters | Team, project, platform, env, developer, QA, version, date range |
| Release KPIs | Submitted, approved, sent back, pass rate, rejection rate |
| Cycle times | Submit→QA complete, assign time, QA duration |
| Bug KPIs | Active, severity mix, carry-forward rate, avg iterations |
| Workload matrix | Per developer / QA release + bug load |
| QA quality | Resolution outcomes (Not a Bug, Out of Scope, etc.) |
| Charts | Status donut, severity stacked bar, completion timeline |
| Release history table | Paginated with drill-down |
| Changelog export | Markdown copy/download for approved releases |

### 13.2 Admin Manager Dashboard

| Feature | Scope |
|--------|--------|
| Overview tab | Org-wide pass rate, cycle time, bug totals |
| Teams tab | Per-team health, pass rate, open/critical bugs |
| Projects tab | Health score, active release, pass rate |
| People tab | Per-member workload and performance |
| Attention tab | Bottlenecks and SLA breaches |
| Date ranges | Week, month, 3 months, custom |
| Member detail modal | Individual drill-down |

---

## 14. Command Center (Executive / Manager)

| Feature | Scope |
|--------|--------|
| Audience | Manager role (read-only); Admin bridge access |
| Drill-down | Team → Developer → Project → detail panels |
| Per-project rollup | WBS %, pass rate, open/critical bugs, health score |
| Per-developer rollup | Projects, pending QA, open bugs, worst health |
| WBS health | Completion %, milestone risk |
| Read-only panels | Release/bug detail — no operational actions |
| Team filter | Scope all drill-downs |

---

## 15. Client Portal (Public)

| Feature | Scope |
|--------|--------|
| Route | `/?client=<token>` — no login |
| Token management | Admin creates/revokes per project |
| Public RPC | `public_project_status` (SECURITY DEFINER) |
| Visible data | Project name, release list, WBS progress, optional open bug counts |
| Hidden data | Dev comments, internal notes, user identities |
| WBS view | Platform → module tree, status stats, search/filter |
| Client-friendly labels | e.g. "QA approved" not "Completed" |
| Toggle | `show_open_bugs` on/off per link |

---

## 16. Administration

### 16.1 Users

| Feature | Scope |
|--------|--------|
| List users | Admin: all; Team Lead: own team |
| Create user | Admin via Edge Function `admin-create-user` (any role, no email confirm) |
| Update role/team | Admin any; Team Lead: Developer ↔ QA on own team |
| Delete user | Admin via RPC |
| Self-signup | Developer or QA only |

### 16.2 Teams (Admin)

| Feature | Scope |
|--------|--------|
| Create / delete team | Delete unassigns members/projects |
| Team stats | Member count, project count |

### 16.3 Projects Tab (Extended)

| Feature | Scope |
|--------|--------|
| Checklist management | Add/remove items per project |
| Project members | Add home/support members, roles, expiry |
| Client link | Create, copy URL, toggle open bugs, revoke |

---

## 17. App Shell & Settings

| Feature | Scope |
|--------|--------|
| Nav rail | Role-filtered navigation |
| Header | Global search (releases/bugs/projects), notifications, quick actions |
| Global search | Jump to release from anywhere |
| Settings page | Profile info, team, push opt-in, SLA reference, sign out |
| Toast system | Success/error feedback |
| Deep links | `/?release=<id>` opens release on load |

---

## 18. Shared Metrics Layer

| Module | Metrics |
|--------|---------|
| `releaseMetrics.js` | Pass rate, cycle time, bottlenecks, workload |
| `bugMetrics.js` | Active/closed, workflow buckets, aging, carry-forward |
| `wbsMetrics.js` | Completion %, milestone risk, composite health |
| `filters.js` | Unified filter pipeline (dashboard, bugs, analytics) |

**Independence rule:** Release status, WBS progress, pass rate, and bug metrics are separate — never conflated in logic or copy.

---

## 19. Backend & Infrastructure

| Component | Scope |
|-----------|--------|
| Database | Postgres via Supabase — profiles, teams, projects, project_members, releases, bugs, bug_history, bug_comments, comments, notifications, checklist_items, release_checklist, wbs_items, wbs_platform_targets, release_tasks, client_links, user_devices |
| RLS | Authenticated read/write; role guards on profile updates; public RPC for client portal |
| Storage | Public buckets: `screenshots` (APK bucket legacy) |
| Edge Functions | `admin-create-user`, `send-push` |
| Triggers | Signup profile creation, domain enforcement, role change guard |
| RPCs | `move_bugs_to_release`, `set_wbs_enabled`, `public_project_status`, team admin RPCs |
| Deploy | Vite build → Vercel (`vercel.json`) |
| Env | `VITE_SUPABASE_*`, optional `VITE_FIREBASE_*` for push |

---

## 20. SLA Definitions

| Entity | Threshold |
|--------|-----------|
| QA Pending | 24h warn at 75%, over at 24h |
| QA In Progress | 72h |
| QA Done | 48h |
| Open bugs | 5 days |

---

## 21. Role Permission Matrix (Summary)

| Action | Dev | QA | TL | Manager | Admin |
|--------|-----|-----|-----|---------|-------|
| Submit release | ✅ | — | ✅ | — | ✅ |
| QA on assigned release | — | ✅ | ✅* | — | ✅ |
| File/verify bugs | — | ✅ | ✅* | — | ✅ |
| Fix bugs | ✅ | — | — | — | ✅ |
| Propose bug close | ✅ | — | — | — | — |
| Approve bug close | — | — | ✅ | — | ✅ |
| Manage projects/users | — | — | ✅** | — | ✅ |
| Command Center | — | — | — | ✅ | ✅ |
| Analytics | — | — | ✅ | — | ✅ |
| Client links | — | — | — | — | ✅ |
| WBS builder | ✅ | ✅ | ✅ | — | ✅ |

\*Own team only · \*\*Own team scope

---

## 22. Out of Scope / Not Implemented

- Native mobile app (push schema is future-ready)
- URL router (page state via `localStorage`)
- APK file upload (links only)
- Hard multi-tenant orgs (single org domain)
- Automated CI/CD integration
- External issue tracker sync (Jira, Linear, etc.)

---

*This document reflects the current codebase. The app brand in UI is **JumpTest**; the repo/workspace name is **GammaQuality**.*
