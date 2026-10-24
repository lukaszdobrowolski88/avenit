import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Trash2, Plus, X, Clock, Hash, Info, RefreshCw, Copy, MousePointerClick } from 'lucide-react';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import Modal from '../../../components/Modal';
import { StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { TimeField } from '../../../components/pickers';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { supabase } from '../../../lib/supabase';
import { useCan } from '../../../components/Can';
import { socialApi } from '../lib/socialApi';
import { WEEKDAY_LABELS } from '@avenit/shared/src/lib/social.js';
import ChannelAvatar, { providerLabel, channelName, ProviderIcon } from './ChannelAvatar';

function Card({ icon: Icon, title, subtitle, actions, children }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60">
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        {Icon && <span data-tone={1} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0"><Icon size={17} aria-hidden="true" /></span>}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex gap-2">{actions}</div>}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

const ACCOUNT_STATUS = {
  active: { label: 'Połączony', color: STATUS_COLORS.success },
  error: { label: 'Problem', color: STATUS_COLORS.warning },
  revoked: { label: 'Połącz ponownie', color: STATUS_COLORS.danger },
};

function Accounts({ accounts, access, meta, onChanged }) {
  const connect = async () => {
    try {
      const { url } = await socialApi.connect();
      window.location.assign(url);
    } catch (e) { toast.error(e.message); }
  };
  const remove = async (a) => {
    if (!(await confirmDialog(tr('Odłączyć kanał „{name}”? Zaplanowane posty na ten kanał nie zostaną opublikowane.', { name: a.name })))) return;
    try {
      await socialApi.removeAccount(a.id);
      toast.success(tr('Kanał odłączony.'));
      onChanged();
    } catch (e) { toast.error(e.message); }
  };
  const anyRevoked = accounts.some((a) => a.status !== 'active');

  return (
    <Card icon={Link2} title={tr('Kanały')}
      subtitle={tr('Strony na Facebooku i konta firmowe na Instagramie, na których publikujesz.')}
      actions={access.manage && meta.configured && (
        <Button icon={accounts.length ? RefreshCw : Plus} onClick={connect} variant={accounts.length ? 'outline' : 'primary'}>
          {accounts.length ? (anyRevoked ? tr('Połącz ponownie') : tr('Dodaj / odśwież kanały')) : tr('Połącz Facebook i Instagram')}
        </Button>
      )}>
      {!meta.configured && (
        <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm flex gap-2">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{tr('Łączenie z Facebookiem nie jest jeszcze włączone na platformie Avenit (brak aplikacji Meta). Skontaktuj się z obsługą Avenit.')}</span>
        </div>
      )}
      {!accounts.length ? (
        <EmptyState compact icon={Link2} title={tr('Brak podłączonych kanałów')}
          subtitle={access.manage ? tr('Kliknij „Połącz Facebook i Instagram”, zaloguj się i wybierz strony kościoła.') : tr('Poproś administratora o podłączenie kanałów.')} />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {accounts.map((a) => {
            const st = ACCOUNT_STATUS[a.status] || ACCOUNT_STATUS.active;
            return (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <ChannelAvatar account={a} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                    {a.name}{a.provider === 'instagram' && a.username ? <span className="text-gray-500 font-normal"> · @{a.username}</span> : null}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {providerLabel(a.provider)}{a.connected_by ? ` · ${tr('połączył(a)')} ${a.connected_by}` : ''}
                  </p>
                  {a.last_error && a.status !== 'active' && <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{a.last_error}</p>}
                </div>
                <StatusPill color={st.color}>{tr(st.label)}</StatusPill>
                {access.manage && (
                  <button type="button" className="icon-btn" onClick={() => remove(a)} aria-label={tr('Odłącz kanał')} title={tr('Odłącz kanał')}><Trash2 size={15} /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <details className="mt-4 text-sm text-gray-600 dark:text-gray-300">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-800 dark:hover:text-gray-100">{tr('Wymagania i rozwiązywanie problemów')}</summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-5 text-gray-500 dark:text-gray-400">
          <li>{tr('Musisz mieć na stronie Facebooka rolę z prawem tworzenia treści (administrator albo redaktor).')}</li>
          <li>{tr('Instagram musi być kontem firmowym albo twórcy i być połączony ze stroną na Facebooku (w ustawieniach Instagrama → Konto → Udostępnianie).')}</li>
          <li>{tr('Przy logowaniu zaznacz wszystkie strony i konta, które mają się pojawić w Avenit, oraz wszystkie zgody.')}</li>
          <li>{tr('Gdy kanał pokazuje „Połącz ponownie”, ktoś zmienił hasło albo cofnął zgodę — kliknij „Połącz ponownie”.')}</li>
        </ul>
      </details>
    </Card>
  );
}

// Harmonogram kolejki: dla każdego dnia tygodnia lista godzin (czas polski), wspólny dla kanałów.
function QueueSlots({ canEdit, accounts }) {
  const [all, setAll] = useState(null);
  const [scope, setScope] = useState(null); // null = wspólny harmonogram, inaczej id kanału
  const [draft, setDraft] = useState(null);
  const [adding, setAdding] = useState({});

  useEffect(() => {
    socialApi.slots().then(setAll).catch(() => setAll([]));
  }, []);
  // Godziny bieżącego zakresu (wspólne albo własne kanału).
  const slots = useMemo(() => (all || []).filter((x) => (x.account_id || null) === scope), [all, scope]);
  const ownChannels = useMemo(() => new Set((all || []).filter((x) => x.account_id).map((x) => x.account_id)), [all]);
  const usesShared = scope !== null && !slots.length && draft === null;
  const pickScope = (v) => { setScope(v || null); setDraft(null); setAdding({}); };

  const byDay = useMemo(() => {
    const m = new Map();
    for (let d = 1; d <= 7; d += 1) m.set(d, []);
    for (const s of draft || slots || []) m.get(Number(s.weekday))?.push(s.time);
    for (const list of m.values()) list.sort();
    return m;
  }, [slots, draft]);

  if (all === null) return <Spinner />;
  const editing = draft !== null;
  const current = draft || slots;

  const add = (weekday) => {
    const t = adding[weekday];
    if (!t || !/^\d{2}:\d{2}$/.test(t)) return;
    if (current.some((s) => Number(s.weekday) === weekday && s.time === t)) return;
    setDraft([...current, { weekday, time: t }]);
    setAdding((a) => ({ ...a, [weekday]: '' }));
  };
  const removeSlot = (weekday, time) => setDraft(current.filter((s) => !(Number(s.weekday) === weekday && s.time === time)));
  const copyToAll = (weekday) => {
    const times = byDay.get(weekday) || [];
    const next = [];
    for (let d = 1; d <= 7; d += 1) for (const t of times) next.push({ weekday: d, time: t });
    setDraft(next);
  };
  const save = async () => {
    try {
      const saved = await socialApi.saveSlots(draft.map((s) => ({ weekday: Number(s.weekday), time: s.time })), scope);
      setAll(saved);
      setDraft(null);
      toast.success(tr('Harmonogram kolejki zapisany.'));
    } catch (e) { toast.error(e.message); }
  };

  return (
    <Card icon={Clock} title={tr('Harmonogram kolejki')}
      subtitle={tr('Godziny, o których publikują się posty dodane „do kolejki” — po jednym poście na godzinę w każdym kanale.')}
      actions={canEdit && editing && (
        <>
          <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>{tr('Anuluj')}</Button>
          <Button size="sm" onClick={save}>{tr('Zapisz')}</Button>
        </>
      )}>
      {accounts.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3" role="tablist" aria-label={tr('Harmonogram dla')}>
          {[{ id: null, label: tr('Wspólny dla kanałów') }, ...accounts.map((a) => ({ id: a.id, label: channelName(a), acc: a }))].map((o) => (
            <button key={o.id || 'all'} type="button" role="tab" aria-selected={scope === o.id} onClick={() => pickScope(o.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${scope === o.id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
              {o.acc && <ProviderIcon provider={o.acc.provider} size={12} />}{o.label}
              {o.acc && ownChannels.has(o.id) && <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" aria-label={tr('własne godziny')} />}
            </button>
          ))}
        </div>
      )}
      {usesShared ? (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 px-4 py-4 text-sm text-gray-600 dark:text-gray-300 space-y-3">
          <p>{tr('Ten kanał korzysta ze wspólnego harmonogramu. Ustaw własne godziny, jeśli ma publikować o innych porach (np. Instagram wieczorem).')}</p>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDraft((all || []).filter((x) => !x.account_id).map((x) => ({ weekday: x.weekday, time: x.time })))}>
              {tr('Ustaw własne godziny')}
            </Button>
          )}
        </div>
      ) : (
      <div className="space-y-1">
        {WEEKDAY_LABELS.map((label, i) => {
          const weekday = i + 1;
          const times = byDay.get(weekday) || [];
          return (
            <div key={weekday} className="flex items-center gap-3 py-1.5 flex-wrap">
              <span className="w-28 text-sm text-gray-700 dark:text-gray-200">{tr(label)}</span>
              <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                {times.length === 0 && <span className="text-xs text-gray-400">{tr('brak')}</span>}
                {times.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium tabular-nums text-gray-800 dark:text-gray-100">
                    {t}
                    {canEdit && <button type="button" onClick={() => removeSlot(weekday, t)} aria-label={tr('Usuń godzinę {t}', { t })} className="text-gray-400 hover:text-gray-800"><X size={12} /></button>}
                  </span>
                ))}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <TimeField value={adding[weekday] || ''} onChange={(e) => setAdding((a) => ({ ...a, [weekday]: e.target.value }))} compact className="w-24" aria-label={tr('Nowa godzina — {day}', { day: tr(label) })} />
                  <button type="button" className="icon-btn" onClick={() => add(weekday)} aria-label={tr('Dodaj godzinę')} title={tr('Dodaj godzinę')}><Plus size={15} /></button>
                  {times.length > 0
                    ? <button type="button" className="icon-btn" onClick={() => copyToAll(weekday)} aria-label={tr('Kopiuj na wszystkie dni')} title={tr('Kopiuj na wszystkie dni')}><Copy size={14} /></button>
                    : <span className="icon-btn invisible" aria-hidden="true"><Copy size={14} /></span>}
                </div>
              )}
            </div>
          );
        })}
        {canEdit && scope !== null && slots.length > 0 && draft === null && (
          <div className="pt-3">
            <Button size="sm" variant="ghost" onClick={async () => {
              try { setAll(await socialApi.saveSlots([], scope)); toast.success(tr('Kanał wrócił do wspólnego harmonogramu.')); } catch (e) { toast.error(e.message); }
            }}>{tr('Wróć do wspólnego harmonogramu')}</Button>
          </div>
        )}
      </div>
      )}
    </Card>
  );
}

function HashtagGroups() {
  // Zestawy to zwykły CRUD w /api/db — prawo z macierzy (Zestawy hashtagów: tworzenie).
  const canEdit = useCan('res:social_hashtag_groups:create');
  const [groups, setGroups] = useState(null);
  const [edit, setEdit] = useState(null); // { id?, name, hashtags }

  const load = () => supabase.from('social_hashtag_groups').select('*').order('name').then(({ data }) => setGroups(data || []));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const name = String(edit.name || '').trim();
    const hashtags = String(edit.hashtags || '').trim();
    if (!name || !hashtags) { toast.error(tr('Podaj nazwę i hashtagi.')); return; }
    const q = edit.id
      ? supabase.from('social_hashtag_groups').update({ name, hashtags, updated_at: new Date().toISOString() }).eq('id', edit.id)
      : supabase.from('social_hashtag_groups').insert({ name, hashtags });
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    setEdit(null);
    load();
  };
  const remove = async (g) => {
    if (!(await confirmDialog(tr('Usunąć zestaw „{name}”?', { name: g.name })))) return;
    const { error } = await supabase.from('social_hashtag_groups').delete().eq('id', g.id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <Card icon={Hash} title={tr('Zestawy hashtagów')} subtitle={tr('Gotowe zestawy do wstawiania jednym kliknięciem w kompozytorze.')}
      actions={canEdit && <Button size="sm" variant="outline" icon={Plus} onClick={() => setEdit({ name: '', hashtags: '' })}>{tr('Nowy zestaw')}</Button>}>
      {groups === null ? <Spinner /> : !groups.length ? (
        <p className="text-sm text-gray-500">{tr('Brak zestawów. Dodaj np. „Nabożeństwo”: #kościół #wrocław #niedziela')}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{g.name}</p>
                <p className="text-xs text-gray-500 truncate">{g.hashtags}</p>
              </div>
              {canEdit && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(g)}>{tr('Edytuj')}</Button>
                  <button type="button" className="icon-btn" onClick={() => remove(g)} aria-label={tr('Usuń zestaw')}><Trash2 size={15} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal isOpen={Boolean(edit)} onClose={() => setEdit(null)} size="md" icon={Hash} title={edit?.id ? tr('Edytuj zestaw') : tr('Nowy zestaw hashtagów')}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{tr('Anuluj')}</Button><Button onClick={save}>{tr('Zapisz')}</Button></>}>
        {edit && (
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Nazwa')}</span>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" autoFocus />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Hashtagi')}</span>
              <textarea value={edit.hashtags} onChange={(e) => setEdit({ ...edit, hashtags: e.target.value })} rows={3} placeholder="#kościół #wrocław #nabożeństwo"
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            </label>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// Krótkie linki z UTM przy publikacji na Facebooku (liczenie kliknięć per post i kanał).
function LinkSettings({ canEdit }) {
  const [s, setS] = useState(null);
  useEffect(() => { socialApi.settings().then(setS).catch(() => setS({ shorten_links: true, utm: true })); }, []);
  if (!s) return null;
  const save = async (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    try { setS(await socialApi.saveSettings(next)); } catch (e) { toast.error(e.message); }
  };
  return (
    <Card icon={MousePointerClick} title={tr('Linki w postach')} subtitle={tr('Adresy w postach na Facebooku zamieniamy na krótkie linki kościoła — widać, ile osób kliknęło.')}>
      <label className="flex items-start gap-3 py-1.5">
        <input type="checkbox" className="mt-0.5 rounded" checked={s.shorten_links} disabled={!canEdit} onChange={(e) => save({ shorten_links: e.target.checked })} />
        <span className="text-sm text-gray-800 dark:text-gray-100">{tr('Skracaj linki i licz kliknięcia')}</span>
      </label>
      <label className="flex items-start gap-3 py-1.5">
        <input type="checkbox" className="mt-0.5 rounded" checked={s.utm} disabled={!canEdit || !s.shorten_links} onChange={(e) => save({ utm: e.target.checked })} />
        <span>
          <span className="block text-sm text-gray-800 dark:text-gray-100">{tr('Dodawaj parametry UTM')}</span>
          <span className="block text-xs text-gray-500">{tr('utm_source=facebook, utm_medium=social — ruch z postów widać w Google Analytics strony docelowej.')}</span>
        </span>
      </label>
    </Card>
  );
}

export default function ChannelsTab({ accounts, access, meta, onChanged }) {
  return (
    <div className="grid xl:grid-cols-2 gap-5 items-start">
      <div className="space-y-5">
        <Accounts accounts={accounts} access={access} meta={meta} onChanged={onChanged} />
        <HashtagGroups />
        <LinkSettings canEdit={access.publish || access.manage} />
      </div>
      <QueueSlots canEdit={access.publish || access.manage} accounts={accounts} />
    </div>
  );
}
