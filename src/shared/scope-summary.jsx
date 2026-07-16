/* ScopeSummary — one honest sentence about what the numbers below represent.
   Used on the Bugs page and Analytics so users always know whether they're
   seeing the whole scope or a filtered subset (e.g. "Showing 1 of 48 open bugs
   · Filtered by: Get Right → Mobile → Staging → v1.0.3").

   Props:
     shown  — count after filters
     total  — count in the whole scope (unfiltered)
     noun   — what's being counted ("open bugs", "releases", …)
     crumbs — active filter labels, in order; empty = no filters applied */
export function ScopeSummary({ shown, total, noun = 'items', crumbs = [] }) {
  const filtered = crumbs.length > 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '8px 12px',
        marginBottom: 12,
        background: filtered ? 'var(--brand-soft)' : 'var(--color-background-secondary)',
        border: `1px solid ${filtered ? 'var(--brand-ring)' : 'var(--color-border-tertiary)'}`,
        borderRadius: 8,
        fontSize: 12.5,
      }}
    >
      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {filtered ? (
          <>
            Showing <span className="tnum">{shown}</span> of{' '}
            <span className="tnum">{total}</span> {noun}
          </>
        ) : (
          <>
            Showing all <span className="tnum">{total}</span> {noun}
          </>
        )}
      </span>
      {filtered && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: 'var(--color-text-secondary)' }}>
          <span style={{ fontWeight: 600 }}>Filtered by:</span>
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>→</span>}
              <span
                style={{
                  padding: '1px 8px',
                  borderRadius: 999,
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--brand-ring)',
                  color: 'var(--brand-strong)',
                  fontWeight: 600,
                }}
              >
                {c}
              </span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
