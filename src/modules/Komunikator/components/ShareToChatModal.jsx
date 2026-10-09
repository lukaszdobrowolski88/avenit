// „Wyślij do czatu”: wiadomość z nazwą zadania i linkiem do niego (taskItemLink — ta sama reguła co
// w powiadomieniach, pełny adres) do wybranej rozmowy, w której jestem i mogę pisać.
// Rozmowy z useConversations (cache + świeża lista); wysyłka = zwykły insert do messages,
// push/wzmianki obsługuje serwer (push-hooks), jak przy każdej wiadomości.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Send, Users, Megaphone } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useAppModules } from '../../../hooks/useAppModules';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import useConversations from '../hooks/useConversations';
import UserAvatar from './UserAvatar';
import { canPostIn, sameEmail } from '../utils/chatLogic';
import { getMinistryName } from '../utils/messageHelpers';

// Kto może udostępniać do czatu: dostęp do Komunikatora.
export function useCanShareToChat() {
  const { can } = usePermissions();
  return can('module:komunikator');
}

// Pełny adres zadania (link działa też poza aplikacją — z powiadomienia, w mailu, na telefonie).
export function absoluteTaskUrl(board, itemId, modules = [], origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  const paths = {};
  for (const m of modules || []) if (m?.key && typeof m.path === 'string') paths[m.key] = m.path;
  return `${origin}${taskItemLink(board, itemId, paths)}`;
}

// Treść wiadomości: (komentarz) + „Zadanie: nazwa” + link.
export function shareMessageText({ name, url, note = '' }) {
  const head = tr('Zadanie: {name}', { name: String(name || '').trim() || tr('Bez nazwy') });
  return [String(note || '').trim(), head, url].filter(Boolean).join('\n');
}

const convName = (c) => (c.type === 'ministry' ? (getMinistryName(c.ministry_key) || c.name) : (c.displayName || c.name || tr('Rozmowa')));

export default function ShareToChatModal({ board, item, userEmail, onClose }) {
  const navigate = useNavigate();
  const { modules } = useAppModules();
  const { conversations, loading } = useConversations(userEmail, { canManageOwn: false });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const url = absoluteTaskUrl(board, item?.id, modules);
  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (conversations || [])
      .filter((c) => !c.archived && canPostIn(c))
      .filter((c) => !q || convName(c).toLowerCase().includes(q));
  }, [conversations, query]);

  const send = async () => {
    if (!selected || !userEmail) return;
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: selected,
        sender_email: userEmail,
        content: shareMessageText({ name: item?.name, url, note }),
        attachments: [],
      }).select().single();
      if (error) throw error;
      const convId = selected;
      toast.success({
        message: tr('Wysłano do czatu'),
        action: { label: tr('Otwórz rozmowę'), onClick: () => navigate(`/komunikator?conversation=${encodeURIComponent(String(convId))}`) },
      });
      onClose();
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się wysłać wiadomości.') });
    } finally {
      setSending(false);
    }
  };

  const icon = (c) => {
    if (c.type === 'direct') {
      const other = c.participants?.find((p) => !sameEmail(p.user_email, userEmail));
      return <UserAvatar user={other || { full_name: c.displayName }} size="sm" />;
    }
    const Icon = c.type === 'announcement' ? Megaphone : Users;
    return (
      <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 flex items-center justify-center shrink-0" aria-hidden="true">
        <Icon size={14} />
      </span>
    );
  };

  return (
    <Modal isOpen onClose={onClose} closeOnBackdrop={false} icon={Send} title={tr('Wyślij do czatu')} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Send} onClick={send} disabled={!selected} loading={sending}>{tr('Wyślij')}</Button>
      </>}>
      <div className="px-6 pt-4 pb-3 space-y-3 border-b border-gray-100 dark:border-gray-800">
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{item?.name || tr('Bez nazwy')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{url}</p>
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} aria-label={tr('Wiadomość (opcjonalnie)')}
          placeholder={tr('Dodaj wiadomość (opcjonalnie)')}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 resize-none outline-none focus:ring-2 focus:ring-gray-300/60 dark:focus:ring-gray-600/60" />
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Szukaj rozmowy...')} aria-label={tr('Szukaj rozmowy')}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-300/60 dark:focus:ring-gray-600/60" />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto px-3 py-2 custom-scrollbar" role="radiogroup" aria-label={tr('Rozmowa')}>
        {loading && !targets.length ? (
          <Spinner center />
        ) : !targets.length ? (
          <EmptyState compact icon={Search} title={tr('Brak rozmów, w których możesz pisać')} />
        ) : targets.map((c) => {
          const active = selected === c.id;
          return (
            <button key={c.id} type="button" role="radio" aria-checked={active} onClick={() => setSelected(c.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left mb-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 ${active ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}>
              {icon(c)}
              <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{convName(c)}</span>
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-gray-800 dark:border-gray-100 bg-gray-800 dark:bg-gray-100' : 'border-gray-300 dark:border-gray-600'}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
