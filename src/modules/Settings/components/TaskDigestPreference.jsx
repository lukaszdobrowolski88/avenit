import React, { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { Toggle } from './SettingsUI';
import { emailPattern } from '../../Komunikator/utils/chatLogic';
import { digestConfig, isDigestOptedOut, withDigestOptOut } from '@avenit/shared/src/lib/taskDigest.js';

// Poranny przegląd zadań (fn task-digest, 07:00) — osobista rezygnacja w profilu („Mój profil”).
// Zapis: 'task_digest' w push_user_preferences.category_opt_outs (tabela osobista, upsert po user_email);
// pozostałe kategorie zostają. Gdy organizacja wyłączyła skrót (app_settings 'task_digest'), przełącznik
// jest nieaktywny z wyjaśnieniem.
async function loadPrefs(userEmail) {
  const { data, error } = await supabase
    .from('push_user_preferences')
    .select('user_email, category_opt_outs')
    .ilike('user_email', emailPattern(userEmail))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default function TaskDigestPreference({ userEmail }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [on, setOn] = useState(true);
  const [orgEnabled, setOrgEnabled] = useState(true);

  useEffect(() => {
    if (!userEmail) return undefined;
    let alive = true;
    (async () => {
      const [prefs, org] = await Promise.all([
        loadPrefs(userEmail).catch(() => null),
        (async () => (await supabase.from('app_settings').select('value').eq('key', 'task_digest').maybeSingle()).data)().catch(() => null),
      ]);
      if (!alive) return;
      setOn(!isDigestOptedOut(prefs?.category_opt_outs));
      setOrgEnabled(digestConfig(org?.value).enabled);
      setLoading(false);
    })().catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userEmail]);

  const change = async (next) => {
    if (!userEmail || saving) return;
    setSaving(true);
    setOn(next);
    try {
      // Świeży odczyt tuż przed zapisem — nie gubimy rezygnacji z innych kategorii.
      const current = await loadPrefs(userEmail);
      const { error } = await supabase
        .from('push_user_preferences')
        .upsert({
          user_email: current?.user_email || userEmail,
          category_opt_outs: withDigestOptOut(current?.category_opt_outs, !next),
        }, { onConflict: 'user_email' })
        .select('user_email');
      if (error) throw error;
      toast.success(next ? tr('Poranny przegląd zadań włączony') : tr('Poranny przegląd zadań wyłączony'));
    } catch (err) {
      setOn(!next);
      toast.error(err, { fallback: tr('Nie udało się zapisać ustawienia. Spróbuj ponownie.') });
    } finally {
      setSaving(false);
    }
  };

  const label = tr('Poranny przegląd zadań (e-mail i push)');
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors duration-300">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
        <div className="p-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-xl text-accent-primary dark:text-accent-primary-light"><ListChecks size={24} aria-hidden="true" /></div>
        <div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{tr('Przegląd zadań')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Codziennie rano jedna wiadomość z zadaniami na dziś i zaległymi. Gdy nie masz zadań — nic nie przychodzi.')}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
        <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <Toggle label={label} checked={on && orgEnabled} disabled={loading || saving || !orgEnabled} onChange={change} />
      </div>
      {!loading && !orgEnabled && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{tr('Przegląd zadań jest wyłączony dla całej organizacji.')}</p>
      )}
    </div>
  );
}
