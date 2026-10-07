import React, { useEffect, useState } from 'react';
import { Moon, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Button from '../../../components/Button';
import TimeInput from '../../../components/TimeInput';
import { Toggle } from '../../Settings/components/SettingsUI';
import { emailPattern } from '../utils/chatLogic';

// Ciche godziny czatu (K4) — w profilu („Mój profil”). Zapis do push_user_preferences
// (tabela osobista, upsert po user_email). W tych godzinach serwer nie wysyła powiadomień
// o nowych wiadomościach (poza wzmiankami o mnie). Strefa czasowa — z przeglądarki.
const hm = (v) => (v ? String(v).slice(0, 5) : '');
const DEFAULT_FROM = '22:00';
const DEFAULT_TO = '07:00';

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'; } catch { return 'Europe/Warsaw'; }
}

export default function ChatQuietHours({ userEmail }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [saved, setSaved] = useState({ enabled: false, from: DEFAULT_FROM, to: DEFAULT_TO });

  useEffect(() => {
    if (!userEmail) return undefined;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('push_user_preferences')
        .select('user_email, quiet_hours_start, quiet_hours_end, timezone')
        .ilike('user_email', emailPattern(userEmail))
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const on = !!(data?.quiet_hours_start && data?.quiet_hours_end);
      const next = { enabled: on, from: hm(data?.quiet_hours_start) || DEFAULT_FROM, to: hm(data?.quiet_hours_end) || DEFAULT_TO };
      setEnabled(next.enabled); setFrom(next.from); setTo(next.to); setSaved(next);
      setLoading(false);
    })().catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userEmail]);

  const valid = !enabled || (/^\d{2}:\d{2}$/.test(from) && /^\d{2}:\d{2}$/.test(to) && from !== to);
  const dirty = enabled !== saved.enabled || (enabled && (from !== saved.from || to !== saved.to));

  const save = async () => {
    if (!valid || !userEmail) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('push_user_preferences')
        .upsert({
          user_email: userEmail,
          quiet_hours_start: enabled ? from : null,
          quiet_hours_end: enabled ? to : null,
          timezone: browserTimeZone(),
        }, { onConflict: 'user_email' })
        .select('user_email');
      if (error) throw error;
      setSaved({ enabled, from, to });
      toast.success(enabled ? tr('Ciche godziny zapisane') : tr('Ciche godziny wyłączone'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać cichych godzin. Spróbuj ponownie.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors duration-300">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
        <div className="p-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-xl text-accent-primary dark:text-accent-primary-light"><Moon size={24} aria-hidden="true" /></div>
        <div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{tr('Ciche godziny czatu')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{tr('W tych godzinach nie dostaniesz powiadomień o nowych wiadomościach. Wzmianki o Tobie (@) przyjdą zawsze.')}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
        <span className="font-medium text-gray-800 dark:text-gray-200">{tr('Włącz ciche godziny')}</span>
        <Toggle label={tr('Włącz ciche godziny')} checked={enabled} disabled={loading} onChange={setEnabled} />
      </div>
      {enabled && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <span id="chat-quiet-from" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Od')}</span>
            <TimeInput value={from} onChange={setFrom} aria-labelledby="chat-quiet-from" />
          </div>
          <div>
            <span id="chat-quiet-to" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Do')}</span>
            <TimeInput value={to} onChange={setTo} aria-labelledby="chat-quiet-to" />
          </div>
        </div>
      )}
      {enabled && !valid && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{tr('Podaj dwie różne godziny.')}</p>
      )}
      <div className="mt-4 flex justify-end">
        <Button icon={Save} onClick={save} loading={saving} disabled={loading || !valid || !dirty}>{tr('Zapisz')}</Button>
      </div>
    </div>
  );
}
