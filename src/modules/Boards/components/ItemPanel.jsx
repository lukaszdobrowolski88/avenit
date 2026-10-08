import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'react';
import {
  MessageSquare, Activity, Send, Heart, Trash2, AtSign, CornerDownRight, Copy, Plus, Maximize2, ArrowLeft,
} from 'lucide-react';
import BoardCell from './BoardCell';
import ColumnIcon from './ColumnIcon';
import Popover from './Popover';
import AddColumnMenu from './AddColumnMenu';
import { Avatar } from './cells/PeopleCell';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import ActionMenu from '../../../components/ActionMenu';
import '../../../components/pickList.css';
import '../../../components/toolbar.css';
import { getColumnType, findLabel } from '../lib/columnTypes';
import { useItemUpdates } from '../hooks/useItemUpdates';
import { confirmDialog } from '../../../lib/dialog';
import { toast } from '../../../lib/toast';
import { tr, appLocale } from '../../../i18n';

// Etykieta sekcji — jeden styl w całym oknie (jak etykiety pól w reszcie aplikacji).
const SECTION = 'text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2';
// Komórki tabeli centrują treść (status, data, ocena…); w oknie wartości stoją do lewej.
const ALIGN_LEFT = '[&_.h-full.justify-center]:justify-start [&_.h-full.justify-end]:justify-start [&_.text-center]:text-left [&_.text-right]:text-left';
const REVEAL = 'opacity-0 group-hover/sub:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100';
const asLikes = (v) => (Array.isArray(v) ? v : []);

// Czas jak na tablicy ogłoszeń (WallTab): dziś → godzina, wczoraj, dzień tygodnia, potem data.
function formatTime(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const time = date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86400000);
  if (days <= 0) return time;
  if (days === 1) return `${tr('wczoraj')} ${time}`;
  if (days < 7) return `${date.toLocaleDateString(appLocale(), { weekday: 'short' })} ${time}`;
  const year = date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {};
  return `${date.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', ...year })} ${time}`;
}
function Time({ iso }) {
  const full = iso ? new Date(iso).toLocaleString(appLocale()) : '';
  return <time dateTime={iso || undefined} title={full} className="text-[11px] text-gray-500 dark:text-gray-400">{formatTime(iso)}</time>;
}

// Lista osób do @wzmianki — ta sama wspólna lista wyboru co w komórce „Osoby” (pick-pop).
function MentionList({ people, onPick }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter(p => !s || (p.name || '').toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s));
  }, [q, people]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus className="pick-search" placeholder={tr('Szukaj osoby…')} aria-label={tr('Szukaj osoby…')}
        onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); onPick(list[0]); } }} />
      <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
        {list.length === 0 && <div className="px-3 py-3 text-sm text-gray-500">{tr('Brak wyników')}</div>}
        {list.map(p => (
          <button key={p.email} type="button" className="pick-opt text-gray-800 dark:text-gray-100" onClick={() => onPick(p)}>
            <Avatar person={p} size={22} /> <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Kompozytor komentarza z @wzmiankami. Enter wysyła, Shift+Enter = nowa linia (na ekranach
// dotykowych Enter zostaje nową linią — wysyła przycisk). Tekst znika dopiero po udanym zapisie.
const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;
function Composer({ people, onSend, onCancel, autoFocus = false, placeholder }) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]); // [{email,name}]
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);
  const addMention = (p) => {
    setText(t => `${t}${t && !/\s$/.test(t) ? ' ' : ''}@${p.name} `);
    setMentions(m => (m.some(x => x.email === p.email) ? m : [...m, p]));
    requestAnimationFrame(() => taRef.current?.focus());
  };
  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    // Powiadamiamy tylko osoby, których @imię zostało w treści (mogło zostać skasowane).
    const emails = mentions.filter(m => body.includes(`@${m.name}`)).map(m => m.email);
    const ok = await onSend(body, emails);
    setBusy(false);
    if (ok) { setText(''); setMentions([]); onCancel?.(); }
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 focus-within:border-accent-primary-light transition-colors">
      <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} rows={onCancel ? 2 : 3} autoFocus={autoFocus}
        placeholder={placeholder} aria-label={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !TOUCH && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
        }}
        className="w-full bg-transparent border-0 shadow-none text-sm outline-none resize-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400 p-1" />
      <div className="flex items-center justify-between gap-2 pt-1">
        <Popover width={240} align="left" triggerClassName="shrink-0" trigger={
          <button type="button" aria-label={tr('Wspomnij osobę')} title={tr('Wspomnij osobę')}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-100">
            <AtSign size={16} aria-hidden="true" />
          </button>
        }>
          {({ close }) => <MentionList people={people} onPick={(p) => { addMention(p); close(); }} />}
        </Popover>
        {!TOUCH && <span className="hidden sm:inline text-[11px] text-gray-400 truncate">{tr('Enter — wyślij, Shift+Enter — nowa linia')}</span>}
        <div className="flex items-center gap-1 ml-auto">
          {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>{tr('Anuluj')}</Button>}
          <Button size="sm" icon={Send} onClick={submit} loading={busy} disabled={!text.trim()}>{tr('Wyślij')}</Button>
        </div>
      </div>
    </div>
  );
}

// Serce jak na tablicy ogłoszeń (WallTab): akcent marki, licznik obok. Bez prawa reakcji — sam licznik.
function LikeButton({ u, userEmail, canLike, onToggle }) {
  const likes = asLikes(u.likes);
  const liked = likes.includes(userEmail);
  if (!canLike) {
    return likes.length > 0 ? (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500" aria-label={tr('Polubienia: {n}', { n: likes.length })}>
        <Heart size={12} aria-hidden="true" /> {likes.length}
      </span>
    ) : null;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => onToggle(u)} aria-pressed={liked} aria-label={liked ? tr('Cofnij polubienie') : tr('Polub')}
        className={`p-1 rounded-full transition ${liked ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/50 text-accent-primary-light' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-accent-primary-light'}`}>
        <Heart size={12} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      {likes.length > 0 && <span className="text-[11px] text-gray-500 tabular-nums">{likes.length}</span>}
    </span>
  );
}

function CommentBody({ u, personOf, small = false }) {
  const who = personOf(u.author_email, u.author_name);
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`${small ? 'text-xs' : 'text-sm'} font-semibold text-gray-800 dark:text-gray-100`}>{who.name}</span>
        <Time iso={u.created_at} />
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-0.5">{u.body}</p>
    </>
  );
}

function UpdateItem({ u, replies, people, personOf, userEmail, can, onLike, onDelete, onReply }) {
  const [replying, setReplying] = useState(false);
  const canDelete = (x) => can.deleteUpdates && x.author_email && x.author_email === userEmail;
  const del = (x) => (
    <button type="button" onClick={() => onDelete(x, x === u ? replies.length : 0)} aria-label={tr('Usuń komentarz')} title={tr('Usuń komentarz')}
      className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
      <Trash2 size={12} aria-hidden="true" />
    </button>
  );
  return (
    <article className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <Avatar person={personOf(u.author_email, u.author_name)} size={30} />
        <div className="flex-1 min-w-0">
          <CommentBody u={u} personOf={personOf} />
          <div className="flex items-center gap-2 mt-1.5">
            <LikeButton u={u} userEmail={userEmail} canLike={can.likeUpdates} onToggle={onLike} />
            {can.comment && (
              <button type="button" onClick={() => setReplying(r => !r)} aria-expanded={replying}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 dark:hover:text-gray-100">
                <CornerDownRight size={13} aria-hidden="true" /> {tr('Odpowiedz')}
              </button>
            )}
            {canDelete(u) && del(u)}
          </div>
          {replies.length > 0 && (
            <div className="mt-2 pl-3 border-l-2 border-gray-100 dark:border-gray-700 space-y-3">
              {replies.map(r => (
                <div key={r.id} className="flex items-start gap-2">
                  <Avatar person={personOf(r.author_email, r.author_name)} size={22} />
                  <div className="flex-1 min-w-0">
                    <CommentBody u={r} personOf={personOf} small />
                    <div className="flex items-center gap-2 mt-1">
                      <LikeButton u={r} userEmail={userEmail} canLike={can.likeUpdates} onToggle={onLike} />
                      {canDelete(r) && del(r)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {replying && (
            <div className="mt-2">
              <Composer people={people} autoFocus placeholder={tr('Odpowiedz...')}
                onSend={(t, m) => onReply(t, m, u.id)} onCancel={() => setReplying(false)} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// Wiersz podzadania. „Otwórz” wchodzi w podzadanie jak w pełne zadanie (te same opcje).
// Przyciski widoczne także na dotyku i przy fokusie z klawiatury (nie tylko po najechaniu).
function SubitemRow({ sub, statusCol, subCount, placeholder, canEdit, canDelete, onRename, onCell, onUpdateColumn, onDelete, onOpen }) {
  const [name, setName] = useState(sub.name);
  useEffect(() => { setName(sub.name); }, [sub.name]);
  const label = sub.name || tr('Bez nazwy');
  return (
    <div className="flex items-center gap-2 py-1.5 group/sub">
      <CornerDownRight size={13} className="text-gray-300 dark:text-gray-600 shrink-0" aria-hidden="true" />
      <input value={name} placeholder={placeholder} aria-label={placeholder} readOnly={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (canEdit && name !== sub.name) onRename(sub.id, name); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400" />
      {subCount > 0 && <span className="text-[10px] text-gray-500 shrink-0 flex items-center gap-0.5"><CornerDownRight size={10} aria-hidden="true" />{subCount}</span>}
      {statusCol && (
        <div className="w-32 h-8 shrink-0 flex items-stretch rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 group/row">
          <BoardCell column={statusCol} value={sub.cells?.[statusCol.id]} item={sub} columns={[statusCol]}
            onChange={(v) => onCell(sub.id, statusCol.id, v)} onUpdateColumn={onUpdateColumn} />
        </div>
      )}
      <button type="button" onClick={() => onOpen(sub)} aria-label={tr('Otwórz: {name}', { name: label })} title={tr('Otwórz')}
        className={`${REVEAL} p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 shrink-0`}>
        <Maximize2 size={13} aria-hidden="true" />
      </button>
      {canDelete && (
        <button type="button" onClick={() => onDelete(sub)} aria-label={tr('Usuń: {name}', { name: label })} title={tr('Usuń')}
          className={`${REVEAL} p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0`}>
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function ItemPanel({ item, data, terms = {}, onClose, userEmail, userName }) {
  const can = data.can || {};
  const ids = useId();
  // Słownictwo kontekstu: w zakładce „Zadania” — zadania/podzadania, w Projektach — elementy.
  const itemWords = terms.kind === 'item';
  const W = {
    subs: itemWords ? 'Podelementy' : 'Podzadania',
    addSub: itemWords ? 'Dodaj podelement…' : 'Dodaj podzadanie…',
    created: itemWords ? 'utworzył(a) element' : 'utworzył(a) zadanie',
  };

  const [tab, setTab] = useState('updates');
  // Drill-in: podzadanie otwiera się jak pełne zadanie. `viewItemId` = aktualnie
  // oglądany element, `trail` = ścieżka rodziców do powrotu. Reset przy zmianie itemu.
  const [viewItemId, setViewItemId] = useState(item.id);
  const [trail, setTrail] = useState([]);
  useEffect(() => { setViewItemId(item.id); setTrail([]); setTab('updates'); }, [item.id]);
  const current = data.items.find(i => i.id === viewItemId) || item;
  const isSub = !!current.parent_item_id;
  const { updates, activity, loading, addUpdate, toggleLike, deleteUpdate } = useItemUpdates(current, data.board?.id, { userEmail, userName });

  const roots = useMemo(() => updates.filter(u => !u.parent_update_id), [updates]);
  const repliesOf = (id) => updates.filter(u => u.parent_update_id === id);

  // Zdjęcia autorów z katalogu osób (data.people) — w komentarzu zapisany jest tylko e-mail i imię.
  const peopleByEmail = useMemo(() => new Map((data.people || []).map(p => [String(p.email || '').toLowerCase(), p])), [data.people]);
  const personOf = useCallback((email, name) => {
    const p = peopleByEmail.get(String(email || '').toLowerCase());
    return { email, name: p?.name || name || email || tr('System'), avatar_url: p?.avatar_url };
  }, [peopleByEmail]);

  // Nazwa + opis: lokalny stan, zapis na blur ORAZ przy zamknięciu okna (Esc/X/tło) i przejściu
  // do podzadania — wcześniej zamknięcie Esc-em w trakcie pisania gubiło zmiany.
  const nameRef = useRef(null);
  const [nameLocal, setNameLocal] = useState(current.name || '');
  const [descLocal, setDescLocal] = useState(current.description || '');
  const sent = useRef({ name: null, desc: null });
  useEffect(() => { setNameLocal(current.name || ''); setDescLocal(current.description || ''); sent.current = { name: null, desc: null }; }, [current.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Zmiana z zewnątrz (realtime) — nie nadpisuj pola, w którym ktoś właśnie pisze.
  useEffect(() => { if (document.activeElement !== nameRef.current) setNameLocal(current.name || ''); }, [current.name]);
  // Wysokość pola nazwy = treść (zawijanie na wąskim ekranie).
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [nameLocal, current.id]);
  useEffect(() => { if (!document.activeElement?.dataset?.itemDesc) setDescLocal(current.description || ''); }, [current.description]);

  const commitName = () => {
    if (!can.editItems || nameLocal === (current.name || '') || nameLocal === sent.current.name) return;
    sent.current.name = nameLocal;
    data.updateItem(current.id, { name: nameLocal });
  };
  const commitDesc = () => {
    if (!can.editItems || descLocal === (current.description || '') || descLocal === sent.current.desc) return;
    sent.current.desc = descLocal;
    data.updateItem(current.id, { description: descLocal || null });
  };
  const commitAll = () => { commitName(); commitDesc(); };
  const handleClose = () => { commitAll(); onClose(); };

  const openSubitem = (sub) => { commitAll(); setTrail(t => [...t, current]); setViewItemId(sub.id); setTab('updates'); };
  const goBack = () => { commitAll(); setTrail(t => { const n = [...t]; const p = n.pop(); if (p) setViewItemId(p.id); return n; }); setTab('updates'); };

  const group = data.groups?.find(g => g.id === current.group_id);
  const parent = isSub ? data.items.find(i => i.id === current.parent_item_id) : null;

  // Podzadania — zadania zagnieżdżone w tym elemencie.
  const subitems = useMemo(
    () => data.items.filter(i => i.parent_item_id === current.id).sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [data.items, current.id]
  );
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const [newSub, setNewSub] = useState('');
  const addSub = async () => {
    const n = newSub.trim();
    if (!n || !can.createItems) return;
    const it = await data.addSubitem(current, n);
    if (it) setNewSub(''); // przy błędzie wpis zostaje do ponownej próby
  };
  const removeSub = async (sub) => {
    const ok = await confirmDialog({ title: tr('Usunąć „{name}”?', { name: sub.name || tr('Bez nazwy') }), message: tr('Tej operacji nie można cofnąć.'), confirmLabel: tr('Usuń'), danger: true });
    if (ok) data.deleteItem(sub.id);
  };

  const duplicate = async () => {
    commitAll();
    const baseName = nameLocal || current.name || tr(isSub ? (terms.sub || 'Podzadanie') : (terms.column || 'Zadanie'));
    const copyName = tr('{name} (kopia)', { name: baseName });
    let copy;
    if (isSub) {
      copy = await data.addSubitem({ id: current.parent_item_id, group_id: current.group_id }, copyName);
      if (copy) await data.updateItem(copy.id, { cells: { ...(current.cells || {}) }, description: descLocal || null });
    } else {
      copy = await data.addItem(current.group_id, copyName, { ...(current.cells || {}) });
      if (copy && descLocal) await data.updateItem(copy.id, { description: descLocal });
    }
    if (!copy) return;
    toast.success(tr('Utworzono kopię: {name}', { name: copyName }));
    if (trail.length) goBack(); else onClose();
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: tr('Usunąć „{name}”?', { name: current.name || tr('Bez nazwy') }), message: tr('Tej operacji nie można cofnąć.'), confirmLabel: tr('Usuń'), danger: true });
    if (!ok) return;
    if (!await data.deleteItem(current.id)) return; // nie udało się (toast już jest) — okno zostaje
    if (trail.length) { setTrail(t => { const n = [...t]; const p = n.pop(); if (p) setViewItemId(p.id); return n; }); } else onClose();
  };
  const onDeleteComment = async (u, repliesCount) => {
    const ok = await confirmDialog({
      title: tr('Usunąć komentarz?'),
      message: repliesCount ? tr('Razem z nim znikną odpowiedzi ({n}).', { n: repliesCount }) : tr('Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń'), danger: true,
    });
    if (ok) deleteUpdate(u.id);
  };

  const menuItems = [
    ...(can.createItems ? [{ key: 'dup', icon: Copy, label: tr('Duplikuj'), onClick: duplicate }] : []),
    ...(can.deleteItems ? [{ key: 'del', icon: Trash2, label: tr('Usuń'), danger: true, onClick: remove }] : []),
  ];

  // Opis aktywności w języku aplikacji, z nazwą pola i nową wartością, gdy ją znamy.
  const activityText = (a) => {
    const col = a.column_id ? data.columns.find(c => c.id === a.column_id) : null;
    const field = col?.name;
    const to = a.to_value && typeof a.to_value === 'object' && 'value' in a.to_value ? a.to_value.value : a.to_value;
    switch (a.action) {
      case 'created': return `${tr(W.created)}${a.to_value?.via === 'form' ? ` · ${tr('przez formularz')}` : ''}`;
      case 'status_changed': {
        if (!field) return tr('zmienił(a) status');
        const l = col ? findLabel(col, to) : null;
        return l ? tr('zmienił(a) „{field}” na „{value}”', { field, value: l.title }) : tr('wyczyścił(a) „{field}”', { field });
      }
      case 'value_changed': return field ? tr('zmienił(a) pole „{field}”', { field }) : tr('zmienił(a) wartość');
      case 'assigned': return field ? tr('zmienił(a) pole „{field}”', { field }) : tr('zmienił(a) przypisanie');
      case 'moved': {
        const g = data.groups?.find(x => x.id === a.to_value?.group_id);
        return g ? tr('przeniósł(przeniosła) do grupy „{group}”', { group: g.name }) : tr('przeniósł(przeniosła) do innej grupy');
      }
      default: return a.action;
    }
  };

  const breadcrumb = (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
      {group?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} aria-hidden="true" />}
      <span className="truncate">{[data.board?.name, group?.name, parent ? (parent.name || tr('Bez nazwy')) : null].filter(Boolean).join(' › ')}</span>
    </span>
  );

  return (
    <Modal isOpen onClose={handleClose} size="lg" title={tr(isSub ? (terms.sub || 'Podzadanie') : (terms.column || 'Zadanie'))} subtitle={breadcrumb}>
      <div className="p-6 space-y-6">
        {/* Nazwa (edycja w miejscu) + akcje */}
        <div className="flex items-start gap-2">
          {trail.length > 0 && (
            <button type="button" onClick={goBack} aria-label={tr('Wróć do: {name}', { name: trail[trail.length - 1]?.name || tr('Bez nazwy') })} title={tr('Wróć')}
              className="p-1.5 -ml-1.5 mt-0.5 shrink-0 text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          {/* textarea (nie input): długa nazwa zawija się zamiast uciekać za krawędź (telefon). */}
          <textarea key={current.id} ref={nameRef} value={nameLocal} readOnly={!can.editItems} rows={1}
            autoFocus={can.editItems && !current.name}
            placeholder={tr(terms.placeholder || 'Nazwa zadania')} aria-label={tr(terms.placeholder || 'Nazwa zadania')}
            onChange={(e) => setNameLocal(e.target.value.replace(/[\r\n]+/g, ' '))}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            className="flex-1 min-w-0 text-xl font-bold leading-snug bg-transparent border-0 shadow-none outline-none resize-none overflow-hidden text-gray-900 dark:text-white placeholder:text-gray-400 rounded-lg px-1 -mx-1 py-0.5 focus:ring-2 focus:ring-accent-primary-light/40" />
          {menuItems.length > 0 && <ActionMenu variant="tool" label={tr('Więcej działań')} items={menuItems} />}
        </div>

        {/* Szczegóły — etykieta → wartość, te same komórki co w tabeli */}
        <section aria-labelledby={`${ids}-props`}>
          <h3 id={`${ids}-props`} className={SECTION}>{tr('Szczegóły')}</h3>
          {data.columns.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{can.addColumns ? tr('Brak pól — dodaj poniżej.') : tr('Ta tablica nie ma jeszcze pól.')}</p>
          ) : (
            <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {data.columns.map(col => {
                const t = getColumnType(col.type);
                return (
                  <React.Fragment key={col.id}>
                    <dt className="min-h-9 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 min-w-0">
                      <ColumnIcon name={t.icon} size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate" title={col.name}>{col.name}</span>
                    </dt>
                    <dd className={`${col.type === 'long_text' ? 'min-h-9' : 'h-9'} min-w-0 flex items-stretch rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group/row ${ALIGN_LEFT}`}>
                      <BoardCell column={col} value={current.cells?.[col.id]} people={data.people} me={data.me} item={current} columns={data.columns}
                        onChange={(v) => data.updateCell(current.id, col.id, v)} onUpdateColumn={data.updateColumn} />
                    </dd>
                  </React.Fragment>
                );
              })}
            </dl>
          )}
          {can.addColumns && (
            <AddColumnMenu onAdd={data.addColumn} align="left" triggerClassName="inline-block mt-2"
              trigger={
                <button type="button" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 px-2 py-1 -mx-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Plus size={15} aria-hidden="true" /> {tr('Dodaj pole (status, priorytet, tagi, pliki…)')}
                </button>
              } />
          )}
        </section>

        {/* Opis */}
        <section>
          <label htmlFor={`${ids}-desc`} className={`block ${SECTION}`}>{tr('Opis')}</label>
          <textarea id={`${ids}-desc`} data-item-desc="1" value={descLocal} readOnly={!can.editItems}
            onChange={(e) => setDescLocal(e.target.value)} onBlur={commitDesc}
            placeholder={can.editItems ? tr('Dodaj opis, kontekst, linki…') : ''} rows={3}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-white text-sm resize-y min-h-[72px]" />
        </section>

        {/* Podzadania (w podzadaniu też — zagnieżdżanie jak w tabeli) */}
        {(subitems.length > 0 || can.createItems) && (
          <section aria-labelledby={`${ids}-subs`}>
            <h3 id={`${ids}-subs`} className={SECTION}>
              {tr(W.subs)} {subitems.length > 0 && <span className="font-normal tabular-nums">({subitems.length})</span>}
            </h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {subitems.map(sub => (
                <SubitemRow key={sub.id} sub={sub} statusCol={statusCol} placeholder={tr(terms.sub || 'Podzadanie')}
                  subCount={data.items.filter(i => i.parent_item_id === sub.id).length}
                  canEdit={!!can.editItems} canDelete={!!can.deleteItems}
                  onRename={(id, n) => data.updateItem(id, { name: n })}
                  onCell={data.updateCell} onUpdateColumn={data.updateColumn} onDelete={removeSub} onOpen={openSubitem} />
              ))}
            </div>
            {can.createItems && (
              <div className="flex items-center gap-2 mt-1">
                <Plus size={14} className="text-gray-400 shrink-0" aria-hidden="true" />
                <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }}
                  placeholder={tr(W.addSub)} aria-label={tr(W.addSub)}
                  className="flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400 py-1" />
                {newSub.trim() && <Button size="sm" variant="ghost" onClick={addSub}>{tr('Dodaj')}</Button>}
              </div>
            )}
          </section>
        )}

        {/* Komentarze / Aktywność */}
        <section>
          <div className="seg-bar mb-4" role="group" aria-label={tr('Komentarze i aktywność')}>
            <button type="button" className="seg-btn" aria-pressed={tab === 'updates'} onClick={() => setTab('updates')}>
              <MessageSquare size={15} aria-hidden="true" /> {tr('Komentarze')}
              {updates.length > 0 && <span className="text-xs text-gray-500 tabular-nums">{updates.length}</span>}
            </button>
            <button type="button" className="seg-btn" aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}>
              <Activity size={15} aria-hidden="true" /> {tr('Aktywność')}
            </button>
          </div>

          {tab === 'updates' && (
            <div>
              {can.comment && <Composer people={data.people || []} placeholder={tr('Napisz komentarz...')} onSend={(t, m) => addUpdate(t, m)} />}
              <div className="mt-2">
                {loading ? <Spinner center size={20} /> : roots.length === 0 ? (
                  <EmptyState compact icon={MessageSquare} title={tr('Brak komentarzy')} />
                ) : roots.map(u => (
                  <UpdateItem key={u.id} u={u} replies={repliesOf(u.id)} people={data.people || []} personOf={personOf} userEmail={userEmail} can={can}
                    onLike={toggleLike} onDelete={onDeleteComment} onReply={(t, m, pid) => addUpdate(t, m, pid)} />
                ))}
              </div>
            </div>
          )}
          {tab === 'activity' && (
            loading ? <Spinner center size={20} /> : activity.length === 0 ? (
              <EmptyState compact icon={Activity} title={tr('Brak historii aktywności')} />
            ) : (
              <ol className="space-y-3">
                {activity.map(a => {
                  const who = personOf(a.actor_email, a.actor_name);
                  return (
                    <li key={a.id} className="flex items-start gap-2.5 text-sm">
                      <Avatar person={who} size={24} />
                      <div className="min-w-0">
                        <span className="font-medium text-gray-800 dark:text-gray-100">{who.name}</span>{' '}
                        <span className="text-gray-600 dark:text-gray-300">{activityText(a)}</span>
                        <div><Time iso={a.created_at} /></div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )
          )}
        </section>
      </div>
    </Modal>
  );
}
