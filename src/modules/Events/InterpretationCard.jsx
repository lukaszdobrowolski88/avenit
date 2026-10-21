import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Languages, Copy, Check, Printer, RefreshCw, X, Plus, Headphones, Radio, Users, Trash2, Power, AlertTriangle, CalendarX, Settings2,
} from 'lucide-react';
import Button from '../../components/Button';
import { SCHEDULE_STATUS } from '../shared/schedule/statusMeta';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/dialog';
import { tr, trPlural, appLocale } from '../../i18n';
import { callFn } from '../Komunikator/calls/callApi';
import {
  STATS_POLL_MS, channelsPayload, addChannel, removeChannel, addInterpreter, removeInterpreter,
  consolePath, originalPath, memberListenPath, totalListeners, scheduleByChannel, hasScheduleInterpreters,
  staffLabel, languagesToAdd, interpreterOptions, absenceText, interpreterWarningText,
  MODULE_ROLES_PATH, MODULE_MEMBERS_PATH,
} from '../Interpretation/interpretationLogic';
import { qrSvg } from '../Interpretation/qr';
import '../Interpretation/interpretation.css';

// Karta „Tłumaczenie na żywo” na stronie wydarzenia (src/interpretation na serwerze):
//   • zarządzający (action:calendar:manage_interpretation — ma ją lider służby Tłumaczenia — albo
//     admin): włączenie, kanały, tłumacze, „Oryginał”, link + QR + plakat A4, stan i licznik
//     słuchaczy, zakończenie;
//   • tłumacz: wejście do konsoli; członek zespołu Tłumaczeń: podgląd kanałów i tłumaczy;
//   • pozostali widzący wydarzenie: „Słuchaj” (w aplikacji).
// Spójnie z modułem Tłumaczenia (api interpretation/team.js): języki = Służby modułu (personel
// widzi „Tłumacz EN”, słuchacz „English”), tłumacz = aktywny członek zespołu z kontem (ze Służbą
// języka, jak w Grafiku), nieobecności jak w Grafiku. Kanały/osoby spoza modułu — z ostrzeżeniem.
// Kart nie ma, gdy tłumaczenia nie ma, a osoba nie może go włączyć.

// Odnośnik wyglądający jak przycisk (bez <button> w <a> — zagnieżdżone elementy interaktywne).
const LINK_VARIANTS = {
  primary: 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md hover:shadow-lg hover:opacity-95',
  outline: 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
  ghost: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50',
};
function LinkButton({ to, icon: Icon, variant = 'primary', children }) {
  return (
    <Link to={to} className={`inline-flex items-center justify-center font-medium transition text-xs px-3 py-1.5 gap-1.5 rounded-lg ${LINK_VARIANTS[variant] || LINK_VARIANTS.primary}`}>
      {Icon && <Icon size={14} aria-hidden="true" />}{children}
    </Link>
  );
}

// Plakat A4: drukowany z tej strony (window.print + style druku w interpretation.css).
function Poster({ url, title, when, church, channels }) {
  const svg = useMemo(() => qrSvg(url, { margin: 1, ecc: 'Q' }), [url]);
  return (
    <div className="ip-poster">
      <div className="ip-poster-brand">{church || 'Avenit'}</div>
      <h1 className="ip-poster-title">{tr('Tłumaczenie na żywo')}</h1>
      <p className="ip-poster-event">{[title, when].filter(Boolean).join(' · ')}</p>
      {/* eslint-disable-next-line react/no-danger */}
      <div className="ip-poster-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="ip-poster-langs">{channels.map((c) => <span key={c.id || c.lang_code} lang={c.lang_code}>{c.label}</span>)}</div>
      <ol className="ip-poster-steps">
        <li>{tr('1. Zeskanuj kod aparatem telefonu')}</li>
        <li>{tr('2. Wybierz język i naciśnij „Słuchaj”')}</li>
        <li>{tr('3. Włóż słuchawki — konto nie jest potrzebne')}</li>
      </ol>
      <div className="ip-poster-url">{url}</div>
    </div>
  );
}

function posterWhen(ev) {
  const day = String(ev?.date || '').slice(0, 10);
  if (!day) return '';
  let out = day;
  try { out = new Date(`${day}T12:00:00`).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' }); } catch { /* data jak w bazie */ }
  return ev.time ? `${out}, ${String(ev.time).slice(0, 5)}` : out;
}

function printPoster() {
  const done = () => { document.body.classList.remove('ip-printing'); window.removeEventListener('afterprint', done); };
  document.body.classList.add('ip-printing');
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
}

const STATUS = {
  idle: { label: 'Gotowe — jeszcze nikt nie nadaje', tone: 'text-gray-600 dark:text-gray-300' },
  live: { label: 'Trwa tłumaczenie', tone: 'text-red-700 dark:text-red-300 font-semibold' },
  ended: { label: 'Zakończone', tone: 'text-gray-500 dark:text-gray-400' },
};

// Osoba z grafiku, która jeszcze nie tłumaczy — status jak w legendzie Grafiku.
function SchedulePerson({ p }) {
  const meta = p.state === 'no_account' ? null : (SCHEDULE_STATUS[p.state] || SCHEDULE_STATUS.pending);
  const Icon = meta ? meta.icon : AlertTriangle;
  const label = meta ? meta.label() : tr('bez konta w aplikacji');
  const title = p.state === 'no_account'
    ? tr('Potwierdził w grafiku, ale nie ma aktywnego konta w aplikacji — nie może wejść do konsoli.')
    : tr('Przypisany w grafiku Tłumaczeń — trafi do kanału po potwierdzeniu.');
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs text-gray-500 dark:text-gray-400" title={title}>
      <Icon size={12} strokeWidth={2.5} className={meta ? meta.cls : 'text-amber-700 dark:text-amber-400'} aria-hidden="true" />
      {p.name} <span className="text-gray-400">· {label}</span>
    </span>
  );
}

// Przypisany tłumacz: z grafiku (potwierdzone), ostrzeżenie (spoza zespołu / nieaktywny / bez
// Służby), nieobecność w dniu wydarzenia.
function InterpreterChip({ i, c, canRemove, onRemove }) {
  const warning = interpreterWarningText(i.warning, c);
  const absent = absenceText(i.absent);
  const flagged = !!(warning || absent);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-white dark:bg-gray-900 border pl-2.5 pr-1 py-0.5 text-xs text-gray-800 dark:text-gray-100 ${flagged ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'}`}>
      {i.source === 'schedule' && (
        <Check size={12} strokeWidth={2.5} className={SCHEDULE_STATUS.accepted.cls} aria-hidden="true" />
      )}
      {i.name || i.email}
      {i.source === 'schedule' && (
        <span className="ml-0.5 mr-1 rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400"
          title={tr('Potwierdzone w grafiku służby Tłumaczenia — zmienisz to w grafiku.')}>{tr('z grafiku')}</span>
      )}
      {warning && (
        <span className="inline-flex items-center gap-0.5 mr-1 text-amber-700 dark:text-amber-400" title={tr('Osoba zostaje w kanale, dopóki jej nie usuniesz.')}>
          <AlertTriangle size={11} strokeWidth={2.5} aria-hidden="true" />{warning}
        </span>
      )}
      {absent && (
        <span className="inline-flex items-center gap-0.5 mr-1 text-red-600 dark:text-red-400">
          <CalendarX size={11} strokeWidth={2.5} aria-hidden="true" />{absent}
        </span>
      )}
      {canRemove && (
        <button type="button" onClick={onRemove} aria-label={tr('Usuń tłumacza: {name}', { name: i.name || i.email })}
          className="p-0.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={12} aria-hidden="true" /></button>
      )}
    </span>
  );
}

// Wybór tłumacza — tylko zespół Tłumaczeń (jak lista osób w Grafiku); nieobecni i bez konta zablokowani.
function InterpreterPicker({ c, team, wholeTeam, onPick, onCancel }) {
  const options = interpreterOptions(team, c);
  const role = staffLabel(c);
  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
      {options.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={tr('Wybierz tłumacza')}>
          {options.map((m) => {
            const why = m.blocked === 'no_account' ? tr('bez konta w aplikacji') : m.blocked === 'absent' ? absenceText(m.absent) : '';
            return (
              <li key={m.id}>
                <button type="button" disabled={!!m.blocked} onClick={() => onPick(m)}
                  title={why ? `${m.name} — ${why}` : m.name}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed disabled:font-normal">
                  {m.blocked === 'absent' && <CalendarX size={12} strokeWidth={2.5} className="text-red-600 dark:text-red-400" aria-hidden="true" />}
                  {m.name}{why && <span className="text-gray-400 font-normal">· {why}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Nikogo do wyboru. Dodaj osobę z kontem w aplikacji w zespole Tłumaczeń.')}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span>{wholeTeam
          ? tr('Nikt w zespole nie ma jeszcze Służby {role} — pokazujemy cały aktywny zespół.', { role })
          : tr('Członkowie zespołu Tłumaczeń ze Służbą {role}.', { role })}</span>
        <Link to={MODULE_MEMBERS_PATH} className="font-semibold text-gray-700 dark:text-gray-200 hover:underline">{tr('Członkowie i Służby')}</Link>
        <button type="button" onClick={onCancel} className="ml-auto font-semibold text-gray-600 dark:text-gray-300 hover:underline">{tr('Anuluj')}</button>
      </div>
    </div>
  );
}

function ChannelRow({ c, team, moduleLang, stat, canManage, moduleKnown, onRemove, onAddPerson, onRemovePerson, scheduled = [] }) {
  const [adding, setAdding] = useState(false);
  const live = (stat?.status || c.status) === 'live';
  const activeName = stat?.active_interpreter_name || c.active_interpreter_name;
  const outside = moduleKnown && c.in_module === false;
  return (
    <li className={`rounded-xl px-4 py-3 ${outside ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-800/60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 min-w-[8rem]">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">{staffLabel(c)}</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {tr('Słuchacze widzą:')} <span lang={c.lang_code} className="font-medium text-gray-700 dark:text-gray-200">{c.label}</span>
            <span className="ml-1.5 font-mono text-gray-400">{c.lang_code}</span>
          </span>
        </span>
        <span className={`inline-flex items-center gap-1.5 text-xs ${live ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
          <span className={`w-2 h-2 rounded-full ${live ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'}`} aria-hidden="true" />
          {live ? (activeName ? tr('Na żywo: {name}', { name: activeName }) : tr('Na żywo')) : tr('Nie nadaje')}
        </span>
        {stat && stat.listeners != null && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Users size={12} aria-hidden="true" /> {stat.listeners}</span>
        )}
        {canManage && (hasScheduleInterpreters(c) ? (
          <span className="p-1 text-gray-300 dark:text-gray-600" title={tr('Kanał ma tłumaczy z grafiku — zmień przypisania w grafiku służby Tłumaczenia.')}>
            <Trash2 size={14} aria-hidden="true" />
          </span>
        ) : (
          <button type="button" onClick={onRemove} aria-label={tr('Usuń kanał: {name}', { name: staffLabel(c) })} title={tr('Usuń kanał')}
            className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-200/60 dark:hover:bg-gray-700">
            <Trash2 size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      {outside && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden="true" />
          {tr('Spoza modułu Tłumaczenia — tego języka nie ma (już) w Służbach. Kanał działa, możesz go usunąć albo dodać Służbę w module.')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">{tr('Tłumacze:')}</span>
        {(c.interpreters || []).length === 0 && !scheduled.length && <span className="text-xs text-gray-400">{tr('nikt jeszcze')}</span>}
        {(c.interpreters || []).map((i) => (
          <InterpreterChip key={i.email} i={i} c={c} canRemove={canManage && i.source !== 'schedule'} onRemove={() => onRemovePerson(i.email)} />
        ))}
        {canManage && !adding && !outside && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700">
            <Plus size={12} aria-hidden="true" /> {tr('Dodaj tłumacza')}
          </button>
        )}
        {scheduled.map((p, i) => <SchedulePerson key={`${p.state}-${p.name}-${i}`} p={p} />)}
      </div>
      {canManage && adding && (
        <InterpreterPicker c={c} team={team} wholeTeam={!!moduleLang?.whole_team} onCancel={() => setAdding(false)}
          onPick={(m) => { setAdding(false); onAddPerson(m); }} />
      )}
    </li>
  );
}

// Języki to Służby modułu — skrót do zarządzania nimi.
function ModuleLink() {
  return (
    <Link to={MODULE_ROLES_PATH} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:underline">
      <Settings2 size={13} aria-hidden="true" /> {tr('Zarządzaj językami w module Tłumaczenia')}
    </Link>
  );
}

function NoLanguages() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{tr('Moduł Tłumaczenia nie ma jeszcze języków')}</p>
      <p className="mt-0.5 mb-2 text-xs text-gray-500 dark:text-gray-400">{tr('Każdy język to Służba w module Tłumaczenia (np. „Tłumacz EN” z kluczem pola en). Dodaj ją, a pojawi się tutaj i w Grafiku.')}</p>
      <ModuleLink />
    </div>
  );
}

// Czytelny podgląd kanałów (tłumacz, członek zespołu): Służba, nadawanie, tłumacze.
function ReadOnlyChannels({ channels, schedule }) {
  if (!channels.some((c) => Array.isArray(c.interpreters))) return null;
  const fromSchedule = scheduleByChannel(schedule, channels);
  return (
    <ul className="space-y-1.5" aria-label={tr('Kanały')}>
      {channels.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-gray-900 dark:text-white mr-1">{staffLabel(c)}</span>
          {c.status === 'live' && <span className="text-red-700 dark:text-red-300 font-semibold">{tr('Na żywo')}</span>}
          {(c.interpreters || []).map((i) => <InterpreterChip key={i.email} i={i} c={c} canRemove={false} />)}
          {(fromSchedule.byLang.get(c.lang_code) || []).map((p, i) => <SchedulePerson key={`${p.state}-${p.name}-${i}`} p={p} />)}
          {!(c.interpreters || []).length && !(fromSchedule.byLang.get(c.lang_code) || []).length && <span className="text-gray-400">{tr('nikt jeszcze')}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function InterpretationCard({ ev }) {
  const eventId = ev?.id;
  const [view, setView] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const copyTimer = useRef(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    try { setView(await callFn('interp-session-get', { event_id: String(eventId) })); } catch { setView((v) => v || { failed: true }); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);
  // Zmiany w module Tłumaczenia (Członkowie, Służby, Grafik) w innej karcie przeglądarki — odśwież
  // po powrocie na stronę wydarzenia.
  useEffect(() => {
    const onBack = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => { window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack); };
  }, [load]);

  const session = view?.session || null;
  const canManage = !!view?.can_manage;
  const mine = view?.my_channels || [];
  const showStats = !!session && session.status !== 'ended' && (canManage || mine.length > 0);

  useEffect(() => {
    if (!showStats) return undefined;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try { const s = await callFn('interp-stats', { event_id: String(eventId) }); if (alive) setStats(s); } catch { /* następnym razem */ }
    };
    tick();
    // Na żywo — co 10 s; poza tym rzadziej (licznik to zapytanie do LiveKit per kanał).
    const t = setInterval(tick, session?.status === 'live' ? STATS_POLL_MS : STATS_POLL_MS * 3);
    return () => { alive = false; clearInterval(t); };
  }, [showStats, eventId, session?.status]);

  const save = useCallback(async (patch, { okMsg } = {}) => {
    setBusy(true);
    setError('');
    try {
      const r = await callFn('interp-session-upsert', { event_id: String(eventId), ...patch });
      setView(r);
      if (okMsg) toast.success(okMsg);
      return r;
    } catch (err) {
      setError(err?.context?.error || err?.message || tr('Nie udało się zapisać tłumaczenia.'));
      return null;
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  if (!view || view.failed) return null;
  if (!session && !canManage) return null;

  const channels = session?.channels || [];
  const saveChannels = (next) => save({ channels: channelsPayload(next) });
  const statOf = (id) => stats?.channels?.find((c) => c.id === id) || null;
  const url = session?.public_url || '';
  const when = posterWhen(ev);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1800); } catch { toast.error(tr('Nie udało się skopiować linku.')); }
  };
  const regenerate = async () => {
    if (!(await confirmDialog({ title: tr('Nowy link do tłumaczenia?'), message: tr('Stary link i wydrukowane kody QR przestaną działać. Osoby, które już słuchają, zostaną połączone do końca.'), confirmLabel: tr('Utwórz nowy link') }))) return;
    save({ regenerate_token: true }, { okMsg: tr('Utworzono nowy link') });
  };
  const end = async () => {
    if (!(await confirmDialog({ title: tr('Zakończyć tłumaczenie?'), message: tr('Słuchacze i tłumacze zostaną rozłączeni. Możesz je potem wznowić.'), confirmLabel: tr('Zakończ'), danger: true }))) return;
    save({ end: true }, { okMsg: tr('Tłumaczenie zakończone') });
  };
  const disable = async () => {
    if (!(await confirmDialog({ title: tr('Wyłączyć tłumaczenie na żywo?'), message: tr('Usuniemy języki, przypisania tłumaczy i link (kody QR przestaną działać).'), confirmLabel: tr('Wyłącz'), danger: true }))) return;
    save({ remove: true }, { okMsg: tr('Tłumaczenie wyłączone') });
  };
  const card = 'bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5';
  const heading = (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
      <Languages size={16} className="text-accent-primary" aria-hidden="true" /> {tr('Tłumaczenie na żywo')}
    </h2>
  );

  const fromSchedule = scheduleByChannel(view.schedule, channels);
  const mod = view.module || null;
  const moduleLanguages = mod?.languages || [];
  const langMeta = (code) => moduleLanguages.find((l) => l.lang_code === code) || null;
  const unmapped = (mod?.unmapped || []).length > 0 && (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden="true" />
      {tr('Służby bez kodu języka (uzupełnij klucz pola, np. en): {names}', { names: mod.unmapped.join(', ') })}
    </p>
  );
  const orphanList = fromSchedule.orphans.length > 0 && (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">{tr('Z grafiku:')}</span>
      {fromSchedule.orphans.map((p, i) => (
        <span key={`o-${i}`} className="inline-flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">{p.label}:</span>
          <SchedulePerson p={p} />
        </span>
      ))}
    </div>
  );

  // Bez sesji — tylko zarządzający widzi zachętę.
  if (!session) {
    return (
      <section className={card}>
        {heading}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {tr('Tłumacz mówi do mikrofonu w aplikacji, a goście słuchają w słuchawkach na swoich telefonach — przez kod QR, bez konta. Języki i tłumacze pochodzą z modułu Tłumaczenia.')}
        </p>
        {mod && !moduleLanguages.length && <div className="mb-3"><NoLanguages /></div>}
        <Button icon={Languages} onClick={() => save({ enable: true })} loading={busy}>{tr('Włącz tłumaczenie na żywo')}</Button>
        {orphanList}
        {unmapped}
        {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </section>
    );
  }

  const status = STATUS[session.status] || STATUS.idle;
  const listeners = stats ? totalListeners(stats) : null;
  const toAdd = languagesToAdd(mod, channels);

  // Widok dla tłumacza / słuchacza (bez zarządzania).
  if (!canManage) {
    const myLabels = channels.filter((c) => mine.includes(c.id)).map(staffLabel);
    return (
      <section className={card}>
        {heading}
        {session.status === 'ended' ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">{tr('Tłumaczenie tego wydarzenia zostało zakończone.')}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {myLabels.length ? tr('Twoje kanały: {langs}', { langs: myLabels.join(', ') }) : tr('Dostępne języki: {langs}', { langs: channels.map((c) => c.label).join(', ') || '—' })}
            </p>
            <ReadOnlyChannels channels={channels} schedule={view.schedule} />
            <div className="flex flex-wrap gap-2">
              {myLabels.length > 0 && <LinkButton to={consolePath(eventId)} icon={Headphones}>{tr('Otwórz konsolę tłumacza')}</LinkButton>}
              {session.original_enabled && myLabels.length > 0 && <LinkButton to={originalPath(eventId)} icon={Radio} variant="outline">{tr('Nadawanie oryginału')}</LinkButton>}
              {channels.length > 0 && <LinkButton to={memberListenPath(eventId)} icon={Headphones} variant={myLabels.length ? 'ghost' : 'primary'}>{tr('Słuchaj tłumaczenia')}</LinkButton>}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={card}>
      {heading}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={status.tone}>{tr(status.label)}</span>
          {listeners != null && session.status !== 'ended' && (
            <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300"><Users size={14} aria-hidden="true" /> {trPlural(listeners, '{n} słuchacz', '{n} słuchaczy', '{n} słuchaczy')}</span>
          )}
        </div>

        {/* Kanały = Służby modułu Tłumaczenia */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{tr('Kanały')}</h3>
            {mod && moduleLanguages.length > 0 && <ModuleLink />}
          </div>
          {mod && !moduleLanguages.length && <div className="mb-2"><NoLanguages /></div>}
          {channels.length === 0 && moduleLanguages.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tr('Dodaj co najmniej jeden język i przypisz do niego tłumacza.')}</p>}
          {channels.length > 0 && (
            <ul className="space-y-2" aria-label={tr('Kanały językowe')}>
              {channels.map((c) => (
                <ChannelRow key={c.id} c={c} team={view.team} moduleLang={langMeta(c.lang_code)} moduleKnown={!!mod} stat={statOf(c.id)} canManage
                  onRemove={async () => {
                    if (!(await confirmDialog({ title: tr('Usunąć kanał {name}?', { name: staffLabel(c) }), message: tr('Słuchacze tego języka zostaną rozłączeni.'), confirmLabel: tr('Usuń'), danger: true }))) return;
                    saveChannels(removeChannel(channels, c.id));
                  }}
                  scheduled={fromSchedule.byLang.get(c.lang_code) || []}
                  onAddPerson={(p) => p?.email && saveChannels(addInterpreter(channels, c.id, p))}
                  onRemovePerson={(email) => saveChannels(removeInterpreter(channels, c.id, email))} />
              ))}
            </ul>
          )}
          {orphanList}
          {unmapped}
          {toAdd.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {toAdd.map((l) => (
                <button key={l.lang_code} type="button" disabled={busy || channels.length >= 8} onClick={() => saveChannels(addChannel(channels, l))}
                  title={tr('Słuchacze zobaczą: {label}', { label: l.label })}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                  <Plus size={12} aria-hidden="true" /> {l.role_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Oryginał */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={!!session.original_enabled} disabled={busy}
              onChange={(e) => save({ original_enabled: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">{tr('Kanał „Oryginał” dla tłumaczy')}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{tr('Komputer przy stole akustyka nadaje dźwięk z miksera, a tłumacze słyszą go czysto w słuchawkach. Słuchacze go nie widzą.')}</span>
            </span>
          </label>
          {session.original_enabled && (
            <div className="mt-2 ml-7 flex flex-wrap items-center gap-3 text-xs">
              <span className={stats?.original?.publishing ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}>
                {stats?.original?.publishing ? tr('Oryginał nadaje') : tr('Oryginał nie nadaje')}
              </span>
              <Link to={originalPath(eventId)} className="font-semibold text-gray-700 dark:text-gray-200 hover:underline">{tr('Otwórz nadawanie oryginału')}</Link>
            </div>
          )}
        </div>

        {/* Link, QR, plakat */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{tr('Link dla słuchaczy')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">{tr('Każdy z tym linkiem albo kodem QR może słuchać — bez konta. Wydrukuj plakat i postaw go przy wejściu.')}</p>
          <div className="flex flex-wrap gap-4 items-start">
            {/* eslint-disable-next-line react/no-danger */}
            <div className="w-28 h-28 shrink-0 rounded-xl bg-white p-1.5 border border-gray-200" aria-label={tr('Kod QR linku do tłumaczenia')} role="img" dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
            <div className="flex-1 min-w-[14rem] space-y-2">
              <div className="flex gap-2">
                <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={tr('Link dla słuchaczy')}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-200" />
                <Button size="sm" variant="outline" icon={copied ? Check : Copy} onClick={copy}>{copied ? tr('Skopiowano') : tr('Kopiuj')}</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={Printer} onClick={printPoster} disabled={!channels.length}>{tr('Drukuj plakat')}</Button>
                <Button size="sm" variant="ghost" icon={RefreshCw} onClick={regenerate} disabled={busy}>{tr('Nowy link')}</Button>
              </div>
            </div>
          </div>
        </div>

        {/* Konsola + koniec */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2">
          {channels.length > 0 && <LinkButton to={consolePath(eventId)} variant="outline" icon={Headphones}>{tr('Konsola tłumacza')}</LinkButton>}
          {session.status === 'ended'
            ? <Button size="sm" variant="outline" icon={Power} onClick={() => save({ reopen: true }, { okMsg: tr('Tłumaczenie wznowione') })} loading={busy}>{tr('Wznów tłumaczenie')}</Button>
            : <Button size="sm" variant="ghost" icon={Power} onClick={end} disabled={busy}>{tr('Zakończ tłumaczenie')}</Button>}
          <Button size="sm" variant="ghost" icon={Trash2} onClick={disable} disabled={busy} className="ml-auto">{tr('Wyłącz')}</Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Tłumaczenie kończy się samo 6 godzin po końcu wydarzenia. Nic nie jest nagrywane.')}</p>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {typeof document !== 'undefined' && createPortal(
        <div className="ip-print-root" aria-hidden="true">
          <Poster url={url} title={ev?.title || ''} when={when} church={view.church_name || ''} channels={channels} />
        </div>,
        document.body,
      )}
    </section>
  );
}
