// Zakładka „Zadania” w kartotece osoby (Opieka): zadania z tablic, w których osoba jest w kolumnie
// „Osoby” (Projekty, zakładki „Zadania” modułów, Kalendarz), oraz zadania osobiste (user_tasks)
// przypisane jej kontu. Konto osoby = e-mail z kartoteki + konta powiązane (app_users.member_id).
// Co widać, rozstrzyga serwer: tablice, do których mam dostęp, i tylko te zadania osobiste, które
// sam zleciłem (user_tasks to dane prywatne — ownership.js).
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, AlertTriangle, RefreshCw, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import Button from '../../../components/Button';
import { StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { boardColor } from '../../Boards/lib/palette';
import { useAssignedBoardTasks } from '../../Dashboard/hooks/useMyBoardTasks';
import { compareTasks, isOverdueYmd, todayYmd } from '../../Dashboard/utils/myBoardTasks';

const PERSONAL_STATUS = {
  todo: { label: 'Do zrobienia', color: STATUS_COLORS.neutral },
  in_progress: { label: 'W trakcie', color: STATUS_COLORS.warning },
  done: { label: 'Gotowe', color: STATUS_COLORS.success },
};
const ymd = (v) => { const m = /^\d{4}-\d{2}-\d{2}/.exec(String(v || '')); return m ? m[0] : null; };
function formatDue(due) {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
}

// E-maile kont osoby: z kartoteki + app_users.member_id (kolumna bywa nieobecna — wtedy sam e-mail).
export function useMemberAccountEmails(member) {
  const [emails, setEmails] = useState(() => (member?.email ? [member.email] : []));
  useEffect(() => {
    let alive = true;
    const base = member?.email ? [member.email] : [];
    setEmails(base);
    if (!member?.id) return undefined;
    supabase.from('app_users').select('email').eq('member_id', member.id).then(({ data }) => {
      if (!alive) return;
      const all = [...base, ...(data || []).map((u) => u.email).filter(Boolean)];
      setEmails([...new Map(all.map((e) => [String(e).toLowerCase(), e])).values()]);
    }, () => {});
    return () => { alive = false; };
  }, [member?.id, member?.email]);
  return emails;
}

export default function PersonTasksTab({ member }) {
  const navigate = useNavigate();
  const emails = useMemberAccountEmails(member);
  const board = useAssignedBoardTasks(emails, { enabled: emails.length > 0 });
  const [personal, setPersonal] = useState(null);
  const [personalError, setPersonalError] = useState(null);
  const key = emails.map((e) => e.toLowerCase()).sort().join(',');

  useEffect(() => {
    let alive = true;
    if (!key) { setPersonal([]); return undefined; }
    setPersonal(null);
    setPersonalError(null);
    const or = key.split(',').map((e) => `assigned_to_email.ilike.${e}`).join(',');
    supabase.from('user_tasks').select('*').or(or).order('due_date', { ascending: true }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setPersonalError(error); setPersonal([]); return; }
      setPersonal(data || []);
    }, (e) => { if (alive) { setPersonalError(e); setPersonal([]); } });
    return () => { alive = false; };
  }, [key]);

  const rows = useMemo(() => {
    const fromBoards = board.tasks.map((t) => ({
      ...t, kind: 'board', sourceLabel: t.boardName || tr('Tablica'),
      status: t.status ? { title: t.status.title, color: boardColor(t.status.color) } : null,
    }));
    const own = (personal || []).map((t) => {
      const st = PERSONAL_STATUS[t.status] || PERSONAL_STATUS.todo;
      return {
        kind: 'personal', id: t.id, name: String(t.title || '').trim(), due: ymd(t.due_date),
        done: t.status === 'done', status: { title: tr(st.label), color: st.color },
        sourceLabel: tr('Zlecone przez Ciebie'), isPrivate: !!t.is_private,
      };
    });
    return [...fromBoards, ...own].sort(compareTasks);
  }, [board.tasks, personal]);

  if (!member?.email && emails.length === 0) {
    return <EmptyState compact icon={CheckSquare} title={tr('Ta osoba nie ma adresu e-mail')} subtitle={tr('Zadania przypisuje się do konta — dodaj e-mail w kartotece.')} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700" />;
  }
  if (board.loading || personal === null) return <Spinner center />;

  const failed = board.error || personalError;
  const open = rows.filter((r) => !r.done);
  const done = rows.length - open.length;
  const today = todayYmd();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      {failed && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={14} className="shrink-0" style={{ color: STATUS_COLORS.danger }} aria-hidden="true" />
            <span className="truncate">{tr('Nie udało się wczytać wszystkich zadań')}</span>
          </span>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={board.reload}>{tr('Spróbuj ponownie')}</Button>
        </div>
      )}
      {open.length === 0 ? (
        <EmptyState compact icon={CheckSquare} title={tr('Brak otwartych zadań')} subtitle={tr('Ta osoba nie ma przypisanych zadań, które widzisz.')} />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {open.map((r) => {
            const overdue = isOverdueYmd(r.due, today);
            const content = (
              <>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{r.name || tr('Bez nazwy')}</span>
                    {r.isPrivate && <Lock size={12} className="shrink-0 text-gray-400" aria-label={tr('Prywatne')} />}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                    <span className="truncate">{r.sourceLabel}</span>
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
                {r.status && (
                  <StatusPill color={r.status.color} className="shrink-0 max-w-[40%] overflow-hidden">
                    <span className="truncate">{r.status.title}</span>
                  </StatusPill>
                )}
              </>
            );
            return (
              <li key={`${r.kind}:${r.id}`}>
                {r.kind === 'board' ? (
                  <button type="button" onClick={() => navigate(r.link)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600">
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {done > 0 && <p className="text-center text-xs text-gray-400 dark:text-gray-500">{tr('{n} ukończonych zadań', { n: done })}</p>}
    </div>
  );
}
