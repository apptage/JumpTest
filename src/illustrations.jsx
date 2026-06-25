/* Custom inline SVG vectors — dev / programming / QA themed.
   Black & orange. No external assets. */

const O = '#ff7a1a'; // orange
const O2 = '#ff5400'; // deep orange

/* ---------- small line icons (use currentColor) ---------- */

export function IconCode({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBug({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="8" height="10" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v3M5 9l3 1M19 9l-3 1M4 14h3M17 14h3M5 19l3-2M19 19l-3-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconShieldCheck({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTerminal({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRocket({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M14 4c3 1 6 4 6 4s-1 4-5 8c-2 2-5 3-5 3l-4-4s1-3 3-5c4-4 8-6 5-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.5" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ---------- hero illustration: a QA / release pipeline scene ---------- */

export function HeroIllustration({ width = '100%' }) {
  return (
    <svg
      viewBox="0 0 360 240"
      width={width}
      role="img"
      aria-label="Code review and QA illustration"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* connecting pipeline line */}
      <path
        d="M60 196 C 110 196, 110 120, 180 120 S 250 44, 300 44"
        stroke={O}
        strokeWidth="2.5"
        strokeDasharray="2 9"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />

      {/* main code editor window */}
      <g className="floaty">
        <rect x="40" y="78" width="190" height="120" rx="12" fill="#15171d" stroke="rgba(255,255,255,0.12)" />
        <circle cx="58" cy="96" r="3.4" fill="#ff5f57" />
        <circle cx="70" cy="96" r="3.4" fill="#febc2e" />
        <circle cx="82" cy="96" r="3.4" fill="#28c840" />
        {/* code lines */}
        <rect x="56" y="114" width="20" height="6" rx="3" fill={O} />
        <rect x="80" y="114" width="46" height="6" rx="3" fill="rgba(255,255,255,0.32)" />
        <rect x="68" y="128" width="64" height="6" rx="3" fill="rgba(255,255,255,0.2)" />
        <rect x="68" y="142" width="40" height="6" rx="3" fill={O2} />
        <rect x="112" y="142" width="34" height="6" rx="3" fill="rgba(255,255,255,0.2)" />
        <rect x="56" y="156" width="30" height="6" rx="3" fill="rgba(255,255,255,0.32)" />
        <rect x="90" y="156" width="78" height="6" rx="3" fill="rgba(255,255,255,0.16)" />
        <rect x="68" y="170" width="50" height="6" rx="3" fill="rgba(255,255,255,0.2)" />
      </g>

      {/* QA passed badge (top right) */}
      <g className="floaty" style={{ animationDelay: '0.8s' }}>
        <circle cx="300" cy="44" r="26" fill={O} />
        <path d="M289 44l7 7 14-14" stroke="#0c0d11" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* bug chip (bottom left, being squashed) */}
      <g className="floaty" style={{ animationDelay: '1.6s' }}>
        <rect x="34" y="196" width="58" height="30" rx="15" fill="#15171d" stroke="rgba(255,255,255,0.12)" />
        <g transform="translate(46,203) scale(0.75)" color={O}>
          <rect x="8" y="8" width="8" height="10" rx="4" stroke="currentColor" strokeWidth="2.4" fill="none" />
          <path d="M12 4v3M5 9l3 1M19 9l-3 1M4 14h3M17 14h3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <rect x="70" y="207" width="14" height="6" rx="3" fill="rgba(255,255,255,0.3)" />
      </g>

      {/* floating terminal chip (right) */}
      <g className="floaty" style={{ animationDelay: '1.1s' }}>
        <rect x="252" y="150" width="74" height="48" rx="10" fill="#15171d" stroke="rgba(255,255,255,0.12)" />
        <path d="M266 166l8 8-8 8" stroke={O} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="286" y="180" width="26" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
      </g>
    </svg>
  );
}

/* ---------- empty state illustration ---------- */

export function EmptyIllustration({ size = 120 }) {
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 140 116" fill="none" aria-hidden="true">
      <rect x="22" y="26" width="96" height="66" rx="10" fill="var(--color-background-secondary)" stroke="var(--color-border-tertiary)" />
      <circle cx="35" cy="39" r="2.6" fill="#ff5f57" />
      <circle cx="44" cy="39" r="2.6" fill="#febc2e" />
      <circle cx="53" cy="39" r="2.6" fill="#28c840" />
      <path d="M44 58l7 7-7 7" stroke={O} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="58" y="62" width="34" height="6" rx="3" fill="var(--color-border-tertiary)" />
      <circle cx="104" cy="30" r="15" fill={O} />
      <path d="M97 30l5 5 9-9" stroke="#0c0d11" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
