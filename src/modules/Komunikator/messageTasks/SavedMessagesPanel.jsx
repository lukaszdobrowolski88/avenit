// „Zapisane” — moje zapisane wiadomości ze wszystkich rozmów (saved_messages, migracja 114):
// nadawca, rozmowa, data, treść albo rodzaj załącznika. Klik → rozmowa na tej wiadomości.
// Wiadomości, do których straciłem dostęp (opuszczona rozmowa) albo usunięte — niewidoczne.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, BookmarkMinus, Image, Paperclip, Mic, AlertTriangle, RefreshCw } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import UserAvatar from '../components/UserAvatar';
import { loadSavedMessages, unsaveMessage, savedPreview, conversationLabel } from './api';

const fmt = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(appLocale(), { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
};
const ATT_ICON = { image: Image, voice: Mic, file: Paperclip };

export default function SavedMessagesPanel({ isOpen, onClose, conversations = [], onOpenMessage }) {
  const [rows, setRows] = useState(null); // null = wczytywanie
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      setRows(await loadSavedMessages());
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);
  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const convById = useMemo(() => new Map((conversations || []).map((c) => [String(c.id), c])), [conversations]);

  const remove = async (row) => {
    setBusy(row.saved.id);
    try {
      await unsaveMessage(row.message.id);
      setRows((prev) => (prev || []).filter((r) => r.saved.id !== row.saved.id));
      toast.success(tr('Usunięto z zapisanych'));
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się usunąć z zapisanych.') });
    } finally {
      setBusy(null);
    }
  };

  if (!isOpen) return null;

  let body;
  if (rows === null) body = <Spinner center label={tr('Ładowanie zapisanych...')} />;
  else if (error) {
    body = (
      <EmptyState compact icon={AlertTriangle} title={tr('Nie udało się wczytać zapisanych wiadomości')}
        action={<Button variant="outline" size="sm" icon={RefreshCw} onClick={load}>{tr('Spróbuj ponownie')}</Button>} />
    );
  } else if (!rows.length) {
    body = (
      <EmptyState compact icon={Bookmark} title={tr('Brak zapisanych wiadomości')}
        subtitle={tr('Zapisz ważną wiadomość z menu „Więcej działań”, żeby szybko do niej wrócić.')} />
    );
  } else {
    body = (
      <ul className="space-y-2">
        {rows.map((r) => {
          const m = r.message;
          const conv = convById.get(String(m.conversation_id));
          const p = savedPreview(m);
          const AttIcon = p.kind ? ATT_ICON[p.kind] : null;
          const sender = r.sender?.full_name || m.sender_email;
          return (
            <li key={r.saved.id} className="group relative rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <button type="button" onClick={() => { onOpenMessage?.(m.conversation_id, m.id, m.thread_root_id || null); onClose?.(); }}
                className="w-full text-left flex items-start gap-3 p-3 pr-12 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                <UserAvatar user={{ email: m.sender_email, full_name: sender, avatar_url: r.sender?.avatar_url }} size="sm" className="flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{sender}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{fmt(m.created_at)}</span>
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                    {conv ? conversationLabel(conv) : tr('Rozmowa')}
                  </span>
                  {p.text && <span className="block mt-1 text-sm text-gray-700 dark:text-gray-200 line-clamp-3 break-words">{p.text}</span>}
                  {p.attLabel && (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      {AttIcon && <AttIcon size={12} aria-hidden="true" />}{p.attLabel}
                    </span>
                  )}
                  {r.saved.note && <span className="block mt-1 text-xs italic text-gray-500 dark:text-gray-400">{r.saved.note}</span>}
                </span>
              </button>
              <button type="button" onClick={() => remove(r)} disabled={busy === r.saved.id}
                aria-label={tr('Usuń z zapisanych')} title={tr('Usuń z zapisanych')}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-gray-700 transition disabled:opacity-50">
                <BookmarkMinus size={15} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tr('Zapisane wiadomości')} icon={Bookmark} size="md">
      <div className="px-4 py-3">{body}</div>
    </Modal>
  );
}
