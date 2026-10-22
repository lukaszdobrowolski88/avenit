import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Link2, Unlink, RefreshCw, Check, AlertCircle, Info, Pause, Play } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { Toggle } from './SettingsUI';
import { CAL_PROVIDERS, calProviderLabel, calendarSyncState, calCallbackMessage, USER_PREF_OPTIONS, syncSummary } from './calendarSyncLogic';

// Mój profil → Kalendarz Google / Outlook (Faza 2): osoba łączy WŁASNE konto, Avenit tworzy w nim
// osobny kalendarz „Avenit — <kościół>” i synchronizuje go w obie strony. Wszystko przez fn
// calendar-sync — tokeny nie trafiają do przeglądarki. Szczegóły: docs/integrations-workspace.md.

const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke('calendar-sync', { body, silent: true });
  if (error) throw new Error(error.message);
  return data;
};

function Pill({ state }) {
  const cls = state.tone === 'ok'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : state.tone === 'error'
      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      : state.tone === 'warn'
        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {state.tone === 'ok' ? <Check size={12} aria-hidden="true" /> : state.tone === 'error' ? <AlertCircle size={12} aria-hidden="true" /> : null}
      {state.label}
    </span>
  );
}

function ProviderRow({ provider, st, reload }) {
  const [busy, setBusy] = useState(null);
  const conn = st.connection;
  const t = st.target;
  const prefs = t?.prefs || {};
  const name = calProviderLabel(provider);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };
  const connect = () => run('connect', async () => {
    const data = await invoke({ action: 'connect', provider });
    window.location.assign(data.url);
  });
  const disconnect = async () => {
    if (!(await confirmDialog(tr('Rozłączyć {name}? Kalendarz „Avenit” zostanie usunięty z Twojego konta; wydarzenia w Avenit zostają bez zmian.', { name })))) return;
    run('disconnect', async () => { await invoke({ action: 'disconnect', provider }); toast.success(tr('Rozłączono.')); await reload(); });
  };
  const syncNow = () => run('sync', async () => {
    const r = await invoke({ action: 'sync_now', provider });
    if (r.result?.error) toast.error(r.result.error);
    else if (r.result?.skipped === 'busy') toast.success(tr('Synchronizacja już trwa — odśwież za chwilę.'));
    else toast.success(tr('Zsynchronizowano: {created} nowych, {updated} zmienionych, {deleted} usuniętych.', { created: r.result?.created || 0, updated: r.result?.updated || 0, deleted: r.result?.deleted || 0 }));
    await reload();
  });
  const savePrefs = (patch) => run('prefs', async () => { await invoke({ action: 'save_prefs', provider, prefs: patch }); await reload(); });
  const setEnabled = (enabled) => run('enabled', async () => { await invoke({ action: 'set_enabled', provider, enabled }); await reload(); });

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 dark:text-white">{name}</div>
          <div className="mt-1"><Pill state={calendarSyncState(st)} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {conn && t && <Button variant="outline" size="sm" icon={RefreshCw} onClick={syncNow} loading={busy === 'sync'}>{tr('Synchronizuj teraz')}</Button>}
          {conn && t && (t.enabled
            ? <Button variant="outline" size="sm" icon={Pause} onClick={() => setEnabled(false)} loading={busy === 'enabled'}>{tr('Wstrzymaj')}</Button>
            : <Button variant="outline" size="sm" icon={Play} onClick={() => setEnabled(true)} loading={busy === 'enabled'}>{tr('Wznów')}</Button>)}
          {conn && <Button variant="outline" size="sm" icon={Unlink} onClick={disconnect} loading={busy === 'disconnect'}>{tr('Rozłącz')}</Button>}
          {(!conn || conn.status === 'revoked' || t?.status === 'error') && (
            <Button size="sm" icon={Link2} onClick={connect} loading={busy === 'connect'} disabled={!st.available}>{conn ? tr('Połącz ponownie') : tr('Połącz')}</Button>
          )}
        </div>
      </div>

      {!st.available && !conn && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Niedostępne — administrator kościoła nie skonfigurował jeszcze integracji z {name}.', { name: provider === 'google' ? 'Google' : 'Microsoft 365' })}</p>
      )}
      {(t?.last_error || (conn?.last_error && conn.status !== 'active')) && (
        <p className="text-sm text-red-700 dark:text-red-300 break-words">{t?.last_error || conn.last_error}</p>
      )}

      {conn && t && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t.calendar_name ? tr('Kalendarz „{name}”', { name: t.calendar_name }) : tr('Kalendarz zostanie utworzony przy pierwszej synchronizacji')} · {syncSummary(t)}
          </p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">{tr('Co synchronizować')}</legend>
            {[
              ['mine', tr('Tylko moje wydarzenia'), tr('Służby, zapisy, moje grupy, spotkania i wydarzenia, które organizuję')],
              ['all', tr('Wszystkie wydarzenia, które widzę'), tr('Jak lista Wydarzeń w Avenit — może być ich dużo')],
            ].map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name={`cal-${provider}-mode`} checked={(prefs.mode || 'mine') === value} disabled={busy === 'prefs'}
                  onChange={() => savePrefs({ mode: value })} className="mt-1 accent-accent-primary" />
                <span><span className="text-gray-800 dark:text-gray-100">{label}</span><span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span></span>
              </label>
            ))}
          </fieldset>
          {(prefs.mode || 'mine') === 'mine' && (
            <div className="space-y-3">
              {USER_PREF_OPTIONS().map((o) => (
                <div key={o.key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 dark:text-gray-100">{o.label}</div>
                    {o.hint && <div className="text-xs text-gray-500 dark:text-gray-400">{o.hint}</div>}
                  </div>
                  <Toggle label={o.label} checked={prefs[o.key] !== false} disabled={busy === 'prefs'} onChange={(v) => savePrefs({ [o.key]: v })} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CalendarSyncCard() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    try { setStatus((await invoke({ action: 'status' })).providers); setError(null); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Powrót z ekranu zgody: ?cal=google&cal_result=connected|error&cal_reason=…
  useEffect(() => {
    const cal = searchParams.get('cal');
    const result = searchParams.get('cal_result');
    if (!cal || !result) return;
    const m = calCallbackMessage(cal, result, searchParams.get('cal_reason'));
    if (m.ok) toast.success(m.text); else toast.error(m.text);
    const next = new URLSearchParams(searchParams);
    ['cal', 'cal_result', 'cal_reason'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const anyAvailable = status && CAL_PROVIDERS.some((p) => status[p]?.available || status[p]?.connection);

  return (
    <div id="kalendarz" className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors duration-300">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
        <div className="p-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-xl text-accent-primary dark:text-accent-primary-light">
          <CalendarClock size={24} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{tr('Kalendarz Google / Outlook')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Synchronizacja w obie strony z osobnym kalendarzem „Avenit” na Twoim koncie')}</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!status && !error && <div className="py-4 flex justify-center"><Spinner /></div>}
      {status && (
        <div className="space-y-4">
          {CAL_PROVIDERS.map((p) => status[p] && <ProviderRow key={p} provider={p} st={status[p]} reload={load} />)}
          {anyAvailable && (
            <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
              <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p>{tr('Zmiany terminu, nazwy, miejsca i opisu zrobione w kalendarzu Google/Outlook trafią do Avenit, jeśli możesz edytować to wydarzenie. Inaczej przywrócimy wersję z Avenit.')}</p>
                <p>{tr('Usunięcie wydarzenia u siebie ukrywa je tylko w Twoim kalendarzu. Wydarzenia dodane przez Ciebie w kalendarzu „Avenit” nie trafiają do Avenit.')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
