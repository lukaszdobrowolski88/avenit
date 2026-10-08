import React, { useEffect, useState } from 'react';
import { CalendarPlus, Copy, Download, CalendarDays, ExternalLink } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { supabase, getCachedUser } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';

// „Moje służby w kalendarzu”: osobisty kanał iCal (ical_subscriptions, ten sam co w Mój profil →
// Kalendarz) z preferencją my_services. Brak subskrypcji → zakładamy ją tylko ze służbami;
// istniejąca z wyłączonymi służbami → włączamy. Kalendarz (Apple/Google/Outlook) odświeża się sam.
const newToken = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

export default function MyServicesModal({ isOpen, onClose }) {
  const [state, setState] = useState({ loading: true, sub: null, error: false });

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    (async () => {
      setState({ loading: true, sub: null, error: false });
      try {
        const me = await getCachedUser();
        const email = me?.email;
        if (!email) throw new Error('no user');
        const { data, error } = await supabase.from('ical_subscriptions').select('*').eq('user_email', email).maybeSingle();
        if (error) throw error;
        let sub = data;
        if (!sub) {
          const { data: created, error: insErr } = await supabase.from('ical_subscriptions')
            .insert({ user_email: email, token: newToken(), export_preferences: { my_services: true, programs: false, events: false, tasks: false } })
            .select().single();
          if (insErr) throw insErr;
          sub = created;
        } else if (sub.export_preferences?.my_services === false) {
          const prefs = { ...(sub.export_preferences || {}), my_services: true };
          const { error: upErr } = await supabase.from('ical_subscriptions').update({ export_preferences: prefs }).eq('id', sub.id);
          if (upErr) throw upErr;
          sub = { ...sub, export_preferences: prefs };
        }
        if (alive) setState({ loading: false, sub, error: false });
      } catch {
        if (alive) setState({ loading: false, sub: null, error: true });
      }
    })();
    return () => { alive = false; };
  }, [isOpen]);

  const base = import.meta.env.VITE_API_URL || window.location.origin;
  const httpsUrl = state.sub ? `${base}/api/fn/ical/${state.sub.token}` : '';
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(httpsUrl); toast.success(tr('Link skopiowany do schowka!')); }
    catch { toast.error(tr('Nie udało się skopiować linku.')); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tr('Moje służby w kalendarzu')} icon={CalendarPlus} size="md"
      subtitle={tr('Twoje służby (wszystkich zespołów) pojawią się w kalendarzu w telefonie i same się zaktualizują.')}
      footer={<Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>}>
      <div className="p-6 space-y-4">
        {state.loading ? <Spinner center /> : state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{tr('Nie udało się przygotować kalendarza. Spróbuj ponownie albo użyj Mój profil → Kalendarz.')}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <a href={webcalUrl} className="sg-cal-link"><CalendarDays size={16} aria-hidden="true" />{tr('Apple / Outlook')}</a>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="sg-cal-link"><ExternalLink size={16} aria-hidden="true" />{tr('Kalendarz Google')}</a>
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={httpsUrl} aria-label={tr('Link do kalendarza')} onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 !px-3 !py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300" />
              <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>{tr('Kopiuj')}</Button>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
              <span>{tr('Nowe służby pojawią się automatycznie (kalendarz odświeża się co kilka godzin).')}</span>
              <a href={httpsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-gray-200 hover:underline">
                <Download size={13} aria-hidden="true" />{tr('Pobierz plik .ics')}
              </a>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Link jest prywatny — nie udostępniaj go. Nowy link (unieważnienie starego) wygenerujesz w Mój profil → Kalendarz.')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
