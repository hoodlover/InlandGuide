import React from 'react';

// Small, brand-colored glyphs for the copy buttons. Simplified (not the exact
// vendor logos) but instantly recognizable next to their labels.

export function SalesforceIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <path fill="#00A1E0" d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}

export function OutlookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#0F6CBD" />
      <ellipse cx="12" cy="12" rx="4.2" ry="5.2" fill="none" stroke="#ffffff" strokeWidth="2.3" />
    </svg>
  );
}

export function TeamsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <circle cx="17.6" cy="6.2" r="3" fill="#7B83EB" />
      <rect x="3" y="6" width="13" height="13" rx="3" fill="#5059C9" />
      <rect x="8.4" y="9" width="2.2" height="7" fill="#ffffff" />
      <rect x="6" y="9" width="7" height="2.2" fill="#ffffff" />
    </svg>
  );
}

export function TextIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#94a3b8" />
      <rect x="7" y="7" width="10" height="1.8" rx="0.9" fill="#ffffff" />
      <rect x="7" y="11" width="10" height="1.8" rx="0.9" fill="#ffffff" />
      <rect x="7" y="15" width="6" height="1.8" rx="0.9" fill="#ffffff" />
    </svg>
  );
}
