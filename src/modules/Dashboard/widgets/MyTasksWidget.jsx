import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, CheckCircle, Check, Circle, Clock, Plus, Save, Trash2, Lock, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import CustomDatePicker from '../../../components/CustomDatePicker';
import { StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { boardColor } from '../../Boards/lib/palette';
import { useMyBoardTasks } from '../hooks/useMyBoardTasks';
import { compareTasks, isOverdueYmd, todayYmd } from '../utils/myBoardTasks';

// „Moje zadania”: elementy tablic, w których jestem w kolumnie „Osoby” (Projekty + zakładki
// „Zadania” modułów — te same, które widać w modułach), oraz zadania osobiste (user_tasks — także
// tworzone przez automatyzacje). Stare tabele *_tasks modułów nie są już źródłem: ich zadania
// przeniesiono do tablic (ModuleBoard / legacyImport), pokazywanie ich tu dublowałoby wpisy.
// Props (PersonalDashboard): tasks = zadania osobiste z useDashboardData (moje + przypisane mi),
// boardTasks = wynik useMyBoardTasks z Pulpitu (jedno źródło listy i licznika; bez niego widżet
// czyta tablice sam), onRefresh = odświeżenie listy zadań osobistych.

const LIMIT = 8;

// Statusy zadań osobistych (user_tasks) — w palecie aplikacji.
const PERSONAL_STATUS = {
  todo: { label: 'Do zrobienia', color: STATUS_COLORS.neutral, icon: Circle },
  in_progress: { label: 'W trakcie', color: STATUS_COLORS.warning, icon: Clock },
  done: { label: 'Gotowe', color: STATUS_COLORS.success, icon: CheckCircle },
};

const ymd = (v) => {
  const m = String(v || '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

// 'YYYY-MM-DD' jako data lokalna (bez przesunięcia strefy) → „9 paź”.
function formatDue(due) {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
}

// Pierwszy link do tej aplikacji w opisie (np. „Profil: https://…/members?member=12” z Opieki)
// → ścieżka do otwarcia w aplikacji albo null.
export function appLinkIn(text, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  const urls = String(text || '').match(/https?:\/\/[^\s)]+/g) || [];
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (origin && u.origin === origin) return `${u.pathname}${u.search}${u.hash}`;
    } catch { /* nie URL */ }
  }
  return null;
}

// ============================================
// OKNO ZADANIA OSOBISTEGO (user_tasks)
// ============================================

const emptyTask = () => ({ title: '', description: '', due_date: todayYmd(), status: 'todo', is_private: false });

function PersonalTaskModal({ isOpen, onClose, onSaved, initialTask, userEmail, onOpenLink }) {
  const [task, setTask] = useState(emptyTask);
  const [saving, setSaving] = useState(false);
  const isNew = !initialTask;
  // Usuwa tylko autor zadania (serwer: ownership.js) — przypisany może je edytować i odhaczyć.
  const isOwner = !initialTask?.user_email || String(initialTask.user_email).toLowerCase() === String(userEmail || '').toLowerCase();

  useEffect(() => {
    if (!isOpen) return;
    setTask(initialTask
      ? { ...initialTask, due_date: ymd(initialTask.due_date) || todayYmd(), description: initialTask.description || '', is_private: !!initialTask.is_private, status: initialTask.status || 'todo' }
      : emptyTask());
  }, [initialTask, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!task.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: task.title.trim(),
        description: task.description || null,
        due_date: task.due_date || null,
        status: task.status || 'todo',
        is_private: !!task.is_private,
      };
      const { error } = task.id
        ? await supabase.from('user_tasks').update(payload).eq('id', task.id)
        : await supabase.from('user_tasks').insert({ ...payload, user_email: userEmail });
      if (error) throw error;
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się zapisać') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task.id) return;
    if (!await confirmDialog(tr('Czy na pewno chcesz usunąć to zadanie?'))) return;
    const { error } = await supabase.from('user_tasks').delete().eq('id', task.id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć wpisu') }); return; }
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      icon={isNew ? Plus : CheckCircle}
      title={isNew ? tr('Nowe zadanie') : tr('Edytuj zadanie')}
      size="md"
      footer={<>
        {task.id && isOwner && <Button type="button" variant="danger" icon={Trash2} onClick={handleDelete} className="mr-auto">{tr('Usuń')}</Button>}
        <Button type="button" variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button type="submit" form="dashboard-task-form" icon={Save} loading={saving} disabled={!task.title.trim()}>{tr('Zapisz')}</Button>
      </>}
    >
      <div className="p-6">
        {appLinkIn(initialTask?.description) && (
          <Button type="button" variant="outline" size="sm" icon={ExternalLink} className="mb-4"
            onClick={() => { onClose(); onOpenLink?.(appLinkIn(initialTask.description)); }}>
            {tr('Otwórz powiązaną stronę')}
          </Button>
        )}
        {(initialTask?.assigned_by || initialTask?.assigned_for) && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {initialTask.assigned_by
              ? tr('Przypisane przez: {name}', { name: initialTask.assigned_by })
              : tr('Przypisane do: {name}', { name: initialTask.assigned_for })}
          </p>
        )}
        <form id="dashboard-task-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dashboard-task-title" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tytuł')}</label>
            <input
              id="dashboard-task-title"
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 outline-none"
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
              placeholder={tr('Co jest do zrobienia?')}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Termin')}</label>
            <CustomDatePicker value={task.due_date} onChange={(v) => setTask({ ...task, due_date: v })} />
          </div>

          <div>
            <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Status')}</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tr('Status')}>
              {Object.entries(PERSONAL_STATUS).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const active = task.status === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTask({ ...task, status: key })}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {tr(cfg.label)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="dashboard-task-desc" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis')}</label>
            <textarea
              id="dashboard-task-desc"
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white text-sm h-24 resize-none focus:ring-2 focus:ring-accent-primary-light/20 outline-none"
              value={task.description || ''}
              onChange={(e) => setTask({ ...task, description: e.target.value })}
              placeholder={tr('Szczegóły zadania...')}
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={!!task.is_private}
            onClick={() => setTask({ ...task, is_private: !task.is_private })}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-accent-primary-light dark:hover:border-accent-primary transition text-left"
          >
            <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
              task.is_private ? 'bg-accent-primary border-accent-primary' : 'border-gray-300 dark:border-gray-600'
            }`}>
              {task.is_private && <Lock size={12} className="text-white" aria-hidden="true" />}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Prywatne')}</span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">{tr('Tylko Ty widzisz to zadanie')}</span>
            </span>
          </button>
        </form>
      </div>
    </Modal>
  );
}

// ============================================
// WIDŻET
// ============================================

export default function MyTasksWidget({ tasks, boardTasks: shared = null, userEmail, userName, onRefresh }) {
  const navigate = useNavigate();
  // Dostęp do tablic (Projekty / tablice służb) rozstrzyga serwer — 403 to po prostu brak zadań.
  // Pulpit podaje wynik swojego useMyBoardTasks (jedno źródło z licznikiem); samodzielnie — własny.
  const own = useMyBoardTasks(userEmail, { userName, enabled: !shared });
  const { tasks: boardTasks, loading, error, reload, markDone } = shared || own;
  const [modal, setModal] = useState({ isOpen: false, task: null });
  const [expanded, setExpanded] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set()); // zadania w trakcie odhaczania

  const personal = (tasks || [])
    .filter((t) => t?.source === 'personal')
    .map((t) => {
      const st = PERSONAL_STATUS[t.status] || PERSONAL_STATUS.todo;
      return {
        kind: 'personal', id: t.id, name: String(t.title || '').trim(), due: ymd(t.due_date),
        done: t.status === 'done', status: { title: tr(st.label), color: st.color },
        sourceLabel: t.assigned_by
          ? tr('Od: {name}', { name: t.assigned_by })
          : t.assigned_for ? tr('Dla: {name}', { name: t.assigned_for }) : tr('Osobiste'),
        isPrivate: !!t.is_private, raw: t,
      };
    });
  const board = boardTasks.map((t) => ({
    ...t, kind: 'board', sourceLabel: t.boardName || tr('Tablica'),
    status: t.status ? { title: t.status.title, color: boardColor(t.status.color) } : null,
  }));
  const all = [...board, ...personal].sort(compareTasks);
  const open = all.filter((t) => !t.done);
  const doneCount = all.length - open.length;
  const visible = expanded ? open : open.slice(0, LIMIT);
  const today = todayYmd();

  // Element tablicy otwiera się w swoim module / w Projektach; zadanie osobiste — w oknie.
  const openTask = (task) => {
    if (task.kind === 'board') navigate(task.link);
    else setModal({ isOpen: true, task: task.raw });
  };

  // Szybkie odhaczenie: osobiste zawsze; z tablicy — tylko gdy kolumna statusu ma etykietę „gotowe”.
  const canComplete = (task) => (task.kind === 'personal' ? true : !!(task.statusColId && task.doneLabelId));

  const complete = async (task) => {
    const key = `${task.kind}:${task.id}`;
    if (pendingIds.has(key)) return;
    setPendingIds((prev) => new Set(prev).add(key));
    try {
      if (task.kind === 'board') {
        await markDone(task);
      } else {
        const { error: e } = await supabase.from('user_tasks').update({ status: 'done' }).eq('id', task.id);
        if (e) throw e;
        await onRefresh?.();
      }
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się zapisać') });
    } finally {
      setPendingIds((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const modalEl = (
    <PersonalTaskModal
      isOpen={modal.isOpen}
      onClose={() => setModal({ isOpen: false, task: null })}
      onSaved={onRefresh}
      initialTask={modal.task}
      userEmail={userEmail}
      onOpenLink={(path) => navigate(path)}
    />
  );

  const header = (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-gray-500 dark:text-gray-400">{tr('{n} do zrobienia', { n: open.length })}</p>
      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setModal({ isOpen: true, task: null })}>{tr('Dodaj')}</Button>
    </div>
  );

  const errorRow = error ? (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
      <span className="flex items-center gap-1.5 min-w-0">
        <AlertTriangle size={14} className="shrink-0" style={{ color: STATUS_COLORS.danger }} aria-hidden="true" />
        <span className="truncate">{tr('Nie udało się wczytać zadań z tablic')}</span>
      </span>
      <button type="button" onClick={reload} className="shrink-0 font-medium text-accent-primary hover:underline">{tr('Spróbuj ponownie')}</button>
    </div>
  ) : null;

  if (loading && !personal.length) return <Spinner center />;

  if (!open.length) {
    return (
      <div className="space-y-3">
        {header}
        {errorRow}
        {!error && <EmptyState compact icon={CheckSquare} title={tr('Brak zadań')} subtitle={tr('Nie masz przypisanych zadań')} />}
        {doneCount > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">{tr('{n} ukończonych zadań', { n: doneCount })}</p>
        )}
        {modalEl}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      {errorRow}

      <ul className="space-y-0.5 -mx-2">
        {visible.map((task) => {
          const overdue = isOverdueYmd(task.due, today);
          const busy = pendingIds.has(`${task.kind}:${task.id}`);
          const name = task.name || tr('Bez nazwy');
          return (
            <li key={`${task.kind}:${task.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
              {canComplete(task) ? (
                <button
                  type="button"
                  onClick={() => complete(task)}
                  disabled={busy}
                  aria-label={`${tr('Oznacz jako gotowe')}: ${name}`}
                  title={tr('Oznacz jako gotowe')}
                  className="shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center text-transparent hover:text-white hover:bg-[color:var(--done)] hover:border-[color:var(--done)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 transition-colors disabled:opacity-60"
                  style={{ '--done': STATUS_COLORS.success }}
                >
                  {busy ? <Spinner size={12} /> : <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </button>
              ) : (
                <span className="shrink-0 w-5 h-5 rounded-full border-2 border-dashed border-gray-200 dark:border-gray-700" aria-hidden="true" />
              )}

              <button type="button" onClick={() => openTask(task)} className="flex-1 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{name}</span>
                  {task.isPrivate && <Lock size={12} className="shrink-0 text-gray-400" aria-label={tr('Prywatne')} />}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                  <span className="truncate">{task.sourceLabel}</span>
                  {task.due && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`shrink-0 whitespace-nowrap ${overdue ? 'font-semibold' : ''}`}
                        style={overdue ? { color: STATUS_COLORS.danger } : undefined}
                      >
                        {overdue ? `${tr('Zaległe')} · ` : ''}{formatDue(task.due)}
                      </span>
                    </>
                  )}
                </span>
              </button>

              {task.status && (
                <StatusPill color={task.status.color} className="shrink-0 max-w-[40%] overflow-hidden">
                  <span className="truncate">{task.status.title}</span>
                </StatusPill>
              )}
            </li>
          );
        })}
      </ul>

      {open.length > LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100"
        >
          {expanded ? tr('Zwiń') : `+ ${tr('{n} więcej zadań', { n: open.length - LIMIT })}`}
        </button>
      )}

      {doneCount > 0 && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">{tr('{n} ukończonych zadań', { n: doneCount })}</p>
      )}

      {modalEl}
    </div>
  );
}
