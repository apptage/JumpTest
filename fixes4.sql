-- ============================================================
-- Run once in the Supabase SQL editor.
-- Adds release environment, and normalizes release.platform to the
-- two segregation contexts: 'Web' | 'Mobile'.
-- (Projects already store type as free text — now also 'both'.)
-- ============================================================

-- 1) Environment (Production / Staging), required.
alter table releases add column if not exists environment text not null default 'Production';

-- 2) Collapse legacy platform values (Android/iOS/Web/Both) into the
--    two contexts used for segregation.
update releases
set platform = case when release_type = 'web' then 'Web' else 'Mobile' end
where platform is null or platform not in ('Web', 'Mobile');
