import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { tr, trPlural, appLocale } from '../../i18n';
import { buildUserNameMap, userLabel } from '@avenit/shared/src/lib/campaignName.js';

// „Kto i kiedy” dla kampanii push / SMS (lista + statystyki). created_by to e-mail —
// imiona bierzemy jednym zapytaniem do app_users (mapa bez względu na wielkość liter),
// współdzielonym między komponentami w obrębie sesji strony.

let namesPromise = null;

function loadUserNames() {
  if (!namesPromise) {
    namesPromise = supabase
      .from('app_users')
      .select('email, full_name, name')
      .then(({ data, error }) => {
        if (error) throw error;
        return buildUserNameMap(data);
      })
      .catch(() => {
        namesPromise = null; // spróbuj ponownie przy następnym montażu
        return {};
      });
  }
  return namesPromise;
}

// Mapa e-mail (małe litery) → imię i nazwisko. Pusta, dopóki się nie wczyta.
export function useUserNames() {
  const [names, setNames] = useState({});
  useEffect(() => {
    let alive = true;
    loadUserNames().then((m) => { if (alive) setNames(m); });
    return () => { alive = false; };
  }, []);
  return names;
}

// Data i godzina w strefie Europe/Warsaw, w bieżącym języku.
export function formatCampaignDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(appLocale(), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  });
}

export function creatorName(campaign, names) {
  return campaign?.creator?.full_name || userLabel(campaign?.created_by, names) || '—';
}

const recipientsPhrase = (n) => trPlural(n, 'do {n} osoby', 'do {n} osób', 'do {n} osób');

const sentAt = (c) => c?.completed_at || c?.started_at || null;

// Wyciszone linie pod treścią karty kampanii.
export function CampaignMetaLines({ campaign: c, names }) {
  const total = c?.recipient_count || 0;
  const wasSent = (c?.status === 'sent' || c?.status === 'sending') && sentAt(c);
  return (
    <div className="space-y-0.5 text-xs text-gray-500 dark:text-gray-400 mb-3">
      <p>
        {tr('Utworzył(a)')}: {creatorName(c, names)} · {formatCampaignDateTime(c?.created_at)}
      </p>
      {wasSent && (
        <p>
          {tr('Wysłano')}: {formatCampaignDateTime(sentAt(c))}{total > 0 ? ` · ${recipientsPhrase(total)}` : ''}
        </p>
      )}
      {c?.status === 'scheduled' && c?.scheduled_at && (
        <p>{tr('Zaplanowano')}: {formatCampaignDateTime(c.scheduled_at)}</p>
      )}
    </div>
  );
}

// Blok szczegółów w nagłówku statystyk.
export function CampaignMetaDetails({ campaign: c, names, recipientCount }) {
  const rows = [
    [tr('Utworzył(a)'), creatorName(c, names)],
    [tr('Utworzono'), formatCampaignDateTime(c?.created_at)],
    c?.scheduled_at && c?.status === 'scheduled' ? [tr('Zaplanowano'), formatCampaignDateTime(c.scheduled_at)] : null,
    c?.started_at ? [tr('Wysłano'), formatCampaignDateTime(c.started_at)] : null,
    c?.completed_at ? [tr('Zakończono'), formatCampaignDateTime(c.completed_at)] : null,
    [tr('Odbiorcy'), String(recipientCount ?? c?.recipient_count ?? 0)],
  ].filter(Boolean);
  return (
    <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2 mb-6 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
          <dd className="text-gray-900 dark:text-white truncate">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
