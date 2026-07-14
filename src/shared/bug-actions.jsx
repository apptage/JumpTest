/* Role-aware bug action bar — the single source of truth for bug transitions.
   Used by the release Bugs tab (BugRow) AND the standalone Bugs page so both
   behave identically. The caller passes already-computed role flags (each may
   fold in read-only/scope rules) and handlers already bound to the bug's
   release, e.g. onStatus={(st) => onBugStatus(release, bug, st)}. */
import { ghostButton, inputStyle } from '@/ui.jsx';
import { BUG_STATUSES, BUG_RESOLUTIONS, DEV_DISPUTE_RESOLUTIONS, humanizeSince } from '@/constants.js';

/* Shown to the Team Lead on a `pending_tl` bug: the resolution the developer
   proposed, their optional reason, and who marked it + when — everything needed
   to approve or reject informedly. Used on the release Bugs tab AND the Bugs
   page so the two stay identical. */
export function ProposedCloseBanner({ bug, proposerName }) {
  if (bug.status !== 'pending_tl') return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: '#ECFEFF',
        border: '1px solid #A5F3FC',
        borderRadius: 8,
        fontSize: 12.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#0e7490' }}>Proposed close</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 9px',
            borderRadius: 999,
            background: '#fff',
            border: '1px solid #A5F3FC',
            color: '#0e7490',
          }}
        >
          {bug.resolution || '—'}
        </span>
      </div>
      {bug.resolutionNote && (
        <div style={{ marginTop: 6, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
          “{bug.resolutionNote}”
        </div>
      )}
      <div style={{ marginTop: 6, color: 'var(--color-text-tertiary)', fontSize: 11.5 }}>
        by {proposerName || 'a developer'}
        {bug.resolutionAt ? ` · ${humanizeSince(bug.resolutionAt)}` : ''}
      </div>
    </div>
  );
}

export function BugActions({
  bug,
  isDev,
  isQA,
  isManager,
  canDelete,
  isSubmitting,
  onStatus,
  onResolve,
  onCloseReview,
  onDelete,
}) {
  const pendingTl = bug.status === 'pending_tl';
  // a plain developer proposes a close (Not a Bug / Out of Scope / Duplicate);
  // it parks in pending_tl for the Team Lead instead of closing immediately
  const devCanPropose =
    isDev && !isQA && ['open', 'in_progress', 'disputed'].includes(bug.status);

  // contextual transitions (suppressed while a close is awaiting TL review)
  const actions = [];
  if (!pendingTl) {
    if (isDev) {
      if (bug.status === 'open') actions.push(['in_progress', 'Start']);
      if (['in_progress', 'open', 'disputed'].includes(bug.status))
        actions.push(['fixed', 'Mark fixed']);
    }
    if (isQA) {
      if (bug.status === 'fixed') actions.push(['verified', 'Verify']);
      if (bug.status !== 'open') actions.push(['open', 'Reopen']);
    }
    // either side can flag for clarification
    if (bug.status !== 'verified' && bug.status !== 'disputed')
      actions.push(['disputed', 'Needs clarification']);
  }

  const showBar =
    actions.length > 0 ||
    canDelete ||
    devCanPropose ||
    (isManager && pendingTl) ||
    (isQA && bug.status !== 'verified' && !pendingTl);
  if (!showBar) return null;

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {actions.map(([st, label]) => (
        <button
          key={st}
          disabled={isSubmitting}
          onClick={() => onStatus(st)}
          style={{
            ...ghostButton,
            padding: '6px 10px',
            fontSize: 12,
            color: BUG_STATUSES[st].color,
            borderColor: `${BUG_STATUSES[st].color}55`,
          }}
        >
          {label}
        </button>
      ))}
      {/* Team Lead verifies a developer's proposed close */}
      {isManager && pendingTl && (
        <>
          <button
            disabled={isSubmitting}
            onClick={() => onCloseReview('approve')}
            style={{ ...ghostButton, padding: '6px 10px', fontSize: 12, color: '#16a34a', borderColor: '#16a34a55' }}
            title={`Approve closing as ${bug.resolution}`}
          >
            Approve close
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => onCloseReview('reject')}
            style={{ ...ghostButton, padding: '6px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc262655' }}
            title="Reject — send back to developer as a real bug"
          >
            Reject
          </button>
        </>
      )}
      {/* developer proposes a close → held for Team Lead verification */}
      {devCanPropose && (
        <select
          value=""
          disabled={isSubmitting}
          onChange={(e) => e.target.value && onResolve(e.target.value)}
          style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }}
          title="Propose a close (needs Team Lead verification)"
        >
          <option value="">Close as…</option>
          {DEV_DISPUTE_RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      {isQA && bug.status !== 'verified' && !pendingTl && (
        <select
          value=""
          disabled={isSubmitting}
          onChange={(e) => e.target.value && onResolve(e.target.value)}
          style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }}
          title="Close without a code fix"
        >
          <option value="">Close as…</option>
          {BUG_RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      {canDelete && (
        <button
          disabled={isSubmitting}
          onClick={onDelete}
          style={{
            ...ghostButton,
            padding: '6px 10px',
            fontSize: 12,
            color: '#dc2626',
            borderColor: '#dc262644',
            marginLeft: 'auto',
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
