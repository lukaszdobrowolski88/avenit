import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { X, Bell, BellOff, Loader, AlertTriangle, MessagesSquare } from 'lucide-react';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import useReactions from '../hooks/useReactions';
import { sameEmail } from '../utils/chatLogic';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import useThread from './useThread';
import { replyCountLabel } from './threadLogic';

// Błąd już pokazany (MessageInput nie pokaże drugiego komunikatu).
const handled = (err) => {
  const e = err && typeof err === 'object' ? err : new Error(String(err));
  try { e.handled = true; } catch { /* zamrożony obiekt */ }
  return e;
};

// Panel wątku po prawej (jak w Slacku): wiadomość główna, odpowiedzi i własne pole pisania.
// Na wąskim ekranie zajmuje cały widok rozmowy. Obserwowanie: powiadomienia o nowych odpowiedziach.
export default function ThreadPanel({
  conversation,
  rootId,
  initialRoot = null,
  userEmail,
  participants = [],
  canPost = false,
  canMentionAll = false,
  canEditOwn = true,
  nameOf,
  onClose,
  // „Przypomnij mi” o wiadomości wątku (okno wyboru terminu trzyma rozmowa).
  onRemind,
  // Dodatkowe pozycje menu wiadomości (message → [{ key, label, icon, onClick }]) — „Zapisz”,
  // „Utwórz zadanie” (migracja 114); okna trzyma rozmowa.
  extraActionsFor,
}) {
  const { root, replies, loading, error, following, sendReply, editReply, deleteReply, setFollowing, refetch } =
    useThread(conversation?.id, rootId, userEmail, { initialRoot });
  const { fetchReactions, toggleReaction, getReactionsForMessage } = useReactions(conversation?.id, userEmail);
  const endRef = useRef(null);
  const listRef = useRef(null);

  const userOf = useCallback((email) => {
    const p = participants.find((x) => sameEmail(x.user_email, email));
    return p ? { ...p, email: p.user_email } : { email };
  }, [participants]);
  const withSender = useCallback((m) => (m ? { ...m, sender: m.sender || userOf(m.sender_email) } : m), [userOf]);

  const rootMsg = useMemo(() => withSender(root), [root, withSender]);
  const list = useMemo(() => replies.map(withSender), [replies, withSender]);

  useEffect(() => {
    const ids = [rootId, ...replies.map((m) => m.id)].filter(Boolean);
    if (ids.length) fetchReactions(ids);
  }, [rootId, replies, fetchReactions]);

  // Nowa odpowiedź — przewiń na dół panelu.
  const lastId = replies[replies.length - 1]?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [lastId]);

  // Esc zamyka panel (poza polami edycji).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tag = String(e.target?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input') return;
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async (content, attachments, replyToId, extra) => {
    try {
      await sendReply(content, attachments, replyToId, extra);
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wysłać odpowiedzi. Spróbuj ponownie.') });
      throw handled(err);
    }
  };
  const handleEdit = async (id, content) => {
    try { await editReply(id, content); } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać zmian w wiadomości.') });
      throw handled(err);
    }
  };
  const handleDelete = async (id) => {
    try { await deleteReply(id); toast.success(tr('Wiadomość usunięta')); } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się usunąć wiadomości.') });
      throw handled(err);
    }
  };
  const toggleFollow = async () => {
    try {
      await setFollowing(!following);
      toast.success(following ? tr('Nie obserwujesz już tego wątku') : tr('Obserwujesz ten wątek'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zmienić obserwowania wątku.') });
    }
  };

  const bubbleProps = (m) => {
    const isOwn = sameEmail(m.sender_email, userEmail);
    return {
      message: m,
      isOwn,
      currentUserEmail: userEmail,
      nameOf,
      onToggleReaction: toggleReaction,
      reactions: getReactionsForMessage(m.id),
      onEdit: isOwn && canEditOwn ? handleEdit : undefined,
      onDelete: isOwn && canEditOwn && m.id !== rootId ? handleDelete : undefined,
      onRemind: m.message_type === 'system' ? undefined : onRemind,
      extraActions: extraActionsFor ? extraActionsFor(m) : null,
    };
  };

  const placeName = conversation?.displayName || conversation?.name || '';

  return (
    <aside
      role="complementary"
      aria-label={tr('Wątek')}
      className="absolute inset-y-0 right-0 z-40 w-full sm:w-[400px] flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200/70 dark:border-gray-700/60 shadow-xl"
    >
      <header className="flex items-center gap-2 px-4 py-3 bg-white/90 dark:bg-gray-900/90 border-b border-gray-200/60 dark:border-gray-700/60">
        <MessagesSquare size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{tr('Wątek')}</h2>
          {placeName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{placeName}</p>}
        </div>
        <button
          type="button"
          onClick={toggleFollow}
          aria-pressed={following}
          title={following ? tr('Nie dostaniesz powiadomień o nowych odpowiedziach') : tr('Dostaniesz powiadomienia o nowych odpowiedziach')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${following
            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200/70 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          {following ? <Bell size={13} aria-hidden="true" /> : <BellOff size={13} aria-hidden="true" />}
          {following ? tr('Obserwujesz') : tr('Obserwuj')}
        </button>
        <button type="button" onClick={onClose} aria-label={tr('Zamknij wątek')} title={tr('Zamknij wątek')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">
          <X size={18} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && !rootMsg ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400 gap-2" role="status">
            <Loader size={16} className="animate-spin" /> {tr('Ładowanie wątku…')}
          </div>
        ) : error || !rootMsg ? (
          <div className="flex flex-col items-center justify-center text-center py-10" role="alert">
            <AlertTriangle size={28} className="text-gray-400 mb-3" aria-hidden="true" />
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              {rootMsg ? tr('Nie udało się wczytać odpowiedzi.') : tr('Nie znaleziono tego wątku — wiadomość mogła zostać usunięta.')}
            </p>
            <button type="button" onClick={() => refetch()} className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700">
              {tr('Spróbuj ponownie')}
            </button>
          </div>
        ) : (
          <>
            <MessageBubble {...bubbleProps(rootMsg)} />
            <div className="flex items-center gap-3 my-4" aria-live="polite">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {list.length ? replyCountLabel(list.length) : tr('Jeszcze nikt nie odpowiedział')}
              </span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="space-y-3">
              {list.map((m, idx) => {
                const prev = list[idx - 1];
                const showAvatar = !prev || !sameEmail(prev.sender_email, m.sender_email);
                return <MessageBubble key={m.id} {...bubbleProps(m)} showAvatar={showAvatar} />;
              })}
            </div>
            {!list.length && canPost && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">{tr('Odpowiedz jako pierwszy(a) — autor wiadomości dostanie powiadomienie.')}</p>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      {rootMsg && !rootMsg.deleted_at && (
        <MessageInput
          onSend={handleSend}
          conversationId={conversation?.id}
          draftKey={`thread_${rootId}`}
          richTypes={false}
          placeholder={tr('Odpowiedz w wątku…')}
          participants={participants}
          currentUserEmail={userEmail}
          canPost={canPost}
          canMentionAll={canMentionAll}
        />
      )}
    </aside>
  );
}
