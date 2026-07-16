import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SettingsCard, UsageBar } from './SettingsUI';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

// Sekcja Subskrypcja — read-only. Plan i limity pobiera z /api/tenant/info
// (baza platform), zużycie liczy z bazy tenanta przez Data API.
const STATUS_LABEL = {
  trial: { text: tr('Okres próbny'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  trialing: { text: tr('Okres próbny'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  active: { text: 'Aktywna', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  past_due: { text: tr('Zaległa płatność'), cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  suspended: { text: 'Zawieszona', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function SubscriptionInfo() {
  const t = useT();
  const [info, setInfo] = useState(null);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await supabase._request('/api/tenant/info');
        if (!res.ok) throw new Error(tr('Nie udało się pobrać danych subskrypcji'));
        setInfo(await res.json());
        // Zużycie z bazy tenanta.
        const counts = await Promise.all([
          supabase.from('members').select('*', { count: 'exact', head: true }),
          supabase.from('app_users').select('*', { count: 'exact', head: true }),
          supabase.from('groups').select('*', { count: 'exact', head: true }),
          supabase.from('kids_students').select('*', { count: 'exact', head: true }),
        ]);
        setUsage({
          members: counts[0].count || 0,
          users: counts[1].count || 0,
          groups: counts[2].count || 0,
          kids: counts[3].count || 0,
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-gray-500 dark:text-gray-400">{t('Ładowanie…')}</div>;
  if (error) return <div className="text-red-500 text-sm">{error}</div>;

  const sub = info?.subscription;
  const tenant = info?.tenant;
  const status = STATUS_LABEL[sub?.status || tenant?.status] || STATUS_LABEL.active;
  const limits = sub?.limits || {};
  const price = sub ? (sub.priceMonthly / 100).toFixed(0) : null;

  const enabledFeatures = Object.entries(sub?.features || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const featureLabels = {
    calendar: 'Kalendarz', members: 'Członkowie', groups: 'Grupy', kids_checkin: 'Check-in dzieci',
    events: 'Wydarzenia', email: 'E-maile', finance: 'Finanse', forms: 'Formularze',
    advanced_reports: 'Raporty zaawansowane', api: 'API', white_label: 'White-label',
    priority_support: 'Wsparcie priorytetowe', custom_domain: 'Własna domena',
  };

  return (
    <div className="max-w-3xl">
      <SettingsCard icon={CreditCard} title={t('Twój plan')} description={tr('Zarządzaniem planem zajmuje się administrator platformy.')}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-800 dark:text-white">{sub?.planName || '—'}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>{status.text}</span>
            </div>
            {price && <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{price} zł / miesiąc</div>}
          </div>
          {sub?.currentPeriodEnd && (
            <div className="text-right text-sm">
              <div className="text-gray-400">Okres do</div>
              <div className="font-medium text-gray-700 dark:text-gray-200">{new Date(sub.currentPeriodEnd).toLocaleDateString('pl-PL')}</div>
            </div>
          )}
          {(tenant?.status === 'trial') && tenant?.trialEndsAt && (
            <div className="text-right text-sm">
              <div className="text-gray-400">Trial do</div>
              <div className="font-medium text-amber-600 dark:text-amber-400">{new Date(tenant.trialEndsAt).toLocaleDateString('pl-PL')}</div>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard icon={Sparkles} title="Wykorzystanie" description={tr('Zużycie limitów Twojego planu.')}>
        <UsageBar label={tr('Członkowie')} used={usage.members} max={limits.members} />
        <UsageBar label={tr('Użytkownicy')} used={usage.users} max={limits.users} />
        <UsageBar label="Grupy" used={usage.groups} max={limits.groups} />
        <UsageBar label="Dzieci" used={usage.kids} max={limits.kids} />
      </SettingsCard>

      {enabledFeatures.length > 0 && (
        <SettingsCard icon={CheckCircle2} title="Funkcje w planie">
          <div className="flex flex-wrap gap-2">
            {enabledFeatures.map((f) => (
              <span key={f} className="text-sm px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> {featureLabels[f] || f}
              </span>
            ))}
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
