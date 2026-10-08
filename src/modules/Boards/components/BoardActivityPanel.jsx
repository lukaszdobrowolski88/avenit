import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import Modal from '../../../components/Modal';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { supabase } from '../../../lib/supabase';
import { Avatar } from './cells/PeopleCell';
import { tr, appLocale } from '../../../i18n';

const ACTION_LABEL = {
  created: 'utworzył(a) zadanie',
  value_changed: 'zmienił(a) wartość',
  status_changed: 'zmienił(a) status',
  assigned: 'zmienił(a) przypisanie',
  moved: 'przeniósł(przeniosła) zadanie',
  deleted: 'usunął(usunęła) zadanie',
};
// Dziś → sama godzina, wczoraj → „wczoraj, 12:30”, starsze → data (jak komentarze na Tablicy).
function when(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return time;
    if (diff === 1) return `${tr('wczoraj')}, ${time}`;
    return d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }) + `, ${time}`;
  } catch { return ''; }
}

// Dziennik aktywności całej tablicy (agregacja board_item_activity) — okno jak wszystkie w aplikacji.
export default function BoardActivityPanel({ boardId, items, people = [], onClose, onOpenItem }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const nameById = Object.fromEntries((items || []).map(i => [i.id, i.name]));
  const photo = Object.fromEntries((people || []).map(p => [(p.email || '').toLowerCase(), p.avatar_url]));

  useEffect(() => {
    let alive = true;
    supabase.from('board_item_activity').select('*').eq('board_id', boardId)
      .order('created_at', { ascending: false }).limit(150)
      .then(({ data, error }) => {
        if (!alive) return;
        // Błąd (np. brak uprawnień) to nie „brak aktywności” — mówimy wprost.
        if (error) { setFailed(true); setRows([]); return; }
        setRows(data || []);
      });
    return () => { alive = false; };
  }, [boardId]);

  return (
    <Modal isOpen onClose={onClose} title={tr('Aktywność')} subtitle={tr('Ostatnie zmiany w zadaniach')} icon={Activity} size="lg">
      <div className="p-6">
        {rows === null && <Spinner center />}
        {failed && <EmptyState compact icon={AlertTriangle} title={tr('Nie udało się wczytać aktywności')} subtitle={tr('Spróbuj ponownie za chwilę.')} />}
        {rows && !failed && rows.length === 0 && <EmptyState compact icon={Activity} title={tr('Brak zarejestrowanej aktywności.')} />}
        <ul className="space-y-3">
          {rows && rows.map(a => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <Avatar person={{ email: a.actor_email, name: a.actor_name || a.actor_email || '?', avatar_url: photo[(a.actor_email || '').toLowerCase()] }} size={28} />
              <div className="min-w-0">
                <span className="font-semibold text-gray-800 dark:text-gray-100">{a.actor_name || a.actor_email || tr('System')}</span>{' '}
                <span className="text-gray-600 dark:text-gray-300">{ACTION_LABEL[a.action] ? tr(ACTION_LABEL[a.action]) : tr('zmienił(a) zadanie')}</span>{' '}
                {nameById[a.item_id] && (
                  <button type="button" onClick={() => onOpenItem?.(items.find(i => i.id === a.item_id))} className="font-medium text-gray-900 dark:text-white underline decoration-gray-300 underline-offset-2 hover:decoration-gray-700">„{nameById[a.item_id]}”</button>
                )}
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">{when(a.created_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
