-- fixes14.sql — capture the developer's reasoning on a proposed bug close.
--
-- When a developer marks a bug as Not a Bug / Out of Scope / Duplicate it enters
-- `pending_tl` (see fixes12.sql). The Team Lead needs to see WHY before deciding,
-- so we store the optional free-text reason and the moment it was proposed.
-- (Who proposed it is already `resolution_by_id` from fixes12.sql.)
--
-- Idempotent — safe to re-run.

alter table bugs add column if not exists resolution_note text;
alter table bugs add column if not exists resolution_at timestamptz;
