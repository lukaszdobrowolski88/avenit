import React, { useState, useMemo } from 'react';
import {
  X, MessageSquare, ListChecks, Activity, Send, Heart, Trash2, AtSign, CornerDownRight,
} from 'lucide-react';
import BoardCell from './BoardCell';
import ColumnIcon from './ColumnIcon';
import Popover from './Popover';
import { Avatar } from './cells/PeopleCell';
import { getColumnType } from '../lib/columnTypes';
import { useItemUpdates } from '../hooks/useItemUpdates';

const ACTION_LABEL = {
  created: 'utworzył(a) element',
  value_changed: 'zmienił(a) wartość',
  status_changed: 'zmienił(a) status',
  assigned: 'zmienił(a) przypisanie',
  moved: 'przeniósł(przeniosła) element',
};

function timeAgo(iso) {
  try { return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// Kompozytor aktualizacji z prostymi @wzmiankami (przycisk @ → wybór osoby).
function Composer({ people, onSend, parentId, onCancel, placeholder = 'Napisz aktualizację...' }) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]); // [{email,name}]
  const addMention = (p) => { setText(t => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${p.name} `); setMentions(m => m.find(x => x.email === p.email) ? m : [...m, p]); };
  const submit = () => { if (!text.trim()) return; onSend(text.trim(), mentions.map(m => m.email)); setText(''); setMentions([]); onCancel?.(); };
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-2 bg-white dark:bg-gray-800">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={parentId ? 2 : 3} placeholder={placeholder}
        className="w-full bg-transparent text-sm outline-none resize-none text-gray-700 dark:text-gray-200" />
      <div className="flex items-center justify-between pt-1">
        <Popover width={220} trigger={<button className="text-gray-400 hover:text-accent-primary p-1"><AtSign size={16} /></button>}>
          {({ close }) => (
            <div className="p-1 max-h-56 overflow-y-auto custom-scrollbar">
              {people.map(p => (
                <button key={p.email} onClick={() => { addMention(p); close(); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left text-sm">
                  <Avatar person={p} size={20} /> <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </Popover>
        <div className="flex items-center gap-1">
          {onCancel && <button onClick={onCancel} className="text-xs text-gray-400 px-2 py-1">Anuluj</button>}
          <button onClick={submit} disabled={!text.trim()}
            className="flex items-center gap-1 text-sm bg-accent-primary text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
            <Send size={14} /> Wyślij
          </button>
        </div>
      </div>
    </div>
  );
}

function UpdateItem({ u, replies, people, userEmail, onLike, onDelete, onReply }) {
  const [replying, setReplying] = useState(false);
  const liked = (u.likes || []).includes(userEmail);
  return (
    <div className="py-3 border-b border-gray-100 dark:border-gray-700/60">
      <div className="flex items-start gap-2">
        <Avatar person={{ email: u.author_email, name: u.author_name || u.author_email }} size={30} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{u.author_name || u.author_email}</span>
            <span className="text-[11px] text-gray-400">{timeAgo(u.created_at)}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mt-0.5">{u.body}</p>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => onLike(u)} className={`flex items-center gap-1 text-xs ${liked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}>
              <Heart size={13} className={liked ? 'fill-red-500' : ''} /> {(u.likes || []).length || ''}
            </button>
            <button onClick={() => setReplying(r => !r)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent-primary">
              <CornerDownRight size={13} /> Odpowiedz
            </button>
            {u.author_email === userEmail && (
              <button onClick={() => onDelete(u.id)} className="text-xs text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
            )}
          </div>
          {replies.length > 0 && (
            <div className="mt-2 pl-3 border-l-2 border-gray-100 dark:border-gray-700 space-y-2">
              {replies.map(r => (
                <div key={r.id} className="flex items-start gap-2">
                  <Avatar person={{ email: r.author_email, name: r.author_name || r.author_email }} size={22} />
                  <div>
                    <div className="flex items-center gap-2"><span className="text-xs font-medium">{r.author_name}</span><span className="text-[10px] text-gray-400">{timeAgo(r.created_at)}</span></div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {replying && (
            <div className="mt-2">
              <Composer people={people} parentId={u.id} onSend={(t, m) => onReply(t, m, u.id)} onCancel={() => setReplying(false)} placeholder="Odpowiedz..." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ItemPanel({ item, data, onClose, userEmail, userName }) {
  const [tab, setTab] = useState('updates');
  const current = data.items.find(i => i.id === item.id) || item;
  const { updates, activity, addUpdate, toggleLike, deleteUpdate } = useItemUpdates(current, data.board?.id, { userEmail, userName });

  const roots = useMemo(() => updates.filter(u => !u.parent_update_id), [updates]);
  const repliesOf = (id) => updates.filter(u => u.parent_update_id === id);

  const TABS = [
    { id: 'updates', label: 'Aktualizacje', icon: MessageSquare },
    { id: 'values', label: 'Kolumny', icon: ListChecks },
    { id: 'activity', label: 'Aktywność', icon: Activity },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[480px] h-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col animate-[slideIn_.2s_ease]">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-start gap-2">
          <input value={current.name} placeholder="Nazwa elementu"
            onChange={(e) => data.updateItem(current.id, { name: e.target.value })}
            className="flex-1 text-lg font-semibold bg-transparent outline-none text-gray-800 dark:text-gray-100" />
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        {/* Tabs */}
        <div className="flex px-2 border-b border-gray-100 dark:border-gray-700">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px ${tab === t.id ? 'border-accent-primary text-accent-primary' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {tab === 'updates' && (
            <div>
              <Composer people={data.people} onSend={(t, m) => addUpdate(t, m)} />
              <div className="mt-2">
                {roots.length === 0 && <div className="text-center text-sm text-gray-400 py-8">Brak aktualizacji. Napisz pierwszą!</div>}
                {roots.map(u => (
                  <UpdateItem key={u.id} u={u} replies={repliesOf(u.id)} people={data.people} userEmail={userEmail}
                    onLike={toggleLike} onDelete={deleteUpdate} onReply={(t, m, pid) => addUpdate(t, m, pid)} />
                ))}
              </div>
            </div>
          )}

          {tab === 'values' && (
            <div className="space-y-3">
              {data.columns.map(col => {
                const t = getColumnType(col.type);
                return (
                  <div key={col.id} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <ColumnIcon name={t.icon} size={13} className="text-gray-400" /> <span className="truncate">{col.name}</span>
                    </div>
                    <div className="flex-1 min-h-[36px] border border-gray-200 dark:border-gray-700 rounded-lg flex items-stretch overflow-hidden">
                      <BoardCell column={col} value={current.cells?.[col.id]} people={data.people} me={data.me} item={current} columns={data.columns}
                        onChange={(v) => data.updateCell(current.id, col.id, v)} onUpdateColumn={data.updateColumn} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-3">
              {activity.length === 0 && <div className="text-center text-sm text-gray-400 py-8">Brak historii aktywności</div>}
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <Avatar person={{ email: a.actor_email, name: a.actor_name || a.actor_email || '?' }} size={24} />
                  <div>
                    <span className="text-gray-700 dark:text-gray-200">{a.actor_name || a.actor_email || 'System'}</span>{' '}
                    <span className="text-gray-500">{ACTION_LABEL[a.action] || a.action}</span>
                    <div className="text-[11px] text-gray-400">{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
