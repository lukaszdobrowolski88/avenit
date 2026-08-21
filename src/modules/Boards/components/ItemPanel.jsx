import React, { useState, useMemo, useEffect } from 'react';
import {
  X, MessageSquare, Activity, Send, Heart, Trash2, AtSign, CornerDownRight, MoreHorizontal, Copy, AlignLeft, Plus, Maximize2, ArrowLeft,
} from 'lucide-react';
import BoardCell from './BoardCell';
import ColumnIcon from './ColumnIcon';
import Popover from './Popover';
import AddColumnMenu from './AddColumnMenu';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useCan } from '../../../components/Can';
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
          {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Anuluj</Button>}
          <Button size="sm" icon={Send} onClick={submit} disabled={!text.trim()}>Wyślij</Button>
        </div>
      </div>
    </div>
  );
}

function UpdateItem({ u, replies, people, userEmail, onLike, onDelete, onReply }) {
  const [replying, setReplying] = useState(false);
  // likes bywa nie-tablicą (domyślny {} w JSONB) — normalizuj, by .includes/.length nie wywalały panelu.
  const likes = Array.isArray(u.likes) ? u.likes : [];
  const liked = likes.includes(userEmail);
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
              <Heart size={13} className={liked ? 'fill-red-500' : ''} /> {likes.length || ''}
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

// Wiersz podzadania (zadanie zagnieżdżone). Klik „Otwórz" wchodzi w podzadanie
// jak w pełne zadanie (te same opcje). Nazwa i status edytowalne inline.
function SubitemRow({ sub, statusCol, subCount, onRename, onCell, onUpdateColumn, onDelete, onOpen }) {
  const [name, setName] = useState(sub.name);
  useEffect(() => { setName(sub.name); }, [sub.name]);
  return (
    <div className="flex items-center gap-2 py-1.5 group/sub">
      <CornerDownRight size={13} className="text-gray-300 dark:text-gray-600 shrink-0" />
      <input value={name} placeholder="Podzadanie"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name !== sub.name) onRename(sub.id, name); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-200" />
      {subCount > 0 && <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-0.5"><CornerDownRight size={10} />{subCount}</span>}
      {statusCol && (
        <div className="w-28 h-7 rounded-md border border-gray-200 dark:border-gray-700 shrink-0 flex items-stretch overflow-hidden">
          <BoardCell column={statusCol} value={sub.cells?.[statusCol.id]} item={sub} columns={[statusCol]}
            onChange={(v) => onCell(sub.id, statusCol.id, v)} onUpdateColumn={onUpdateColumn} />
        </div>
      )}
      <button onClick={() => onOpen(sub)} className="opacity-0 group-hover/sub:opacity-100 text-gray-400 hover:text-accent-primary shrink-0 p-0.5" title="Otwórz podzadanie"><Maximize2 size={13} /></button>
      <button onClick={() => onDelete(sub.id)} className="opacity-0 group-hover/sub:opacity-100 text-gray-300 hover:text-red-500 shrink-0 p-0.5" title="Usuń podzadanie"><Trash2 size={13} /></button>
    </div>
  );
}

export default function ItemPanel({ item, data, onClose, userEmail, userName }) {
  const [tab, setTab] = useState('updates');
  // Drill-in: podzadanie otwiera się jak pełne zadanie. `viewItemId` = aktualnie
  // oglądany element, `trail` = ścieżka rodziców do powrotu. Reset przy zmianie itemu.
  const [viewItemId, setViewItemId] = useState(item.id);
  const [trail, setTrail] = useState([]);
  useEffect(() => { setViewItemId(item.id); setTrail([]); setTab('updates'); }, [item.id]);
  const current = data.items.find(i => i.id === viewItemId) || item;
  const openSubitem = (sub) => { setTrail(t => [...t, current]); setViewItemId(sub.id); setTab('updates'); };
  const goBack = () => { setTrail(t => { const n = [...t]; const p = n.pop(); if (p) setViewItemId(p.id); return n; }); setTab('updates'); };
  const { updates, activity, addUpdate, toggleLike, deleteUpdate } = useItemUpdates(current, data.board?.id, { userEmail, userName });

  const roots = useMemo(() => updates.filter(u => !u.parent_update_id), [updates]);
  const repliesOf = (id) => updates.filter(u => u.parent_update_id === id);
  // Nazwa + opis: lokalny stan, commit na blur (koniec zapisu do bazy przy każdym znaku).
  const [nameLocal, setNameLocal] = useState(current.name);
  useEffect(() => { setNameLocal(current.name); }, [current.name]);
  const [descLocal, setDescLocal] = useState(current.description || '');
  useEffect(() => { setDescLocal(current.description || ''); }, [current.description]);

  const TABS = [
    { id: 'updates', label: 'Aktualizacje', icon: MessageSquare, count: roots.length },
    { id: 'activity', label: 'Aktywność', icon: Activity },
  ];

  const group = data.groups?.find(g => g.id === current.group_id);
  const groupColor = group?.color || data.board?.color || '#6366f1';
  const canEditStructure = useCan('res:board_columns:create');

  // Podzadania — zadania zagnieżdżone w tym elemencie.
  const subitems = useMemo(
    () => data.items.filter(i => i.parent_item_id === current.id).sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [data.items, current.id]
  );
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const parent = current.parent_item_id ? data.items.find(i => i.id === current.parent_item_id) : null;
  const [newSub, setNewSub] = useState('');
  const addSub = () => { const n = newSub.trim(); if (!n) return; data.addSubitem(current, n); setNewSub(''); };

  const duplicate = async () => {
    let copy;
    if (current.parent_item_id) {
      copy = await data.addSubitem({ id: current.parent_item_id, group_id: current.group_id }, `${current.name || 'Podzadanie'} (kopia)`);
      if (copy) data.updateItem(copy.id, { cells: { ...(current.cells || {}) }, description: current.description || null });
    } else {
      copy = await data.addItem(current.group_id, `${current.name || 'Element'} (kopia)`, { ...(current.cells || {}) });
      if (copy && current.description) data.updateItem(copy.id, { description: current.description });
    }
    if (trail.length) goBack(); else onClose();
  };
  const remove = () => { if (confirm('Usunąć ten element?')) { data.deleteItem(current.id); if (trail.length) goBack(); else onClose(); } };

  return (
    <Modal isOpen onClose={onClose} size="lg" className="!p-0 !overflow-hidden !max-h-[85vh] flex flex-col animate-modal-pop">
      {/* Nagłówek */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start gap-2">
          {trail.length > 0 && (
            <button onClick={goBack} title="Wróć do elementu nadrzędnego"
              className="p-1.5 -ml-1 mt-0.5 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"><ArrowLeft size={18} /></button>
          )}
          <input value={nameLocal} placeholder="Nazwa elementu"
            onChange={(e) => setNameLocal(e.target.value)}
            onBlur={() => { if (nameLocal !== current.name) data.updateItem(current.id, { name: nameLocal }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="flex-1 min-w-0 text-xl font-bold bg-transparent outline-none text-gray-900 dark:text-white placeholder:text-gray-400" />
          <Popover align="right" width={180} triggerClassName="shrink-0" trigger={
            <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Więcej"><MoreHorizontal size={18} /></button>
          }>
            {({ close }) => (
              <div className="p-1.5">
                <button onClick={() => { duplicate(); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><Copy size={14} /> Duplikuj</button>
                <button onClick={() => { close(); remove(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600"><Trash2 size={14} /> Usuń element</button>
              </div>
            )}
          </Popover>
          <button onClick={onClose} aria-label="Zamknij"
            className="p-1.5 -mr-1 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"><X size={18} /></button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: groupColor }} />
          <span className="truncate">{data.board?.name}{group ? ` › ${group.name}` : ''}{parent ? ` › ${parent.name || 'element'}` : ''}</span>
        </div>
      </div>

      {/* Ciało — jedna kolumna, przewijane */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {/* Właściwości (lista etykieta → wartość) */}
        <section className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2.5">Właściwości</div>
          {data.columns.length === 0 && <div className="text-sm text-gray-400 mb-2">Brak pól — dodaj poniżej.</div>}
          <div className="space-y-1">
            {data.columns.map(col => {
              const t = getColumnType(col.type);
              const tall = col.type === 'long_text';
              return (
                <div key={col.id} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <ColumnIcon name={t.icon} size={13} className="text-gray-400 shrink-0" /> <span className="truncate">{col.name}</span>
                  </div>
                  <div className="flex-1 min-w-0 max-w-[340px]">
                    <div className={`${tall ? 'min-h-[36px]' : 'h-9'} rounded-lg bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 flex items-stretch overflow-hidden transition-colors`}>
                      <BoardCell column={col} value={current.cells?.[col.id]} people={data.people} me={data.me} item={current} columns={data.columns}
                        onChange={(v) => data.updateCell(current.id, col.id, v)} onUpdateColumn={data.updateColumn} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {canEditStructure && (
            <AddColumnMenu onAdd={data.addColumn} align="left" triggerClassName="inline-block mt-2"
              trigger={
                <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-accent-primary px-1 py-1">
                  <Plus size={15} /> Dodaj pole (status, priorytet, tagi, pliki…)
                </button>
              } />
          )}
        </section>

        {/* Opis */}
        <section className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><AlignLeft size={13} /> Opis</div>
          <textarea value={descLocal} onChange={(e) => setDescLocal(e.target.value)}
            onBlur={() => { if (descLocal !== (current.description || '')) data.updateItem(current.id, { description: descLocal || null }); }}
            placeholder="Dodaj opis, kontekst, linki…" rows={2}
            className="w-full text-sm rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-accent-primary/40 focus:bg-white dark:focus:bg-gray-800 p-3 outline-none resize-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400 transition" />
        </section>

        {/* Podzadania */}
        <section className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1">
            <CornerDownRight size={13} /> Podzadania {subitems.length > 0 && <span className="text-gray-400">({subitems.length})</span>}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {subitems.map(sub => (
              <SubitemRow key={sub.id} sub={sub} statusCol={statusCol}
                subCount={data.items.filter(i => i.parent_item_id === sub.id).length}
                onRename={(id, n) => data.updateItem(id, { name: n })}
                onCell={data.updateCell} onUpdateColumn={data.updateColumn} onDelete={data.deleteItem} onOpen={openSubitem} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Plus size={14} className="text-gray-400 shrink-0" />
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSub(); }}
              placeholder="Dodaj podzadanie…"
              className="flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400 py-1" />
            {newSub.trim() && <button onClick={addSub} className="text-xs font-medium text-accent-primary shrink-0">Dodaj</button>}
          </div>
        </section>

        {/* Aktualizacje / Aktywność */}
        <section className="px-6 pt-1 pb-4">
          <div className="flex gap-1 border-b border-gray-100 dark:border-gray-800 mb-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === t.id ? 'border-accent-primary text-accent-primary' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <t.icon size={15} /> {t.label}
                {t.count > 0 && <span className="text-xs text-gray-400">{t.count}</span>}
              </button>
            ))}
          </div>
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
        </section>
      </div>
    </Modal>
  );
}
