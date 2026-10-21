import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Languages, Copy, Check, Printer, RefreshCw, X, Plus, Headphones, Radio, Users, Trash2, Power,
} from 'lucide-react';
import Button from '../../components/Button';
import MemberPicker from '../Giving/components/MemberPicker';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/dialog';
import { tr, trPlural, appLocale } from '../../i18n';
import { callFn } from '../Komunikator/calls/callApi';
import {
  STATS_POLL_MS, channelsPayload, addChannel, removeChannel, updateChannel, addInterpreter, removeInterpreter,
  remainingPresets, isLangCode, consolePath, originalPath, memberListenPath, totalListeners,
} from '../Interpretation/interpretationLogic';
import { qrSvg } from '../Interpretation/qr';
import '../Interpretation/interpretation.css';

// Karta „Tłumaczenie na żywo” na stronie wydarzenia (src/interpretation na serwerze):
//   • zarządzający (action:calendar:manage_interpretation / admin): włączenie, języki, tłumacze,
//     „Oryginał”, link + QR + plakat A4 do druku, stan kanałów i licznik słuchaczy, zakończenie;
//   • tłumacz: wejście do konsoli; • pozostali widzący wydarzenie: „Słuchaj” (w aplikacji).
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

function ChannelRow({ c, people, stat, canManage, onRename, onRemove, onAddPerson, onRemovePerson }) {
  const [label, setLabel] = useState(c.label);
  useEffect(() => { setLabel(c.label); }, [c.label]);
  const [adding, setAdding] = useState(false);
  const live = (stat?.status || c.status) === 'live';
  const activeName = stat?.active_interpreter_name || c.active_interpreter_name;
  const candidates = useMemo(() => (people || [])
    .filter((p) => !(c.interpreters || []).some((i) => i.email === p.email))
    .map((p) => ({ id: p.email, first_name: p.name, email: p.email })), [people, c.interpreters]);
  return (
    <li className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label.trim() && label !== c.label) onRename(label.trim()); else setLabel(c.label); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} maxLength={40} aria-label={tr('Nazwa języka')}
            className="flex-1 min-w-[8rem] bg-transparent text-sm font-semibold text-gray-900 dark:text-white border-0 border-b border-transparent hover:border-gray-300 focus:border-gray-500 focus:outline-none px-0 py-0.5" />
        ) : <span className="flex-1 min-w-[8rem] text-sm font-semibold text-gray-900 dark:text-white">{c.label}</span>}
        <span className="text-xs font-mono text-gray-400">{c.lang_code}</span>
        <span className={`inline-flex items-center gap-1.5 text-xs ${live ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
          <span className={`w-2 h-2 rounded-full ${live ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'}`} aria-hidden="true" />
          {live ? (activeName ? tr('Na żywo: {name}', { name: activeName }) : tr('Na żywo')) : tr('Nie nadaje')}
        </span>
        {stat && stat.listeners != null && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Users size={12} aria-hidden="true" /> {stat.listeners}</span>
        )}
        {canManage && (
          <button type="button" onClick={onRemove} aria-label={tr('Usuń język: {name}', { name: c.label })} title={tr('Usuń język')}
            className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-200/60 dark:hover:bg-gray-700">
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">{tr('Tłumacze:')}</span>
        {(c.interpreters || []).length === 0 && <span className="text-xs text-gray-400">{tr('nikt jeszcze')}</span>}
        {(c.interpreters || []).map((i) => (
          <span key={i.email} className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 pl-2.5 pr-1 py-0.5 text-xs text-gray-800 dark:text-gray-100">
            {i.name || i.email}
            {canManage && (
              <button type="button" onClick={() => onRemovePerson(i.email)} aria-label={tr('Usuń tłumacza: {name}', { name: i.name || i.email })}
                className="p-0.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={12} aria-hidden="true" /></button>
            )}
          </span>
        ))}
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700">
            <Plus size={12} aria-hidden="true" /> {tr('Dodaj tłumacza')}
          </button>
        )}
      </div>
      {canManage && adding && (
        <div className="mt-2 max-w-md">
          <MemberPicker label={tr('Tłumacz (konto w aplikacji)')} value="" members={candidates} emptyLabel={tr('— anuluj —')}
            onChange={(email) => { setAdding(false); if (email) onAddPerson(people.find((p) => p.email === email)); }} />
        </div>
      )}
    </li>
  );
}

export default function InterpretationCard({ ev }) {
  const eventId = ev?.id;
  const [view, setView] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [custom, setCustom] = useState({ code: '', label: '' });
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState('');
  const copyTimer = useRef(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    try { setView(await callFn('interp-session-get', { event_id: String(eventId) })); } catch { setView((v) => v || { failed: true }); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

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
  const addCustom = () => {
    const code = custom.code.trim().toLowerCase().replace(/_/g, '-');
    if (!isLangCode(code)) { setError(tr('Podaj kod języka, np. fr, pt-br.')); return; }
    if (channels.some((c) => c.lang_code === code)) { setError(tr('Ten język jest już na liście.')); return; }
    setCustom({ code: '', label: '' });
    setCustomOpen(false);
    saveChannels(addChannel(channels, { lang_code: code, label: custom.label }));
  };

  const card = 'bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5';
  const heading = (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
      <Languages size={16} className="text-accent-primary" aria-hidden="true" /> {tr('Tłumaczenie na żywo')}
    </h2>
  );

  // Bez sesji — tylko zarządzający widzi zachętę.
  if (!session) {
    return (
      <section className={card}>
        {heading}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {tr('Tłumacz mówi do mikrofonu w aplikacji, a goście słuchają w słuchawkach na swoich telefonach — przez kod QR, bez konta. Możesz dodać kilka języków naraz.')}
        </p>
        <Button icon={Languages} onClick={() => save({ enable: true })} loading={busy}>{tr('Włącz tłumaczenie na żywo')}</Button>
        {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </section>
    );
  }

  const status = STATUS[session.status] || STATUS.idle;
  const listeners = stats ? totalListeners(stats) : null;
  const presets = remainingPresets(view.presets, channels);

  // Widok dla tłumacza / słuchacza (bez zarządzania).
  if (!canManage) {
    const myLabels = channels.filter((c) => mine.includes(c.id)).map((c) => c.label);
    return (
      <section className={card}>
        {heading}
        {session.status === 'ended' ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">{tr('Tłumaczenie tego wydarzenia zostało zakończone.')}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {myLabels.length ? tr('Tłumaczysz: {langs}', { langs: myLabels.join(', ') }) : tr('Dostępne języki: {langs}', { langs: channels.map((c) => c.label).join(', ') || '—' })}
            </p>
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

        {/* Języki i tłumacze */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{tr('Języki')}</h3>
          {channels.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tr('Dodaj co najmniej jeden język i przypisz do niego tłumacza.')}</p>}
          {channels.length > 0 && (
            <ul className="space-y-2" aria-label={tr('Kanały językowe')}>
              {channels.map((c) => (
                <ChannelRow key={c.id} c={c} people={view.people} stat={statOf(c.id)} canManage
                  onRename={(label) => saveChannels(updateChannel(channels, c.id, { label }))}
                  onRemove={async () => {
                    if (!(await confirmDialog({ title: tr('Usunąć język {name}?', { name: c.label }), message: tr('Słuchacze tego języka zostaną rozłączeni.'), confirmLabel: tr('Usuń'), danger: true }))) return;
                    saveChannels(removeChannel(channels, c.id));
                  }}
                  onAddPerson={(p) => p && saveChannels(addInterpreter(channels, c.id, p))}
                  onRemovePerson={(email) => saveChannels(removeInterpreter(channels, c.id, email))} />
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button key={p.lang_code} type="button" disabled={busy} onClick={() => saveChannels(addChannel(channels, p))} lang={p.lang_code}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                <Plus size={12} aria-hidden="true" /> {p.label}
              </button>
            ))}
            {!customOpen && (
              <button type="button" onClick={() => setCustomOpen(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Plus size={12} aria-hidden="true" /> {tr('Inny język')}
              </button>
            )}
          </div>
          {customOpen && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="ic-code" className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Kod')}</label>
                <input id="ic-code" value={custom.code} onChange={(e) => setCustom({ ...custom, code: e.target.value })} placeholder="fr" maxLength={12}
                  className="w-24 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <label htmlFor="ic-label" className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Nazwa (w tym języku)')}</label>
                <input id="ic-label" value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} placeholder="Français" maxLength={40}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              </div>
              <Button size="sm" onClick={addCustom} disabled={busy}>{tr('Dodaj')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>{tr('Anuluj')}</Button>
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
