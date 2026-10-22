import React from 'react';

// Proste znaki dostawców (bez logotypów w wysokiej wierności): trójkąt Dysku, chmurka OneDrive,
// „S” SharePoint. provider: 'google_drive' | 'onedrive' | 'sharepoint' | 'google' | 'microsoft'.
export default function CloudProviderIcon({ provider, size = 20, className = '', title }) {
  const p = provider === 'google' ? 'google_drive' : provider === 'microsoft' ? 'onedrive' : provider;
  const common = { width: size, height: size, viewBox: '0 0 24 24', className, role: title ? 'img' : undefined, 'aria-hidden': title ? undefined : true, 'aria-label': title || undefined, focusable: 'false' };
  if (p === 'google_drive') {
    return (
      <svg {...common}>
        <path d="M8.2 3h7.6l6 10.4h-7.6z" fill="#FBBC04" />
        <path d="M8.2 3 2.2 13.4 6 20l6-10.4z" fill="#1A73E8" />
        <path d="M6 20h12l3.8-6.6h-12z" fill="#34A853" />
      </svg>
    );
  }
  if (p === 'sharepoint') {
    return (
      <svg {...common}>
        <circle cx="10" cy="8" r="6" fill="#036C70" />
        <circle cx="16" cy="13" r="5" fill="#1A9BA1" />
        <circle cx="11" cy="17.5" r="4" fill="#37C6D0" />
        <rect x="2" y="7" width="10" height="10" rx="1.6" fill="#03787C" />
        <path d="M5.3 14.2c.5.4 1.2.6 1.9.6.9 0 1.4-.4 1.4-.9 0-1.3-3.2-.8-3.2-2.8 0-1 .9-1.7 2.1-1.7.7 0 1.3.2 1.7.4" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  // OneDrive (i domyślnie Microsoft)
  return (
    <svg {...common}>
      <path d="M9.6 9.2a5 5 0 0 1 9 1.7A3.6 3.6 0 0 1 18.4 18H7.5A4.2 4.2 0 0 1 6.6 9.7a5 5 0 0 1 3-.5z" fill="#0364B8" />
      <path d="M9.6 9.2 14 12l4.6-1.1a5 5 0 0 0-9-1.7z" fill="#0078D4" />
      <path d="M14 12l-6.3 6H18.4a3.6 3.6 0 0 0 .2-7.1z" fill="#1490DF" />
      <path d="M6.6 9.7A4.2 4.2 0 0 0 7.5 18H7.7L14 12 9.6 9.2a5 5 0 0 0-3 .5z" fill="#28A8EA" />
    </svg>
  );
}
