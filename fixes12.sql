-- fixes12.sql — developer bug-close proposals held for Team Lead verification.
--
-- When a *developer* marks a QA-reported bug as "Not a Bug", "Out of Scope" or
-- "Duplicate", the bug is NOT closed. It moves to the `pending_tl` status
-- (free-text on bugs.status — no enum/check constraint, so no type change is
-- needed) until a Team Lead approves or rejects the decision. We only need to
-- remember WHO proposed the close so the Team Lead's decision can notify them.
--
-- Idempotent — safe to re-run. Follows the existing fixes*.sql convention.

alter table bugs
  add column if not exists resolution_by_id uuid references profiles(id) on delete set null;

-- helps the (rare) "bugs I proposed to close" lookups; harmless if unused
create index if not exists bugs_resolution_by_idx on bugs (resolution_by_id);
