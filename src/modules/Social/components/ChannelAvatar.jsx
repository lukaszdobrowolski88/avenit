import React from 'react';
import { Facebook, Instagram } from 'lucide-react';
import { SOCIAL_PROVIDERS } from '@avenit/shared/src/lib/social.js';
import { TARGET_COLOR } from '../lib/socialUi';

const PROVIDER_ICON = { facebook: Facebook, instagram: Instagram };

export const providerLabel = (p) => SOCIAL_PROVIDERS[p]?.label || p;
// Nazwa kanału do wyświetlenia: Instagram — @konto, Facebook — nazwa strony.
export const channelName = (a) => (a?.provider === 'instagram' && a?.username ? `@${a.username}` : a?.name || '');
export const ProviderIcon = ({ provider, size = 12, className = '' }) => {
  const Icon = PROVIDER_ICON[provider];
  return Icon ? <Icon size={size} className={className} aria-hidden="true" /> : null;
};

// Awatar kanału z plakietką sieci (prawy dolny róg) i opcjonalną kropką statusu publikacji.
export default function ChannelAvatar({ account, provider, name, avatarUrl, size = 36, status, selected = false, dimmed = false, title }) {
  const prov = provider || account?.provider;
  const label = name || account?.name || '';
  const url = avatarUrl ?? account?.avatar_url;
  // Inicjały tylko z liter (bez „—”, „@” itp.).
  const initials = label.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const badge = Math.max(14, Math.round(size * 0.42));
  return (
    <span
      className={`relative inline-flex shrink-0 rounded-full ${selected ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''} ${dimmed ? 'opacity-40 grayscale' : ''}`}
      style={{ width: size, height: size }}
      title={title || `${label} · ${providerLabel(prov)}`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full rounded-full object-cover bg-gray-100 dark:bg-gray-800" referrerPolicy="no-referrer" />
      ) : (
        <span data-tone={1} className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center font-semibold" style={{ fontSize: Math.round(size * 0.36) }}>
          {initials}
        </span>
      )}
      <span
        className="absolute -right-1 -bottom-1 rounded-full bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 flex items-center justify-center shadow-sm"
        style={{ width: badge, height: badge }}
      >
        <ProviderIcon provider={prov} size={Math.round(badge * 0.62)} />
      </span>
      {status && (
        <span
          className="absolute -left-0.5 -top-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-gray-900"
          style={{ backgroundColor: TARGET_COLOR[status] || '#6b7280' }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
