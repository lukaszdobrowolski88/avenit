import React, { useState, useEffect } from 'react';
import { X, Activity, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Avatar } from './cells/PeopleCell';

const ACTION_LABEL = {
  created: 'utworzył(a) element',
  value_changed: 'zmienił(a) wartość',
  status_changed: 'zmienił(a) status',
  assigned: 'zmienił(a) przypisanie',
  moved: 'przeniósł(przeniosła) element',
  deleted: 'usunął(usunęła) element',
};
function timeAgo(iso) { try { return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }

// Dziennik aktywności całej tablicy (agregacja board_item_activity).
export default function BoardActivityPanel({ boardId, items, onClose, onOpenItem }) {
  const [rows, setRows] = useState(null);
  const nameById = Object.fromEntries((items || []).map(i => [i.id, i.name]));

  useEffect(() => {
    supabase.from('board_item_activity').select('*').eq('board_id', boardId)
      .order('created_at', { ascending: false }).limit(150)
      .then(({ data }) => setRows(data || []));
  }, [boardId]);

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Activity size={18} className="text-accent-primary" />
          <h2 className="flex-1 font-semibold text-gray-800 dark:text-gray-100">Aktywność tablicy</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {rows === null && <div className="flex justify-center py-10 text-gray-400"><Loader2 className="animate-spin" size={24} /></div>}
          {rows && rows.length === 0 && <div className="text-center text-sm text-gray-400 py-10">Brak zarejestrowanej aktywności.</div>}
          <div className="space-y-3">
            {rows && rows.map(a => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                <Avatar person={{ email: a.actor_email, name: a.actor_name || a.actor_email || '?' }} size={26} />
                <div className="min-w-0">
                  <span className="text-gray-700 dark:text-gray-200">{a.actor_name || a.actor_email || 'System'}</span>{' '}
                  <span className="text-gray-500">{ACTION_LABEL[a.action] || a.action}</span>{' '}
                  {nameById[a.item_id] && (
                    <button onClick={() => onOpenItem?.(items.find(i => i.id === a.item_id))} className="text-accent-primary hover:underline truncate">„{nameById[a.item_id]}"</button>
                  )}
                  <div className="text-[11px] text-gray-400">{timeAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
