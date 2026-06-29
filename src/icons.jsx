/* Uniform outline icon set (Lucide-style, 1.6px stroke, currentColor).
   No external dependency. Use everywhere instead of emoji. */

function I({ size = 16, stroke = 1.6, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p) => (
  <I {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </I>
);
export const IconClock = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </I>
);
export const IconCheck = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.4 2.4 4.6-5" />
  </I>
);
export const IconBug = (p) => (
  <I {...p}>
    <rect x="8" y="6" width="8" height="12" rx="4" />
    <path d="M12 6V3M9.5 4l1 2M14.5 4l-1 2M8 10H4M8 14H3.5M8 17l-3 2M16 10h4M16 14h4.5M16 17l3 2" />
  </I>
);
export const IconPackage = (p) => (
  <I {...p}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </I>
);
export const IconSend = (p) => (
  <I {...p}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </I>
);
export const IconGlobe = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
  </I>
);
export const IconFolder = (p) => (
  <I {...p}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
  </I>
);
export const IconBell = (p) => (
  <I {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </I>
);
export const IconSliders = (p) => (
  <I {...p}>
    <path d="M4 6h9M19 6h1M4 12h1M11 12h9M4 18h6M16 18h4" />
    <circle cx="16" cy="6" r="2.2" />
    <circle cx="8" cy="12" r="2.2" />
    <circle cx="13" cy="18" r="2.2" />
  </I>
);
export const IconChart = (p) => (
  <I {...p}>
    <path d="M3 3v18h18" />
    <rect x="7" y="11" width="2.6" height="6" rx="0.8" />
    <rect x="12" y="7" width="2.6" height="10" rx="0.8" />
    <rect x="17" y="13" width="2.6" height="4" rx="0.8" />
  </I>
);
export const IconPlus = (p) => (
  <I {...p}>
    <path d="M12 5v14M5 12h14" />
  </I>
);
export const IconPower = (p) => (
  <I {...p}>
    <path d="M12 3v9" />
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
  </I>
);
export const IconUpload = (p) => (
  <I {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 8l5-5 5 5" />
    <path d="M12 3v12" />
  </I>
);
export const IconSmartphone = (p) => (
  <I {...p}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </I>
);
export const IconUsers = (p) => (
  <I {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
  </I>
);
export const IconDownload = (p) => (
  <I {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </I>
);
export const IconGrid = (p) => (
  <I {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </I>
);
export const IconLayers = (p) => (
  <I {...p}>
    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
    <path d="M2 12l10 5 10-5M2 17l10 5 10-5" />
  </I>
);
export const IconCog = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </I>
);
export const IconExternal = (p) => (
  <I {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </I>
);
