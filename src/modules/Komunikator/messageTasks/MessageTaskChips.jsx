// Pod wiadomością: „Zadanie: <nazwa>” + status, gdy z wiadomości utworzono zadanie (widoczne dla
// tych, którzy widzą tablicę zadania — zakres pilnuje serwer). Klik → zadanie w jego miejscu.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { tr } from '../../../i18n';
import { StatusPill } from '../../../components/ui/DataTable';
import { useAppModules } from '../../../hooks/useAppModules';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { boardColor } from '../../Boards/lib/palette';
import { modulePathsOf } from './CreateTaskFromMessageModal';

export default function MessageTaskChips({ tasks, isOwn = false }) {
  const navigate = useNavigate();
  const { modules } = useAppModules();
  if (!tasks?.length) return null;
  const paths = modulePathsOf(modules);
  return (
    <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {tasks.map((t) => {
        const name = t.name || tr('Bez nazwy');
        return (
          <button key={t.id} type="button" onClick={() => navigate(taskItemLink(t.board, t.id, paths))}
            title={tr('Otwórz zadanie')}
            className="inline-flex items-center gap-1.5 max-w-[18rem] px-2.5 py-1 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
            <CheckSquare size={12} className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span className={`truncate ${t.done ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
              {tr('Zadanie: {name}', { name })}
            </span>
            {t.status?.title && (
              <StatusPill color={boardColor(t.status.color)} className="shrink-0">{t.status.title}</StatusPill>
            )}
          </button>
        );
      })}
    </div>
  );
}
