// Zakładka „Zadania” na stronie wydarzenia: elementy tablic przypięte do wydarzenia
// (board_items.event_id), które widzę — status, osoby, termin; klik → zadanie w jego miejscu
// (taskItemLink). „Dodaj zadanie” tworzy element na tablicy zadań modułu wydarzenia (ogólne →
// Kalendarz) z terminem = data wydarzenia; „Dodaj z szablonu” tworzy wszystkie pozycje szablonu
// tej tablicy (boards.settings.event_task_templates). Szablony edytuje, kto może zmieniać tablicę.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Plus, ListPlus, Settings2, Trash2, Save, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase, getCachedUser } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { tr, appLocale } from '../../i18n';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Avatar from '../../components/Avatar';
import CustomSelect from '../../components/CustomSelect';
import CustomDatePicker from '../../components/CustomDatePicker';
import { StatusPill, STATUS_COLORS } from '../../components/ui/DataTable';
import { useCan } from '../../components/Can';
import { useAppModules } from '../../hooks/useAppModules';
import { boardColor } from '../Boards/lib/palette';
import { boardTaskRows, isOverdueYmd } from '../Dashboard/utils/myBoardTasks';
import {
  loadEventTasks, resolveEventTaskBoard, createEventTasks, saveEventTaskTemplates,
  templatesOf, templateRows, eventTasksModule,
} from './eventTasks';

const ymd = (v) => { const m = /^\d{4}-\d{2}-\d{2}/.exec(String(v || '')); return m ? m[0] : null; };
function formatDue(due) {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
}
const LABEL = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1';
const INPUT = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-gray-300/60 dark:focus:ring-gray-600/60';

// Osoby do wyboru (jak picker „Osoby” w tablicy: aktywne konta).
function usePeople() {
  const [people, setPeople] = useState([]);
  useEffect(() => {
    let alive = true;
    supabase.from('app_users').select('email, full_name, name, avatar_url').eq('is_active', true).order('full_name')
      .then(({ data }) => {
        if (!alive) return;
        setPeople((data || []).filter((u) => u.email).map((u) => ({ email: u.email, name: u.full_name || u.name || u.email, avatar_url: u.avatar_url || null })));
      }, () => {});
    return () => { alive = false; };
  }, []);
  return people;
}

const personOptions = (people) => [{ value: '', label: tr('Bez osoby') }, ...people.map((p) => ({ value: p.email, label: p.name }))];
const personByEmail = (people, email) => {
  const p = people.find((x) => x.email === email);
  return p ? { email: p.email, name: p.name, ...(p.avatar_url ? { avatar_url: p.avatar_url } : {}) } : null;
};

function AddTaskModal({ isOpen, onClose, onSave, defaultDue, people }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState(defaultDue || '');
  const [person, setPerson] = useState('');
  useEffect(() => { if (isOpen) { setName(''); setDue(defaultDue || ''); setPerson(''); } }, [isOpen, defaultDue]);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) return;
    const ok = await onSave({ name: name.trim(), due: due || null, people: person ? [personByEmail(people, person)].filter(Boolean) : [] });
    if (ok) onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} icon={Plus} title={tr('Nowe zadanie')} size="md" closeOnBackdrop={false}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button type="submit" form="event-task-form" icon={Save} disabled={!name.trim()}>{tr('Dodaj zadanie')}</Button>
      </>}>
      <form id="event-task-form" onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label htmlFor="event-task-name" className={LABEL}>{tr('Nazwa')}</label>
          <input id="event-task-name" autoFocus className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Co jest do zrobienia?')} />
        </div>
        <div>
          <span className={LABEL}>{tr('Termin')}</span>
          <CustomDatePicker value={due} onChange={(v) => setDue(v || '')} aria-label={tr('Termin')} />
        </div>
        <CustomSelect label={tr('Osoba')} value={person} onChange={(v) => setPerson(v || '')} options={personOptions(people)} />
      </form>
    </Modal>
  );
}

function TemplatesModal({ isOpen, onClose, templates, onSave, people }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (isOpen) setRows(templates.map((t) => ({ name: t.name, offset_days: String(t.offset_days), person: t.people?.[0]?.email || '' })));
  }, [isOpen, templates]);
  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = async () => {
    const list = rows.map((r) => ({
      name: r.name, offset_days: Number(r.offset_days) || 0,
      people: r.person ? [personByEmail(people, r.person)].filter(Boolean) : [],
    }));
    const ok = await onSave(list);
    if (ok) onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} icon={Settings2} title={tr('Szablon zadań wydarzenia')} size="lg" closeOnBackdrop={false}
      subtitle={tr('„Dodaj z szablonu” tworzy te zadania z terminem liczonym od daty wydarzenia.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Save} onClick={save}>{tr('Zapisz')}</Button>
      </>}>
      <div className="p-6 space-y-3">
        {rows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Szablon jest pusty. Dodaj pierwsze zadanie.')}</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_12rem_auto] gap-2 items-end">
            <div>
              <label htmlFor={`tpl-name-${i}`} className={LABEL}>{tr('Zadanie')}</label>
              <input id={`tpl-name-${i}`} className={INPUT} value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder={tr('np. Przygotować nagłośnienie')} />
            </div>
            <div>
              <label htmlFor={`tpl-off-${i}`} className={LABEL}>{tr('Dni')}</label>
              <input id={`tpl-off-${i}`} type="number" inputMode="numeric" className={INPUT} value={r.offset_days}
                onChange={(e) => set(i, { offset_days: e.target.value })} title={tr('Dni względem wydarzenia (ujemne = przed)')} />
            </div>
            <CustomSelect label={tr('Osoba')} value={r.person} onChange={(v) => set(i, { person: v || '' })} options={personOptions(people)} />
            <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
              className="mb-1 p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label={tr('Usuń pozycję')} title={tr('Usuń pozycję')}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <p className="text-xs text-gray-400 dark:text-gray-500">{tr('Dni względem wydarzenia: 0 = w dniu wydarzenia, -3 = trzy dni przed.')}</p>
        <Button variant="outline" size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, { name: '', offset_days: '0', person: '' }])}>{tr('Dodaj pozycję')}</Button>
      </div>
    </Modal>
  );
}

export default function EventTasksTab({ event }) {
  const navigate = useNavigate();
  const { modules } = useAppModules();
  const people = usePeople();
  const [data, setData] = useState(null); // { boards, columns, items, forbidden }
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(undefined); // undefined = wczytywanie, null = brak tablicy (jeszcze)
  const [modal, setModal] = useState(null); // 'add' | 'templates'
  const [busy, setBusy] = useState(false);
  const eventDate = ymd(event?.date);
  const moduleKey = eventTasksModule(event?.module_key);
  const moduleLabel = (modules || []).find((m) => m.key === event?.module_key)?.label || null;

  // Uprawnienia jak na tablicy: globalnie albo w zakresie służby (lider Mediów → tablica Mediów).
  const scope = target?.board ? { board: target.board } : { module: moduleKey };
  const canCreate = useCan('res:board_items:create', scope);
  const canEditTemplates = useCan('res:boards:update', scope);

  const load = useCallback(async () => {
    if (!event?.id) return;
    setError(null);
    try {
      setData(await loadEventTasks(event.id));
    } catch (e) {
      setError(e);
    }
  }, [event?.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    resolveEventTaskBoard(event?.module_key).then((t) => { if (alive) setTarget(t || null); }, () => { if (alive) setTarget(null); });
    return () => { alive = false; };
  }, [event?.module_key]);

  const rows = useMemo(() => (data ? boardTaskRows({ ...data, modules }) : []), [data, modules]);
  const templates = useMemo(() => templatesOf(target?.board), [target]);
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  // Tablica docelowa — przy pierwszym zadaniu serwer ją tworzy (jak zakładka „Zadania” modułu).
  const ensureTarget = async () => {
    if (target?.board) return target;
    const title = moduleLabel ? tr('Zadania — {name}', { name: moduleLabel }) : tr('Zadania');
    const t = await resolveEventTaskBoard(event?.module_key, { create: true, title });
    setTarget(t || null);
    return t;
  };

  const create = async (list) => {
    setBusy(true);
    try {
      const t = await ensureTarget();
      if (!t) throw new Error(tr('Nie udało się otworzyć tablicy zadań.'));
      const me = await getCachedUser().catch(() => null);
      const mine = me?.email ? people.find((p) => p.email.toLowerCase() === String(me.email).toLowerCase()) : null;
      const { items, error: e } = await createEventTasks(t, event.id, list, { userEmail: me?.email || null, userName: mine?.name || null });
      if (e) throw e;
      toast.success(items.length > 1 ? tr('Dodano zadania: {n}', { n: items.length }) : tr('Dodano zadanie'));
      await load();
      return true;
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się dodać zadania.') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addFromTemplate = () => create(templateRows(templates, eventDate));

  const saveTemplates = async (list) => {
    const t = await ensureTarget().catch(() => null);
    if (!t?.board) { toast.error(tr('Nie udało się otworzyć tablicy zadań.')); return false; }
    const { error: e, settings } = await saveEventTaskTemplates(t.board.id, list);
    if (e) { toast.error(e, { fallback: tr('Nie udało się zapisać szablonu.') }); return false; }
    setTarget((cur) => (cur ? { ...cur, board: { ...cur.board, settings } } : cur));
    toast.success(tr('Zapisano szablon'));
    return true;
  };

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {canEditTemplates && (
        <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setModal('templates')}>{tr('Szablon')}</Button>
      )}
      {canCreate && templates.length > 0 && (
        <Button size="sm" variant="outline" icon={ListPlus} onClick={addFromTemplate} loading={busy}
          title={tr('Utwórz {n} zadań z szablonu', { n: templates.length })}>
          {tr('Dodaj z szablonu')}
        </Button>
      )}
      {canCreate && <Button size="sm" icon={Plus} onClick={() => setModal('add')}>{tr('Dodaj zadanie')}</Button>}
    </div>
  );

  let body;
  if (error) {
    body = (
      <EmptyState compact icon={AlertTriangle} title={tr('Nie udało się wczytać zadań')}
        action={<Button variant="outline" size="sm" icon={RefreshCw} onClick={load}>{tr('Spróbuj ponownie')}</Button>} />
    );
  } else if (!data) {
    body = <Spinner center />;
  } else if (!rows.length) {
    body = (
      <EmptyState compact icon={CheckSquare} title={tr('Brak zadań przy tym wydarzeniu')}
        subtitle={canCreate ? tr('Dodaj zadanie albo utwórz je z szablonu — termin liczy się od daty wydarzenia.') : null} />
    );
  } else {
    body = (
      <ul className="-mx-2 space-y-0.5">
        {rows.map((r) => {
          const overdue = !r.done && isOverdueYmd(r.due, today);
          return (
            <li key={r.id}>
              <button type="button" onClick={() => navigate(r.link)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600">
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium truncate ${r.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
                    {r.name || tr('Bez nazwy')}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                    <span className="truncate">{r.boardName}</span>
                    {r.due && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={`shrink-0 ${overdue ? 'font-semibold' : ''}`} style={overdue ? { color: STATUS_COLORS.danger } : undefined}>
                          {overdue ? `${tr('Zaległe')} · ` : ''}{formatDue(r.due)}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                {r.people.length > 0 && (
                  <span className="flex -space-x-1.5 shrink-0" aria-label={r.people.map((p) => p.name || p.email).join(', ')}>
                    {r.people.slice(0, 3).map((p) => (
                      <Avatar key={p.email} name={p.name} email={p.email} url={p.avatar_url} size={22} className="ring-2 ring-white dark:ring-gray-900" />
                    ))}
                    {r.people.length > 3 && <span className="text-[11px] text-gray-500 pl-2.5">+{r.people.length - 3}</span>}
                  </span>
                )}
                {r.status && (
                  <StatusPill color={boardColor(r.status.color)} className="shrink-0 max-w-[35%] overflow-hidden">
                    <span className="truncate">{r.status.title}</span>
                  </StatusPill>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <CheckSquare size={16} className="text-accent-primary" aria-hidden="true" /> {tr('Zadania')}
        </h2>
        {actions}
      </div>
      {!eventDate && canCreate && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Wydarzenie nie ma daty — zadania z szablonu powstaną bez terminu.')}</p>
      )}
      {body}

      <AddTaskModal isOpen={modal === 'add'} onClose={() => setModal(null)} onSave={(row) => create([row])} defaultDue={eventDate} people={people} />
      <TemplatesModal isOpen={modal === 'templates'} onClose={() => setModal(null)} templates={templates} onSave={saveTemplates} people={people} />
    </section>
  );
}
