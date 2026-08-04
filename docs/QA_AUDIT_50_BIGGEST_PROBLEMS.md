# GammaQuality — Senior QA Audit: 50 Biggest Bugs & Problems

**Date:** 2026-08-03  
**Scope:** Full application read-only audit (releases, bugs, WBS, auth/RLS, analytics, Command Center, client portal, shell).  
**Method:** Code review against senior QA rules (`.cursor/rules/senior-qa.mdc`, `.cursor/skills/senior-qa/`).  
**Out of scope:** No fixes were implemented in this pass.

### Severity legend

| Severity | Meaning |
|----------|---------|
| **Critical** | Data loss, auth bypass, false gate outcome, or broken client truth |
| **Major** | Wrong metrics, broken workflow, serious UX/process failure |
| **Minor** | Confusing copy, inconsistency, polish, lower blast radius |

### Scorecard

| Severity | Count |
|----------|------:|
| Critical | 12 |
| Major | 28 |
| Minor | 10 |
| **Total** | **50** |

---

## Critical (1–12)

### 1. Permissive RLS — any signed-in user can mutate all app data
- **Area:** Security / RLS  
- **Evidence:** `supabase_setup.sql` (`*_all` policies `using (true)`); `wbs_setup.sql`; `teams_setup.sql`  
- **Impact:** UI role gates are cosmetic. Any `@jumppace.com` account can approve releases, delete bugs, rewrite WBS, alter memberships via the Supabase client.  
- **Repro:** As Developer, call `supabase.from('releases').update({ status: 'approved' })`.

### 2. `move_bugs_to_release` RPC — no caller authorization
- **Area:** Security / carry-forward  
- **Evidence:** `src/api.js` → `moveBugsToRelease`; `fixes15.sql` (SECURITY DEFINER RPC, gitignored)  
- **Impact:** Any authenticated user can close arbitrary prior releases and move bugs onto any target release.  
- **Repro:** `rpc('move_bugs_to_release', { p_to_release, p_prior_ids, p_moved_by })`.

### 3. Team Lead can escalate to Admin (DB allows; UI only hides)
- **Area:** Auth / RBAC  
- **Evidence:** `teams_setup.sql` → `can_manage_roles()`, `enforce_role_change()`; `src/api.js` → `updateProfile`  
- **Impact:** Team Lead can set `role: 'Admin'` on self or others → full admin, user creation, deletes.  
- **Repro:** As Team Lead, `updateProfile(id, { role: 'Admin' })`.

### 4. Hard-delete release/bug destroys audit trail (CASCADE)
- **Area:** Data loss / audit  
- **Evidence:** `src/api.js` → `deleteRelease`, `deleteBug`; cascades on bugs/comments/`bug_history`  
- **Impact:** Permanent loss of history used for pass rate, Release History, and Manager archive goals. Violates senior-QA anti-pattern.  
- **Repro:** Delete a release that has bugs → bugs + history + comments gone.

### 5. Release status transitions / Approve gate enforced only in UI
- **Area:** Releases / security  
- **Evidence:** `STATUS_TRANSITIONS` in `src/constants.js` (client-only); `api.updateRelease` bare update; `attemptStatus` only in UI  
- **Impact:** Client can jump to `approved` with open majors, skip checklist, reopen terminal states → false pass rate and WBS assumptions.  
- **Repro:** `updateRelease(id, { status: 'approved' })` while open majors exist.

### 6. Reopening a verified bug does not re-fail WBS
- **Area:** Bugs / WBS  
- **Evidence:** `src/shared/bug-actions.jsx` Reopen; `ReleaseTracker.jsx` `handleBugStatus` only reconciles on `verified`  
- **Impact:** Reopened critical/major leaves linked task `completed`. Gate truth and WBS diverge.  
- **Repro:** Verify major → task Completes → Reopen bug → task stays Completed.

### 7. Approved releases stay mutable for bugs (gate becomes a lie)
- **Area:** Releases / Bugs / WBS  
- **Evidence:** `isReadOnly` only checks `closed` (`constants.js`); Bugs tab allows filing after Approve; filing blocking bug forces WBS `in_progress`  
- **Impact:** Post-Approve majors reopen WBS while release badge stays Approved; Analytics pass rate can demote the build while UI still says Approved.  
- **Repro:** Approve → file major on a task → task In Progress; status still Approved.

### 8. Bug actions ignore QA assignment; status buttons do not
- **Area:** Releases / Bugs authz  
- **Evidence:** `canDoQA` checks assignee in DetailModal; `BugsTab` / Bugs page use role-only `isQA`  
- **Impact:** Unassigned QA can file/verify/reopen on another QA’s release — broken ownership and audit.  
- **Repro:** Assign QA A → log in as QA B → Report / Verify still works.

### 9. Any Team Lead can approve/reject `pending_tl` closes (no team scope)
- **Area:** Bugs / RBAC  
- **Evidence:** `bugs/index.jsx` / `releases/index.jsx` `isManager = Team Lead || Admin` without team check; release QA uses team-scoped `isManagerOfSelected`  
- **Impact:** Cross-team close approval without project ownership.  
- **Repro:** Team X Lead opens Team Y `pending_tl` bug → Approve close.

### 10. Client portal hides all release status when WBS is enabled
- **Area:** Client portal  
- **Evidence:** `src/features/client/index.jsx` — release progress/history behind `{!showWbs && (…)}`  
- **Impact:** WBS-enabled clients never see build status, sent-back, or approved releases — only the breakdown.  
- **Repro:** Open client link for a WBS project → no release section.

### 11. `isManager` / `isManagerRole` means two opposite things
- **Area:** Role gating / naming  
- **Evidence:** Shell/`ReleaseTracker`: `isManager` = role `Manager`; Bugs/Releases: `isManager` = Team Lead \|\| Admin; `constants.isManagerRole` = Manager only vs local `isManagerRole` in bugs = TL\|\|Admin  
- **Impact:** Highest regression risk on every permission change; easy to grant executive Manager ops rights or strip TL rights.  

### 12. Pass rate formula disagrees: Command Center vs Analytics
- **Area:** Metrics  
- **Evidence:** Command Center raw `approved/decided` (`command-center/index.jsx`); `computeReleaseMetrics` demotes approved-with-open-blockers (`releaseMetrics.js`)  
- **Impact:** Same org sees different pass rates; Command Center can hide gate violations.  

---

## Major (13–40)

### 13. Send Back allowed with zero blocking bugs
- **Area:** Release gate  
- **Evidence:** `attemptStatus` only validates Approve (`releases/index.jsx`)  
- **Impact:** Process noise collapses pass rate and reopens WBS tasks unnecessarily. Contradicts senior-QA skill.  

### 14. Carry-forward / supersede scoped only to same submitter
- **Area:** Carry-forward  
- **Evidence:** `fetchSentBackReleases(..., user.id)`; SubmitModal filters `submittedById === user.id`  
- **Impact:** TL/other dev “follow-up” does not close original `sent_back` or move bugs → duplicate cycles, orphaned bugs.  

### 15. Mid-cycle verify can mark WBS Completed before release decision
- **Area:** WBS  
- **Evidence:** `handleBugStatus` → `reconcileWbsTaskForBug` on verify  
- **Impact:** Tasks show Completed while release still in QA — managers read “shipped.”  

### 16. Filing a blocking bug immediately yanks task out of In QA
- **Area:** WBS  
- **Evidence:** `handleAddBug` → `setWbsItemStatus(..., 'in_progress')` for blocking severity  
- **Impact:** Board flaps during active QA before disposition.  

### 17. Delete bug never re-reconciles WBS
- **Area:** Bugs / WBS  
- **Evidence:** `handleDeleteBug` — no `reconcileWbsItems`  
- **Impact:** Deleting last open major leaves task stuck In Progress.  

### 18. Closed (superseded) release Bugs tab lies about history
- **Area:** Carry-forward / DetailModal  
- **Evidence:** Copy claims “as they were at close”; `moveBugsToRelease` moves unresolved bugs off prior  
- **Impact:** Prior builds look empty — audit appears lost unless Timeline is opened.  

### 19. Non-atomic release submit (partial failure / race)
- **Area:** Reliability  
- **Evidence:** `handleCreateRelease` — create → WBS → tasks → move bugs as separate steps  
- **Impact:** Mid-flight failure leaves orphan release, tasks stuck `in_qa`, priors still `sent_back`.  

### 20. Owner identity fallback by display name
- **Area:** Releases authz  
- **Evidence:** `isOwner = submittedById === user.id || submittedBy === user.name`  
- **Impact:** Name collision grants edit/delete within 8h window to wrong user.  

### 21. `sent_back` remains fully editable for bugs/notes
- **Area:** Releases  
- **Evidence:** Not `isReadOnly`; bugs/checklist/notes still active  
- **Impact:** New bugs on doomed build strand if a different person submits the follow-up (#14).  

### 22. Public Storage buckets + open object policies
- **Area:** Security / storage  
- **Evidence:** `supabase_setup.sql` — `apks` / `screenshots` public; authenticated insert/update/delete  
- **Impact:** Anyone with URL downloads builds/screenshots; any user can overwrite/delete others’ objects.  

### 23. Client portal leaks release notes; token never expires
- **Area:** Client portal  
- **Evidence:** `public_project_status` returns notes; `createClientLink` — no expiry  
- **Impact:** Forever bearer URL; notes may include internal detail; referrer leakage.  

### 24. Schema migrations `fixes*.sql` are gitignored
- **Area:** Ops / reliability  
- **Evidence:** `.gitignore` → `fixes*.sql`; app depends on fixes13–18 RPCs/tables  
- **Impact:** Fresh clone cannot rebuild prod schema; security fixes invisible to review/CI.  

### 25. `send-push` allows any user to push to any `user_id`
- **Area:** Edge functions  
- **Evidence:** `supabase/functions/send-push/index.ts` — auth only, no recipient ownership  
- **Impact:** Spam/phishing pushes; uses service role + FCM.  

### 26. `admin-create-user`: weak password + Admin minting + CORS `*`
- **Area:** Admin  
- **Evidence:** `supabase/functions/admin-create-user/index.ts` — password length &lt; 6; role includes Admin; `Access-Control-Allow-Origin: *`  
- **Impact:** Weak pre-confirmed accounts; Admin proliferation; wide CORS.  

### 27. No DB CHECK constraints on status/severity
- **Area:** Validation  
- **Evidence:** Free-text status/severity in SQL; enums only in `constants.js`  
- **Impact:** Invalid values break filters, SLA, gate, analytics.  

### 28. Hard-delete project orphans releases inconsistently
- **Area:** Cascades  
- **Evidence:** `deleteProject`; `releases.project_id ON DELETE SET NULL`; WBS/checklist cascade  
- **Impact:** Ghost releases with null project still hold bugs in boards/analytics.  

### 29. Manager “read-only” is UI-only
- **Area:** Authz  
- **Evidence:** Manager nav lock in `ReleaseTracker.jsx`; RLS still open  
- **Impact:** Manager JWT can mutate releases/bugs/WBS via API.  

### 30. Dual “command centers” — Manager never gets ManagerDashboard
- **Area:** Product / nav  
- **Evidence:** Manager → Command Center only; Admin Analytics → `ManagerDashboard` titled “command center”  
- **Impact:** Role named Manager lacks the dashboard named for managers; Admins see two overlapping UIs with different math.  

### 31. Project health algorithms disagree
- **Area:** Metrics  
- **Evidence:** `ManagerDashboard.projectHealth` vs `computeCompositeHealth`; undecided → rate 100  
- **Impact:** Same project Healthy vs At risk across surfaces; empty projects look healthy.  

### 32. Dashboard “Open bugs” undercounts vs Analytics
- **Area:** Metrics / filters  
- **Evidence:** Dashboard counts `status === 'open'` only; elsewhere `isActiveBug` (all non-verified)  
- **Impact:** Cards show 0 while Bugs/Analytics show many active items.  

### 33. Command Center developer strip: project-wide bugs + wrong QA name
- **Area:** Command Center  
- **Evidence:** `BugsCell` uses project open bugs; QA name from project active release  
- **Impact:** Managers mis-attribute bugs and QA when drilling by developer.  

### 34. WBS loading treated as “no WBS”
- **Area:** Command Center  
- **Evidence:** `wbs.loading` set but not rendered; empty items while loading  
- **Impact:** Transient false “no WBS” and wrong health until fetch completes.  

### 35. ManagerDashboard date range barely affects headline KPIs
- **Area:** Analytics  
- **Evidence:** Pass ring / cycle / active bugs use all-time; range only drives small stats  
- **Impact:** Users change week/month and think big numbers moved — they mostly did not.  

### 36. “Production Bugs” / severity tiles mix lifetime with live language
- **Area:** Analytics  
- **Evidence:** `prodBugs` and severity tiles include verified historical bugs; neighboring “Critical” uses active-only  
- **Impact:** Looks like live production incidents; overstates residual risk.  

### 37. Client portal remaps QA statuses into delivery language
- **Area:** Client portal  
- **Evidence:** `qa_pending` → “In development”; `sent_back` → “Resolving issues”; `approved` → “Completed”  
- **Impact:** Clients confuse QA gate with delivery completion.  

### 38. Header title wrong on WBS; project search is a dead end
- **Area:** Shell  
- **Evidence:** `PAGE_TITLES` has no `wbs` → falls back to Dashboard; search project → navigates to projects list only  
- **Impact:** Broken orientation; search implies open project but dumps list.  

### 39. Manager notifications are a dead end
- **Area:** Manager UX  
- **Evidence:** Notification routes to Command Center; `onOpenRelease` no-ops for Manager  
- **Impact:** Actionable alerts with no drill-through.  

### 40. Bugs page vs Analytics history modes differ by role
- **Area:** Filters  
- **Evidence:** Bugs = `filterBugs` (hides closed-release bugs); TL Analytics has Current/Historical toggle; Admin ManagerDashboard always historical  
- **Impact:** Same “Analytics” label, different datasets; verified bugs on closed builds vanish from Bugs board.  

---

## Minor (41–50)

### 41. Team Lead Analytics treats non-QA as “developers”
- **Area:** Analytics  
- **Evidence:** `p.role !== 'QA'` includes Team Lead/Admin in developer performance table  
- **Impact:** Inflated/wrong developer stats.  

### 42. Dashboard copy: “QA Approved” = “shipped clean”
- **Area:** Dashboard / senior QA model  
- **Evidence:** `dashboard/index.jsx` StatCards subcopy  
- **Impact:** Trains teams that Approve means zero defects — conflicts with severity gate.  

### 43. Command Center unusable on narrow viewports
- **Area:** Mobile  
- **Evidence:** Fixed multi-column grids; CSS stacks nav ≤860px but CC has no breakpoint  
- **Impact:** Primary Manager surface overflows on phone.  

### 44. Users admin KPIs omit Manager; Settings pill has no Manager tone
- **Area:** Admin / Settings  
- **Evidence:** Role KPI strip skips Manager; Settings Pill map incomplete  
- **Impact:** Managers invisible in headcount / weak affordance.  

### 45. Bugs tab badge undercounts active work
- **Area:** DetailModal  
- **Evidence:** Badge uses `status === 'open'` only  
- **Impact:** Badge “1” while many bugs still block Approve.  

### 46. QA note state not synced when release prop updates
- **Area:** DetailModal  
- **Evidence:** `useState(release.qaNote)` once; no sync effect  
- **Impact:** Stale textarea; risk of overwriting newer note.  

### 47. Misleading WBS copy on bug file form
- **Area:** Bugs UX  
- **Evidence:** Copy says task returns to In Progress until resolved; code only moves blocking severities  
- **Impact:** Encourages severity inflation / wrong Send Back.  

### 48. Completed / In QA tasks hard to re-link for regression
- **Area:** WBS / Releases  
- **Evidence:** Selectable tasks exclude `in_qa` / `completed`  
- **Impact:** Re-test requires unlock or duplicate WBS rows.  

### 49. `Awaiting QA` metric includes `pending_tl`
- **Area:** Bug metrics  
- **Evidence:** `bugMetrics.js` `awaitingQa: fixed + pending_tl`  
- **Impact:** TL queue looks like QA backlog.  

### 50. Best-effort `bug_history` logging silently drops events + reject-close leaves stale fields
- **Area:** Audit reliability  
- **Evidence:** `logBugHistory` warns, never throws; reject close clears resolution but not `resolution_note` / `resolution_at`  
- **Impact:** Under-counted Release History stats; stale dispute metadata after Reject.  

---

## Cross-cutting themes

1. **Trust-the-UI security model** — RLS open; gates and role rules are client-side (#1–#5, #8–#9, #25–#29).  
2. **Metric fragmentation** — Pass rate, open bugs, health disagree across Dashboard / Analytics / Command Center (#12, #31–#36, #41–#42).  
3. **WBS ↔ bug lifecycle holes** — reopen, delete, mid-QA complete, post-approve mutate (#6–#7, #15–#17).  
4. **Role naming collision** — Manager vs Team Lead both called `isManager` (#11, #30).  
5. **Archive durability** — hard deletes + cascades vs permanent-history product goal (#4, #18, #24, #28).  
6. **Client honesty** — WBS hides releases; status labels rewrite QA truth (#10, #23, #37).

---

## Suggested fix order (guidance only — not implemented)

1. **Security foundation:** tighten RLS; authorize `move_bugs_to_release`; block TL→Admin escalation; server-enforce status transitions + Approve gate.  
2. **Gate / WBS integrity:** lock or re-evaluate Approved releases; reconcile on reopen/delete; optional confirm on Send Back with zero blockers.  
3. **Unify metrics:** one `passRate` helper, one `activeBugs` definition, one health model; fix Command Center to match.  
4. **Role rename:** `isLeadOrAdmin` / `canManageRelease` vs `isExecutiveManager` — never overload `isManager`.  
5. **Client portal:** show releases alongside WBS; token expiry; careful notes exposure.  
6. **Archive:** soft-delete / block cascade wipe of `bug_history`; stop gitignoring production migrations.

---

## Notes

- The former Send Back “reset all WBS tasks” bug appears **already fixed** in current `handleReleaseStatus` + `reconcileWbsItems` (per-task blocking rule). It is **not** listed above as an open defect; regression tests should still cover it.  
- Local `service-account.json` (gitignored) is a secrets hygiene risk if the machine is shared — rotate if exposure is possible.  
- This audit is static code review; runtime/staging confirmation is recommended for RLS and RPC findings against the deployed Supabase project.
