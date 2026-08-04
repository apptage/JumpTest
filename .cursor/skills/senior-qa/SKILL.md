---
name: senior-qa
description: >-
  Senior QA workflow for GammaQuality — release gates, severity triage, Approve vs
  Send Back, WBS task linking, and keeping pass rate / WBS / bugs independent. Use
  when designing or changing QA flows, bug filing, release approval, send-back,
  WBS reconciliation, pass rate, or when the user asks how senior QA should work.
---

# Senior QA (GammaQuality)

Act as a senior QA lead for this release-tracking product. Enforce risk-based acceptance, not zero-bug perfection.

## When this skill applies

- Release lifecycle / status transitions
- Bug severity, filing, verify, carry-forward
- WBS task status driven by QA outcomes
- Pass rate, approval rate, analytics copy
- Process questions: “should QA approve or send back?”

## Core model

| Concept | Measures | Source of truth |
|--------|----------|-----------------|
| Release status | Did this **build** pass the gate? | `releases.status` |
| WBS progress | Which **tasks** are done? | `wbs_items.status` |
| Pass rate | % of decided builds that cleared the gate | `approved` without open blocking bugs ÷ decided |
| Bug metrics | Residual quality / rework | bugs + `bug_history` |

These stay independent. Never make one imply the others.

## Release lifecycle (QA)

```
qa_pending → qa_in_progress → qa_done → approved | sent_back
```

`sent_back` is resolved by a **new follow-up release**, not an in-place status undo.

### Gate checklist before Approve / Send Back

1. All linked WBS tasks tested (or explicitly out of scope for this build).
2. Every defect filed with correct **severity** and **`wbsTaskId`** (required when release has linked tasks).
3. Checklist items complete (if project has checklist).
4. Decide using the gate — not gut feel:

| Open blocking bugs (critical/major, not verified)? | Action |
|----------------------------------------------------|--------|
| Yes | **Send Back** |
| No (minors only / none) | **Approve** |

App enforcement: Approve is blocked while open critical/major remain (`attemptStatus` in releases UI). `isOpenBlockingBug` / `BLOCKING_SEVERITIES` in `src/constants.js`.

## Severity guide (quick)

| Severity | Meaning | Blocks Approve? | Blocks WBS task complete? |
|----------|---------|-----------------|---------------------------|
| critical | Breaks core flow / data loss / security / crash | Yes | Yes |
| major | Important feature wrong; no acceptable workaround | Yes | Yes |
| minor | Polish, edge, cosmetic, rare workaround OK | No | No |

Full examples: [reference.md](reference.md).

## Bug filing standards

For every bug:

1. Clear title + repro steps
2. Correct severity (above)
3. Link **WBS task** when release has `release_tasks`
4. Screenshot when UI-related
5. Do not skip minors — file them; do not Send Back for minors alone

## WBS reconciliation (senior QA intent)

On submit: linked tasks → `in_qa`.

On **Approve** or **Send Back** (same per-task rule):

- Task has open **blocking** bugs → `in_progress`
- Task has no open blocking bugs → `completed`

Example: Auth release Sent Back for OTP/Apple bugs → Signup/Login/Logout with no blocking bugs still **Completed**.

Do not reset every linked task to In Progress on Send Back.

## Pass rate — what senior QA protects

- Pass rate = gate success, not “bug-free builds.”
- Approving with known minors **correctly** raises pass rate.
- Sending back every build **incorrectly** collapses pass rate and freezes WBS.
- Residual quality lives in open bugs, carry-forward rate, severity mix — report those alongside pass rate.

## Agent instructions

When changing QA-related code or advising process:

1. Preserve independence of release status, WBS, pass rate, bug metrics.
2. Prefer severity-gated Approve/Send Back; never “any bug ⇒ send back.”
3. Keep bug→WBS linking required on WBS releases.
4. Align WBS completion with **blocking** bugs, same as the release gate.
5. Update copy/tooltips so managers see “Approved = met gate,” not “zero defects.”

## Anti-patterns

- Send Back because bugs exist somewhere
- Inflating severity to force Send Back (or deflating to force Approve)
- Bugs without `wbsTaskId` on WBS-linked releases
- Treating WBS % as pass rate (or the reverse)
- Hard-deleting historical bugs/releases used for audit

## Reference

- Severity examples, sample dispositions, FAQ → [reference.md](reference.md)
