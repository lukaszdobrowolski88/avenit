import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Link2, Unlink, Eye, RefreshCw, Check, AlertCircle, Info, ChevronDown, Users, Copy, CalendarDays, Trash2, Cloud } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { Toggle } from './SettingsUI';
import {
  WS_PROVIDERS, providerLabel, connectionState, callbackMessage, TRIGGER_LABEL, runSummary, SKIP_REASON, domainsToText,
} from './workspaceLogic';
import { syncSummary, listToText, textToList, formatWhen } from './calendarSyncLogic';

// Ustawienia → Integracje → Google Workspace / Microsoft 365 (Faza 1: połączenie + konta z katalogu).
// Dane i akcje wyłącznie przez fn workspace-integration / directory-sync — tokeny i sekrety nigdy
// nie trafiają do przeglądarki. Szczegóły: docs/integrations-workspace.md.

const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body, silent: true });
  if (error) throw new Error(error.message);
  return data;
};

const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg';
const labelCls = 'block text-sm font-medium text-gray-800 dark:text-gray-100 mb-1';
const hintCls = 'text-xs text-gray-500 dark:text-gray-400 mt-1';

function StatusPill({ state }) {
  const cls = state.tone === 'ok'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : state.tone === 'error'
      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{state.tone === 'ok' ? <Check size={12} aria-hidden="true" /> : state.tone === 'error' ? <AlertCircle size={12} aria-hidden="true" /> : null}{state.label}</span>;
}

function Note({ tone = 'info', children }) {
  const cls = tone === 'warn'
    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
    : tone === 'error'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300';
  return (
    <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${cls}`}>
      {tone === 'info' ? <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CopyField({ value }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); toast.success(tr('Skopiowano adres')); } catch { toast.error(tr('Nie udało się skopiować')); }
  };
  return (
    <div className="flex items-center gap-2 mt-1">
      <code className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono break-all">{value}</code>
      <button type="button" onClick={copy} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={tr('Kopiuj adres')}><Copy size={14} /></button>
    </div>
  );
}

function SetupGuide({ provider, st }) {
  return (
    <details className="rounded-lg border border-gray-200 dark:border-gray-600 group">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-between">
        {provider === 'google' ? tr('Jak przygotować Google Workspace') : tr('Jak przygotować Microsoft 365')}
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-3 text-sm text-gray-700 dark:text-gray-300 space-y-2">
        {provider === 'google' ? (
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>{tr('W Google Cloud Console (projekt organizacji) włącz „Admin SDK API”.')}</li>
            <li>{tr('Ekran zgody OAuth: typ „Wewnętrzny” (Internal) — wtedy bez weryfikacji Google i bez limitu 100 użytkowników.')}</li>
            <li>{tr('Utwórz klienta OAuth typu „Aplikacja internetowa” (albo użyj klienta z logowania Google) i dodaj autoryzowany URI przekierowania:')}<CopyField value={st.redirect_uri} /></li>
            <li>{tr('Wpisz identyfikator i tajny klucz klienta poniżej (Własna aplikacja OAuth), chyba że platforma ma już skonfigurowanego klienta.')}</li>
            <li>{tr('Kliknij „Połącz” i zaloguj się kontem superadministratora Google Workspace — zaznacz wszystkie uprawnienia (odczyt użytkowników i grup).')}</li>
            <li>{tr('Kalendarz (osobisty i kościoła): włącz „Google Calendar API” i dodaj na ekranie zgody zakresy calendar.app.created oraz calendar.acls. Zakresy kalendarza Google uznaje za wrażliwe — przy typie „Wewnętrzny” nie wymagają weryfikacji.')}</li>
          </ol>
        ) : (
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>{tr('Kliknij „Połącz” i zaloguj się kontem Administratora globalnego Microsoft 365 (Entra ID).')}</li>
            <li>{tr('Na drugim ekranie zatwierdź zgodę administratora w imieniu organizacji — aplikacja dostaje odczyt listy użytkowników (User.Read.All) oraz zapis kalendarzy (Calendars.ReadWrite) dla kalendarza kościoła.')}</li>
            <li>{tr('Zgodę można w każdej chwili cofnąć w centrum administracyjnym Entra: Aplikacje dla przedsiębiorstw → Avenit → Usuń.')}</li>
            <li>{tr('Własna rejestracja aplikacji (zaawansowane): URI przekierowania typu „Web”:')}<CopyField value={st.redirect_uri} />{tr('uprawnienia: delegowane User.Read oraz aplikacji User.Read.All, a w „Token configuration” oświadczenie grup → „Directory roles”.')}</li>
            <li>{tr('Kalendarz: delegowane Calendars.ReadWrite i offline_access (kalendarze osób) oraz aplikacji Calendars.ReadWrite (kalendarz kościoła) — po dodaniu kliknij „Połącz ponownie”, żeby zatwierdzić zgodę. Dostęp aplikacji do skrzynek możesz zawęzić zasadą dostępu aplikacji w Exchange Online.')}</li>
          </ol>
        )}
      </div>
    </details>
  );
}

function OwnCredentials({ provider, st, onSaved }) {
  const [clientId, setClientId] = useState(st.own_client_id || '');
  const [secret, setSecret] = useState('');
  const [msTenant, setMsTenant] = useState(st.own_ms_tenant || '');
  useEffect(() => { setClientId(st.own_client_id || ''); setMsTenant(st.own_ms_tenant || ''); setSecret(''); }, [st.own_client_id, st.own_ms_tenant]);
  if (!st.can_credentials) return null;
  const save = async () => {
    try {
      await invoke('workspace-integration', { action: 'save_credentials', provider, client_id: clientId.trim(), client_secret: secret || undefined, ms_tenant: msTenant.trim() });
      toast.success(clientId.trim() ? tr('Zapisano własną aplikację OAuth.') : tr('Usunięto własną aplikację OAuth.'));
      setSecret('');
      onSaved();
    } catch (e) { toast.error(e.message); }
  };
  return (
    <details className="rounded-lg border border-gray-200 dark:border-gray-600 group" open={!st.available && !st.own_client_id}>
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-between">
        {tr('Własna aplikacja OAuth (zaawansowane)')}
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <p className={hintCls}>
          {st.creds_source === 'sso' ? tr('Teraz używany jest klient z logowania kontem tej usługi (Bezpieczeństwo → logowanie). Dodaj w nim drugi URI przekierowania z instrukcji.')
            : st.creds_source === 'platform' ? tr('Teraz używana jest aplikacja platformy Avenit.')
              : st.creds_source === 'tenant' ? tr('Używana jest własna aplikacja kościoła.') : tr('Brak aplikacji — podaj własną albo poproś operatora platformy.')}
        </p>
        <div>
          <label className={labelCls} htmlFor={`ws-${provider}-cid`}>{tr('Identyfikator aplikacji (Client ID)')}</label>
          <input id={`ws-${provider}-cid`} className={`${inputCls} font-mono`} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor={`ws-${provider}-sec`}>{tr('Tajny klucz (wpisz, aby zmienić)')}</label>
          <input id={`ws-${provider}-sec`} type="password" className={`${inputCls} font-mono`} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off"
            placeholder={st.own_secret_set ? '••••••••' : ''} />
        </div>
        {provider === 'microsoft' && (
          <div>
            <label className={labelCls} htmlFor="ws-ms-tenant">{tr('Katalog Microsoft (ID katalogu albo domena; puste = dowolna organizacja)')}</label>
            <input id="ws-ms-tenant" className={`${inputCls} font-mono`} value={msTenant} onChange={(e) => setMsTenant(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="flex justify-end"><Button size="sm" onClick={save}>{tr('Zapisz')}</Button></div>
      </div>
    </details>
  );
}

function SyncSettings({ provider, st, roles, onSaved }) {
  const s = st.settings || {};
  const [domains, setDomains] = useState(domainsToText(s.allowed_domains));
  useEffect(() => { setDomains(domainsToText(s.allowed_domains)); }, [s.allowed_domains]);
  const save = async (patch) => {
    try {
      await invoke('workspace-integration', { action: 'save_settings', provider, settings: patch });
      onSaved();
    } catch (e) { toast.error(e.message); }
  };
  const radio = (name, value, current, label, hint) => (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="radio" name={`${provider}-${name}`} checked={current === value} onChange={() => save({ [name]: value })} className="mt-1 accent-accent-primary" />
      <span><span className="text-gray-800 dark:text-gray-100">{label}</span>{hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}</span>
    </label>
  );
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor={`ws-${provider}-domains`}>{tr('Dozwolone domeny e-mail')}</label>
        <input id={`ws-${provider}-domains`} className={inputCls} value={domains} onChange={(e) => setDomains(e.target.value)}
          onBlur={() => { if (domains !== domainsToText(s.allowed_domains)) save({ allowed_domains: domains }); }}
          placeholder={domainsToText(st.allowed_domains_effective) || tr('np. nasz-kosciol.pl')} />
        <p className={hintCls}>
          {tr('Konta zakładamy tylko dla tych domen.')}{' '}
          {!s.allowed_domains?.length && st.allowed_domains_effective?.length > 0 && tr('Teraz: {domains} ({source}).', {
            domains: domainsToText(st.allowed_domains_effective),
            source: st.allowed_domains_source === 'sso' ? tr('z ustawień logowania') : tr('domena połączonego konta'),
          })}
        </p>
      </div>
      <div>
        <label className={labelCls} htmlFor={`ws-${provider}-role`}>{tr('Rola nowych kont')}</label>
        <select id={`ws-${provider}-role`} className={inputCls} value={s.default_role || 'czlonek'} onChange={(e) => save({ default_role: e.target.value })}>
          {roles.filter((r) => !r.is_admin).map((r) => <option key={r.key} value={r.key}>{r.label || r.key}</option>)}
        </select>
        <p className={hintCls}>{tr('Role istniejących kont nigdy nie są zmieniane.')}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className={labelCls}>{tr('Nowe osoby z katalogu')}</legend>
        {radio('mode', 'queue', s.mode, tr('Dodawaj do kolejki zatwierdzeń'), tr('Konto czeka na akceptację w Użytkownikach.'))}
        {radio('mode', 'active', s.mode, tr('Zakładaj konta automatycznie (aktywne)'))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className={labelCls}>{tr('Gdy osoba zostanie wyłączona lub usunięta w katalogu')}</legend>
        {radio('on_disable', 'none', s.on_disable, tr('Nic nie rób'))}
        {radio('on_disable', 'block', s.on_disable, tr('Zablokuj konto w Avenit'), tr('Dotyczy tylko kont powiązanych z katalogiem; administratorów nigdy nie blokujemy.'))}
      </fieldset>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{tr('Wysyłaj zaproszenie e-mail do nowych aktywnych kont')}</div>
          <div className={hintCls}>{tr('Link „ustaw hasło” — gdy osoby nie będą logować się kontem {name}.', { name: providerLabel(provider) })}</div>
        </div>
        <Toggle label={tr('Wysyłaj zaproszenie e-mail do nowych aktywnych kont')} checked={!!s.send_invite} onChange={(v) => save({ send_invite: v })} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{tr('Synchronizuj automatycznie co 6 godzin')}</div>
          <div className={hintCls}>{s.first_applied_at ? tr('Według powyższych zasad.') : tr('Dostępne po pierwszym ręcznym zastosowaniu podglądu.')}</div>
        </div>
        <Toggle label={tr('Synchronizuj automatycznie co 6 godzin')} checked={!!s.enabled} disabled={!s.first_applied_at || !st.can_apply} onChange={(v) => save({ enabled: v })} />
      </div>
    </div>
  );
}

function PreviewResult({ preview }) {
  const p = preview.plan;
  const tiles = [
    [tr('Nowe konta'), p.counts.create],
    [tr('Istniejące — do powiązania'), p.counts.link],
    [tr('Do zablokowania'), p.counts.block],
    [tr('Już powiązane'), p.counts.linked],
    [tr('Pominięte'), p.counts.skipped],
  ];
  const skipReason = SKIP_REASON();
  const list = (title, rows, render) => rows.length > 0 && (
    <details className="rounded-lg border border-gray-200 dark:border-gray-600">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">{title} ({rows.length})</summary>
      <ul className="px-3 pb-2 text-sm divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-auto">
        {rows.map((r, i) => <li key={i} className="py-1.5 flex justify-between gap-3"><span className="truncate">{r.name || r.email}</span><span className="text-gray-500 dark:text-gray-400 truncate">{render(r)}</span></li>)}
      </ul>
    </details>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tiles.map(([label, n]) => (
          <div key={label} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2">
            <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{n}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
          </div>
        ))}
      </div>
      <p className={hintCls}>{tr('W katalogu: {n} kont. Dozwolone domeny: {domains}.', { n: p.counts.directory, domains: domainsToText(preview.allowed_domains) || '—' })}</p>
      {list(tr('Nowe konta'), p.create, (r) => r.email)}
      {list(tr('Istniejące — do powiązania'), p.link, (r) => r.email)}
      {list(tr('Do zablokowania'), p.block, (r) => `${r.email} · ${r.reason === 'removed' ? tr('usunięte z katalogu') : tr('wyłączone w katalogu')}`)}
      {list(tr('Chronione (administratorzy — bez zmian)'), p.protected, (r) => r.email)}
      {list(tr('Pominięte'), p.skipped, (r) => `${r.email || ''} · ${skipReason[r.reason] || r.reason}`)}
      {Array.isArray(preview.groups) && preview.groups.length > 0 && list(tr('Grupy w katalogu (do przyszłego mapowania na służby)'), preview.groups, (g) => tr('{n} osób', { n: g.members }))}
    </div>
  );
}

function History({ rows }) {
  if (!rows?.length) return null;
  const trig = TRIGGER_LABEL();
  return (
    <details className="rounded-lg border border-gray-200 dark:border-gray-600 group">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-between">
        {tr('Historia synchronizacji')}
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="px-3 pb-3 divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-800 dark:text-gray-100">{new Date(r.started_at).toLocaleString(appLocale())} · {trig[r.trigger] || r.trigger}</span>
              <span className={r.status === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : r.status === 'error' ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}>
                {r.status === 'ok' ? tr('OK') : r.status === 'error' ? tr('Błąd') : tr('W toku')}
              </span>
            </div>
            {r.status !== 'running' && Object.keys(r.counts || {}).length > 0 && <div className="text-xs text-gray-500 dark:text-gray-400">{runSummary(r)}</div>}
            {(r.errors || []).length > 0 && <div className="text-xs text-red-700 dark:text-red-300 break-words">{r.errors.slice(0, 3).join(' · ')}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Kalendarz kościoła (Faza 2): Microsoft — skrzynka/zasób kościoła (uprawnienie aplikacji
// Calendars.ReadWrite na połączeniu organizacji); Google — kalendarz na koncie administratora
// udostępniony domenie. Tylko wydarzenia widoczne dla wszystkich członków (+ filtr modułów/typów).
function ChurchCalendar({ provider, st, modules, reload }) {
  const cal = st.calendar || {};
  const t = cal.target;
  const prefs = t?.prefs || {};
  const [mailbox, setMailbox] = useState(t?.mailbox || '');
  const [types, setTypes] = useState(listToText(prefs.event_types));
  const [busy, setBusy] = useState(null);
  useEffect(() => { setMailbox(t?.mailbox || ''); setTypes(listToText(t?.prefs?.event_types)); }, [t?.mailbox, t?.prefs?.event_types]);
  const isMs = provider === 'microsoft';
  const ready = isMs ? !!cal.tenant_connected : !!cal.admin_has_scope || !!t;

  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  const save = (settings) => run('save', async () => {
    await invoke('workspace-integration', { action: 'calendar_save', provider, settings });
    toast.success(tr('Zapisano ustawienia kalendarza kościoła.'));
    reload();
  });
  const savePrefs = (patch) => save({ prefs: patch });
  const connectGoogle = () => run('connect', async () => {
    const data = await invoke('workspace-integration', { action: 'calendar_connect', provider });
    window.location.assign(data.url);
  });
  const syncNow = () => run('sync', async () => {
    const r = await invoke('workspace-integration', { action: 'calendar_sync', provider });
    if (r.result?.error) toast.error(r.result.error); else toast.success(tr('Kalendarz kościoła zsynchronizowany.'));
    reload();
  });
  const remove = async () => {
    if (!(await confirmDialog(tr('Wyłączyć kalendarz kościoła? Kalendarz u dostawcy zostaje, ale przestanie być aktualizowany.')))) return;
    run('remove', async () => { await invoke('workspace-integration', { action: 'calendar_remove', provider }); reload(); });
  };
  const toggleModule = (key, on) => {
    const cur = new Set(prefs.modules || []);
    if (on) cur.add(key); else cur.delete(key);
    savePrefs({ modules: [...cur] });
  };
  const moduleOptions = [{ key: 'general', label: tr('Ogólne') }, ...modules.filter((m) => m.key !== 'calendar').map((m) => ({ key: m.key, label: tr(m.label || m.key) }))];

  return (
    <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-600">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-gray-500" aria-hidden="true" />
          <h4 className="font-semibold text-gray-900 dark:text-white">{tr('Kalendarz kościoła')}</h4>
          {t && <StatusPill state={t.status === 'error' ? { tone: 'error', label: tr('Błąd synchronizacji') } : t.enabled ? { tone: 'ok', label: tr('Włączony') } : { tone: 'none', label: tr('Wyłączony') }} />}
        </div>
        {t && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={syncNow} loading={busy === 'sync'}>{tr('Synchronizuj teraz')}</Button>
            <Button variant="outline" size="sm" icon={Trash2} onClick={remove} loading={busy === 'remove'}>{tr('Wyłącz')}</Button>
          </div>
        )}
      </div>
      <p className={hintCls}>
        {isMs
          ? tr('Wydarzenia widoczne dla wszystkich członków trafiają do kalendarza wskazanej skrzynki (np. zasobu albo skrzynki współdzielonej) — każdy w organizacji może go dodać w Outlooku.')
          : tr('Wydarzenia widoczne dla wszystkich członków trafiają do kalendarza „Avenit” na Twoim koncie Google, udostępnionego do odczytu całej domenie.')}
      </p>
      {t?.last_error && <Note tone="error">{t.last_error}</Note>}
      {isMs && !cal.tenant_connected && <Note tone="warn">{tr('Najpierw połącz Microsoft 365 (przycisk „Połącz” powyżej).')}</Note>}
      {isMs && cal.tenant_connected && !cal.app_role_ok && !t && (
        <Note tone="warn">{tr('Aplikacja nie ma jeszcze uprawnienia Calendars.ReadWrite — po dodaniu go w rejestracji aplikacji kliknij „Połącz ponownie” i zatwierdź zgodę administratora.')}</Note>
      )}
      {!isMs && !cal.admin_has_scope && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" icon={Link2} onClick={connectGoogle} loading={busy === 'connect'} disabled={!st.available}>{tr('Połącz konto Google')}</Button>
          <span className={hintCls}>{tr('Twoje konto Google (najlepiej konto organizacji) zostanie właścicielem kalendarza kościoła.')}</span>
        </div>
      )}
      {isMs && cal.tenant_connected && (
        <div>
          <label className={labelCls} htmlFor="ws-cal-mailbox">{tr('Skrzynka kalendarza kościoła')}</label>
          <div className="flex gap-2">
            <input id="ws-cal-mailbox" className={inputCls} value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="kalendarz@kosciol.pl" autoComplete="off" />
            <Button size="sm" onClick={() => save({ mailbox: mailbox.trim(), enabled: true })} loading={busy === 'save'} disabled={!mailbox.trim()}>{t ? tr('Zapisz') : tr('Włącz')}</Button>
          </div>
          <p className={hintCls}>{tr('Skrzynka zasobu, współdzielona albo zwykła w Twojej organizacji Microsoft 365.')}</p>
        </div>
      )}
      {!isMs && cal.admin_has_scope && !t && (
        <Button size="sm" icon={CalendarDays} onClick={() => save({ use_my_account: true, enabled: true })} loading={busy === 'save'}>{tr('Utwórz kalendarz kościoła')}</Button>
      )}
      {ready && t && (
        <div className="space-y-4">
          <p className={hintCls}>
            {t.calendar_name ? tr('Kalendarz „{name}”', { name: t.calendar_name }) : tr('Kalendarz zostanie utworzony przy pierwszej synchronizacji')}
            {' · '}{syncSummary(t)}
            {t.owner_email ? ` · ${tr('skonfigurował(a): {who}', { who: t.owner_email })}` : ''}
          </p>
          {!isMs && t.shared_with_domain === false && <Note tone="warn">{tr('Nie udało się udostępnić kalendarza domenie — udostępnij go ręcznie w ustawieniach kalendarza Google.')}</Note>}
          {isMs && (
            <fieldset className="space-y-2">
              <legend className={labelCls}>{tr('Kalendarz w skrzynce')}</legend>
              {[['dedicated', tr('Osobny kalendarz „Avenit”')], ['primary', tr('Główny kalendarz skrzynki')]].map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="ws-cal-mode" checked={(prefs.calendar_mode || 'dedicated') === v} onChange={() => savePrefs({ calendar_mode: v })} className="accent-accent-primary" />
                  <span className="text-gray-800 dark:text-gray-100">{label}</span>
                </label>
              ))}
            </fieldset>
          )}
          <fieldset>
            <legend className={labelCls}>{tr('Moduły (puste = wszystkie)')}</legend>
            <div className="flex flex-wrap gap-2">
              {moduleOptions.map((m) => {
                const on = (prefs.modules || []).includes(m.key);
                return (
                  <label key={m.key} className={`px-2.5 py-1 rounded-full text-xs cursor-pointer border ${on ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 border-accent-primary text-accent-primary-dark dark:text-accent-primary-light' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={(e) => toggleModule(m.key, e.target.checked)} />
                    {m.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label className={labelCls} htmlFor={`ws-cal-types-${provider}`}>{tr('Typy wydarzeń (puste = wszystkie)')}</label>
            <input id={`ws-cal-types-${provider}`} className={inputCls} value={types} onChange={(e) => setTypes(e.target.value)}
              onBlur={() => { if (types !== listToText(prefs.event_types)) savePrefs({ event_types: textToList(types) }); }} placeholder={tr('np. service, conference')} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{tr('Importuj nowe wydarzenia z kalendarza kościoła')}</div>
              <div className={hintCls}>{tr('Wydarzenie dodane w kalendarzu u dostawcy pojawi się w Avenit (kalendarz ogólny, widoczne dla wszystkich).')}</div>
            </div>
            <Toggle label={tr('Importuj nowe wydarzenia z kalendarza kościoła')} checked={!!prefs.import_new} onChange={(v) => savePrefs({ import_new: v })} />
          </div>
          {!isMs && (
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{tr('Udostępnij kalendarz całej domenie (odczyt)')}</div>
              <Toggle label={tr('Udostępnij kalendarz całej domenie (odczyt)')} checked={prefs.share_domain !== false} onChange={(v) => savePrefs({ share_domain: v })} />
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{tr('Synchronizacja włączona')}</div>
            <Toggle label={tr('Synchronizacja włączona')} checked={!!t.enabled} onChange={(v) => save({ enabled: v })} />
          </div>
          {t.last_pull_at && <p className={hintCls}>{tr('Zmiany z kalendarza sprawdzone: {when}', { when: formatWhen(t.last_pull_at) })}</p>}
        </div>
      )}
    </div>
  );
}

// Pliki z chmury (Faza 3): wyłączenie per dostawca i — dla Google — klucz API / numer projektu Pickera.
// Każda osoba łączy WŁASNE konto (Mój profil albo przy pierwszym wyborze pliku); Avenit zapisuje tylko odnośnik.
function CloudFilesSettings({ provider, st, reload }) {
  const f = st.files || { enabled: true };
  const [apiKey, setApiKey] = useState(f.picker_api_key || '');
  const [appId, setAppId] = useState(f.picker_app_id || '');
  const [busy, setBusy] = useState(null);
  useEffect(() => { setApiKey(f.picker_api_key || ''); setAppId(f.picker_app_id || ''); }, [f.picker_api_key, f.picker_app_id]);
  const domain = `*.${String(window.location.hostname || 'avenit.pl').split('.').slice(-2).join('.')}`;
  const save = async (settings, key = 'save') => {
    setBusy(key);
    try {
      await invoke('workspace-integration', { action: 'files_save', provider, settings });
      toast.success(tr('Zapisano ustawienia plików z chmury.'));
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };
  const isGoogle = provider === 'google';
  return (
    <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-600">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <Cloud size={16} className="text-gray-500" aria-hidden="true" />
          <h4 className="font-semibold text-gray-900 dark:text-white">{tr('Pliki z chmury')}</h4>
          <StatusPill state={!f.enabled ? { tone: 'none', label: tr('Wyłączone') } : (isGoogle && !f.ready) ? { tone: 'error', label: tr('Wymaga konfiguracji') } : { tone: 'ok', label: tr('Włączone') }} />
        </div>
        <Toggle label={tr('Pliki z chmury')} checked={f.enabled !== false} disabled={busy === 'toggle'} onChange={(v) => save({ enabled: v }, 'toggle')} />
      </div>
      <p className={hintCls}>
        {isGoogle
          ? tr('Osoby dodają pliki z Dysku Google do wiadomości, materiałów wydarzeń i Plików jako odnośnik — bez kopiowania. Każdy łączy własne konto (zakres drive.file: dostęp tylko do wybranych plików).')
          : tr('Osoby dodają pliki z OneDrive i SharePoint do wiadomości, materiałów wydarzeń i Plików jako odnośnik — bez kopiowania. Każdy łączy własne konto służbowe (odczyt plików, Files.Read.All).')}
      </p>
      {isGoogle && f.enabled && !f.ready && <Note tone="warn">{tr('Brakuje klucza API Google Picker — bez niego nie da się wybierać plików z Dysku Google.')}</Note>}
      <details className="rounded-lg border border-gray-200 dark:border-gray-600 group">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-between">
          {tr('Jak włączyć pliki z chmury')}
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="px-3 pb-3 text-sm text-gray-700 dark:text-gray-300">
          {isGoogle ? (
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>{tr('W projekcie Google Cloud z klientem OAuth włącz „Google Drive API” i „Google Picker API”.')}</li>
              <li>{tr('Na ekranie zgody dodaj zakres …/auth/drive.file — jest niewrażliwy (bez weryfikacji i audytu CASA).')}</li>
              <li>{tr('Utwórz klucz API (Dane logowania → Klucz API), ogranicz go do odwołań HTTP {domain} i do „Google Picker API”, a potem wpisz go poniżej.', { domain })}</li>
              <li>{tr('Numer projektu (identyfikator aplikacji Pickera) wyliczamy z identyfikatora klienta OAuth — wpisz go tylko, jeśli klucz pochodzi z innego projektu.')}</li>
              <li>{tr('Udostępnianie organizacji przy dodawaniu pliku działa tylko dla kont Google Workspace i nigdy nie robi pliku publicznym.')}</li>
            </ol>
          ) : (
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>{tr('W rejestracji aplikacji dodaj uprawnienia delegowane Microsoft Graph: Files.Read.All i offline_access.')}</li>
              <li>{tr('Dla okna wyboru OneDrive / SharePoint dodaj uprawnienia delegowane SharePoint: MyFiles.Read i AllSites.Read.')}</li>
              <li>{tr('Te uprawnienia zwykle wymagają zgody administratora: Entra → Aplikacje dla przedsiębiorstw → Avenit → Uprawnienia → „Udziel zgody administratora”.')}</li>
              <li>{tr('Avenit nie zmienia udostępniania plików Microsoft 365 (wymagałoby prawa zapisu) — osoby udostępniają pliki w OneDrive / SharePoint.')}</li>
            </ol>
          )}
        </div>
      </details>
      {isGoogle && f.enabled && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ws-picker-key">{tr('Klucz API Google Picker')}</label>
            <input id="ws-picker-key" className={inputCls} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={f.api_key_source === 'platform' ? tr('Używany klucz platformy') : 'AIza…'} autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ws-picker-app">{tr('Numer projektu Google (opcjonalnie)')}</label>
            <input id="ws-picker-app" className={inputCls} value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ''))} placeholder={f.app_id_effective || '123456789012'} inputMode="numeric" />
            {f.app_id_effective && <p className={hintCls}>{tr('Używany: {id}', { id: f.app_id_effective })}</p>}
          </div>
          <div className="sm:col-span-2">
            <Button size="sm" variant="outline" onClick={() => save({ picker_api_key: apiKey.trim(), picker_app_id: appId.trim() })} loading={busy === 'save'}>{tr('Zapisz')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider, st, roles, modules, reload }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const state = connectionState(st);
  const conn = st.connection;
  const name = providerLabel(provider);
  const firstDone = !!st.settings?.first_applied_at;

  const connect = async () => {
    setBusy('connect');
    try {
      const data = await invoke('workspace-integration', { action: 'connect', provider });
      window.location.assign(data.url);
    } catch (e) { toast.error(e.message); setBusy(null); }
  };
  const disconnect = async () => {
    if (!(await confirmDialog(tr('Rozłączyć {name}? Synchronizacja kont zostanie zatrzymana; konta w Avenit zostają bez zmian.', { name })))) return;
    try { await invoke('workspace-integration', { action: 'disconnect', provider }); setPreview(null); toast.success(tr('Rozłączono.')); reload(); } catch (e) { toast.error(e.message); }
  };
  const runPreview = async () => {
    setBusy('preview');
    try { setPreview(await invoke('directory-sync', { action: 'preview', provider })); reload(); } catch (e) { toast.error(e.message); reload(); } finally { setBusy(null); }
  };
  const apply = async () => {
    const c = preview?.plan?.counts;
    const msg = c
      ? tr('Zastosować zmiany? Nowe konta: {create}, powiązania: {link}, blokady: {block}.', { create: c.create, link: c.link, block: c.block })
      : tr('Zsynchronizować konta z katalogiem {name} teraz?', { name });
    if (!(await confirmDialog(msg))) return;
    setBusy('apply');
    try {
      const r = await invoke('directory-sync', { action: 'apply', provider });
      const a = r.applied || {};
      toast.success(tr('Gotowe: {created} utworzonych, {linked} powiązanych, {blocked} zablokowanych.', { created: a.created || 0, linked: a.linked || 0, blocked: a.blocked || 0 }));
      if (r.errors?.length) toast.error(tr('Część operacji się nie udała ({n}) — szczegóły w historii.', { n: r.errors.length }));
      setPreview(null);
      reload();
    } catch (e) { toast.error(e.message); reload(); } finally { setBusy(null); }
  };

  return (
    <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light shrink-0">
            <Building2 size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white">{name}</h3>
            <div className="mt-1"><StatusPill state={state} /></div>
          </div>
        </div>
        <div className="flex gap-2">
          {conn && <Button variant="outline" size="sm" icon={Unlink} onClick={disconnect}>{tr('Rozłącz')}</Button>}
          <Button size="sm" icon={Link2} onClick={connect} loading={busy === 'connect'} disabled={!st.available}>{conn ? tr('Połącz ponownie') : tr('Połącz')}</Button>
        </div>
      </div>

      {!st.available && <Note tone="warn">{tr('Integracja niedostępna — skonfiguruj na platformie albo podaj własną aplikację OAuth poniżej.')}</Note>}
      {conn?.last_error && conn.status !== 'active' && <Note tone="error">{conn.last_error}</Note>}

      <SetupGuide provider={provider} st={st} />
      <OwnCredentials provider={provider} st={st} onSaved={reload} />

      {conn && (
        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-600">
          <div className="flex items-center gap-2 pt-2">
            <Users size={16} className="text-gray-500" aria-hidden="true" />
            <h4 className="font-semibold text-gray-900 dark:text-white">{tr('Konta z katalogu')}</h4>
          </div>
          {!st.sso_enabled && (
            <Note tone="warn">{tr('Logowanie kontem {name} jest wyłączone — nowe konta bez hasła nie będą mogły się zalogować. Włącz je w Ustawienia → Bezpieczeństwo albo wysyłaj zaproszenia e-mail.', { name: provider === 'google' ? 'Google' : 'Microsoft' })}</Note>
          )}
          <SyncSettings provider={provider} st={st} roles={roles} onSaved={reload} />
          {!st.can_apply && <Note>{tr('Podgląd możesz wykonać sam; zastosować zmiany może osoba z uprawnieniem „Zarządzaj użytkownikami”.')}</Note>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={Eye} onClick={runPreview} loading={busy === 'preview'}>{tr('Podgląd zmian')}</Button>
            {preview && <Button size="sm" icon={Check} onClick={apply} loading={busy === 'apply'} disabled={!st.can_apply}>{tr('Zastosuj')}</Button>}
            {!preview && firstDone && <Button size="sm" icon={RefreshCw} onClick={apply} loading={busy === 'apply'} disabled={!st.can_apply}>{tr('Synchronizuj teraz')}</Button>}
          </div>
          {!firstDone && !preview && <p className={hintCls}>{tr('Przed pierwszą synchronizacją zobacz podgląd zmian.')}</p>}
          {preview && <PreviewResult preview={preview} />}
          <History rows={st.history} />
        </div>
      )}

      <ChurchCalendar provider={provider} st={st} modules={modules} reload={reload} />
      <CloudFilesSettings provider={provider} st={st} reload={reload} />
    </div>
  );
}

export default function WorkspaceIntegrations() {
  const [status, setStatus] = useState(null);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    try {
      const data = await invoke('workspace-integration', { action: 'status' });
      setStatus(data.providers);
      setError(null);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    load();
    supabase.from('app_roles').select('key, label, is_admin, display_order').order('display_order', { ascending: true })
      .then(({ data }) => setRoles(data || []));
    supabase.from('app_modules').select('key, label, is_enabled').order('label', { ascending: true })
      .then(({ data }) => setModules((data || []).filter((m) => m.is_enabled !== false)));
  }, [load]);

  // Powrót z ekranu zgody dostawcy: ?ws=google&ws_result=connected|error&ws_reason=…
  useEffect(() => {
    const ws = searchParams.get('ws');
    const result = searchParams.get('ws_result');
    if (!ws || !result) return;
    const m = callbackMessage(ws, result, searchParams.get('ws_reason'));
    if (m.ok) toast.success(m.text); else toast.error(m.text);
    const next = new URLSearchParams(searchParams);
    ['ws', 'ws_result', 'ws_reason', 'ws_target'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
          <Building2 className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{tr('Google Workspace i Microsoft 365')}</h2>
          <p className="text-xs text-gray-500">{tr('Połączenie z kontem organizacji: konta z katalogu, kalendarz kościoła i pliki z chmury.')}</p>
        </div>
      </div>
      {error && <Note tone="error">{error}</Note>}
      {!status && !error && <div className="py-6 flex justify-center"><Spinner /></div>}
      {status && (
        <div className="space-y-4">
          {WS_PROVIDERS.map((p) => status[p] && <ProviderCard key={p} provider={p} st={status[p]} roles={roles} modules={modules} reload={load} />)}
        </div>
      )}
    </section>
  );
}
