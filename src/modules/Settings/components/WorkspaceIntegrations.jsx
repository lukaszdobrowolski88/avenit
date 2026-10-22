import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Link2, Unlink, Eye, RefreshCw, Check, AlertCircle, Info, ChevronDown, Users, Copy } from 'lucide-react';
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
          </ol>
        ) : (
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>{tr('Kliknij „Połącz” i zaloguj się kontem Administratora globalnego Microsoft 365 (Entra ID).')}</li>
            <li>{tr('Na drugim ekranie zatwierdź zgodę administratora w imieniu organizacji — aplikacja dostaje tylko odczyt listy użytkowników (User.Read.All).')}</li>
            <li>{tr('Zgodę można w każdej chwili cofnąć w centrum administracyjnym Entra: Aplikacje dla przedsiębiorstw → Avenit → Usuń.')}</li>
            <li>{tr('Własna rejestracja aplikacji (zaawansowane): URI przekierowania typu „Web”:')}<CopyField value={st.redirect_uri} />{tr('uprawnienia: delegowane User.Read oraz aplikacji User.Read.All, a w „Token configuration” oświadczenie grup → „Directory roles”.')}</li>
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

function ProviderCard({ provider, st, roles, reload }) {
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
    </div>
  );
}

export default function WorkspaceIntegrations() {
  const [status, setStatus] = useState(null);
  const [roles, setRoles] = useState([]);
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
  }, [load]);

  // Powrót z ekranu zgody dostawcy: ?ws=google&ws_result=connected|error&ws_reason=…
  useEffect(() => {
    const ws = searchParams.get('ws');
    const result = searchParams.get('ws_result');
    if (!ws || !result) return;
    const m = callbackMessage(ws, result, searchParams.get('ws_reason'));
    if (m.ok) toast.success(m.text); else toast.error(m.text);
    const next = new URLSearchParams(searchParams);
    ['ws', 'ws_result', 'ws_reason'].forEach((k) => next.delete(k));
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
          <p className="text-xs text-gray-500">{tr('Połączenie z kontem organizacji: konta z katalogu (wkrótce także kalendarz i pliki).')}</p>
        </div>
      </div>
      {error && <Note tone="error">{error}</Note>}
      {!status && !error && <div className="py-6 flex justify-center"><Spinner /></div>}
      {status && (
        <div className="space-y-4">
          {WS_PROVIDERS.map((p) => status[p] && <ProviderCard key={p} provider={p} st={status[p]} roles={roles} reload={load} />)}
        </div>
      )}
    </section>
  );
}
