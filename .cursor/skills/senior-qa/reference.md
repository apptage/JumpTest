# Senior QA Reference — GammaQuality

## Severity examples

### Critical

- Login always fails for all users
- Payment / data corruption
- Crash on primary launch path
- Security: auth bypass, exposed secrets, IDOR on sensitive data
- OTP / password reset completely broken with no workaround

### Major

- Apple Login broken; Email Login still works (feature required this release)
- Resend OTP fails; user cannot recover session
- Core module flow broken for a primary platform in scope
- Wrong role permissions blocking intended users

### Minor

- Typo, alignment, unused label
- Rare edge case with clear workaround
- Non-blocking validation message wording
- Secondary empty-state polish

When unsure between major and minor: ask “Can a normal user finish the job with a reasonable workaround?” If yes → minor (file it). If no → major.

---

## Sample disposition (Auth module)

Release linked tasks: Signup, Login, Forgot Password, OTP Verification, Resend OTP, Reset Password, Logout, Apple Login, Google Login.

QA finds:

| Task | Finding | Severity |
|------|---------|----------|
| OTP Verification | Code not accepted | major |
| Resend OTP | Button no-ops | major |
| Apple Login | Token error | major |
| Signup / Login / Forgot / Logout / Google | OK | — |
| Settings icon 2px off | Cosmetic | minor (file, optional task link) |

**Disposition:** **Send Back** (open majors exist).

**Expected WBS after Send Back (per-task, blocking rule):**

| Task | Status |
|------|--------|
| Signup, Login, Forgot Password, Reset Password, Logout, Google Login | Completed |
| OTP Verification, Resend OTP, Apple Login | In Progress |

**Pass rate:** this release counts as **not passed** (sent back). WBS % still reflects tasks that cleared QA.

Next build: fix OTP / Resend / Apple → if only minors remain → **Approve**. Prior completed tasks stay completed unless new blocking bugs are filed against them.

---

## Approve with known issues (valid)

Open bugs on approved release:

- 0 critical, 0 major
- 5 minor (filed, linked, backlog)

**Correct:** Approve. Pass rate ↑. Bug backlog / carry metrics still show the 5 minors.

**Incorrect:** Send Back “until zero bugs,” or Approve while majors still open.

---

## Metrics cheat sheet

| Metric | Goes up when… | Must not mean… |
|--------|----------------|----------------|
| Pass rate | Builds clear blocking gate | Product is bug-free |
| Sent back / rej rate | Gate failed | QA was thorough |
| WBS % complete | Tasks have no open blocking bugs | Release was approved |
| Carry-forward rate | Same bugs move across builds | Pass rate |
| Open critical/major | Residual blocker debt | — |

Analytics should show pass rate **and** bug/carry signals together. Never one number for “quality.”

---

## FAQ

**Q: No project is bug-free — should we Send Back every build?**  
A: No. File everything; Send Back only for open critical/major.

**Q: Does Approve with minors fake the pass rate?**  
A: No. Pass rate = gate success. Minors belong in bug metrics.

**Q: Can WBS tasks complete while the release is Sent Back?**  
A: Yes. Tasks without open blocking bugs passed QA; the release as a whole did not.

**Q: What if a bug is not linked to a WBS task?**  
A: On WBS-linked releases, linking is required. Unlinked bugs hide which tasks failed and corrupt reconciliation.

**Q: Who verifies a developer “not a bug” dispute?**  
A: Team Lead / Admin (`pending_tl` workflow) — not silent self-close by the developer.

**Q: Does client portal “Completed” mean Approved?**  
A: Client release labels map approved → completed-style wording; WBS % is separate completion of tasks. Keep that distinction in any new UI.
