import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ChevronRight, Inbox } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { getInitials, stringToColor } from '../../../utils/text';
import { brandTone } from '../../../lib/brandTone';
import { getMinistryName } from '../../Komunikator/utils/messageHelpers';
import {
  emailPattern, normEmail, sameEmail, readSince, unreadSummary, previewText, channelName,
} from '../../Komunikator/utils/chatLogic';

// Widżet „Nieprzeczytane wiadomości” (K11): stała liczba zapytań niezależnie od liczby rozmów —
// mój skład, rozmowy, JEDNA paczka nieprzeczytanych wiadomości (bez usuniętych), druga osoba
// rozmów 1:1 i nazwiska. Dawniej: osobne zapytania dla każdej rozmowy przy każdej wiadomości.
const UNREAD_LIMIT = 500;

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return tr('teraz');
  if (diffMins < 60) return tr('{n} min', { n: diffMins });
  if (diffHours < 24) return tr('{n} godz.', { n: diffHours });
  if (diffDays < 7) return tr('{n} dni', { n: diffDays });
  return date.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
}

export async function fetchUnreadConversations(userEmail) {
  // 1) Moje rozmowy (bez zarchiwizowanych — jak licznik w Komunikatorze)
  const { data: mine, error: partError } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, joined_at, archived')
    .ilike('user_email', emailPattern(userEmail));
  if (partError) throw partError;
  const active = (mine || []).filter(p => !p.archived);
  if (!active.length) return [];
  const ids = active.map(p => p.conversation_id);
  const sinceByConv = {};
  active.forEach(p => { sinceByConv[String(p.conversation_id)] = readSince(p); });
  const sinceValues = Object.values(sinceByConv);
  const minSince = sinceValues.some(v => !v)
    ? null
    : sinceValues.reduce((min, v) => (!min || new Date(v) < new Date(min) ? v : min), null);

  // 2) Jedna paczka najnowszych cudzych wiadomości nowszych niż najstarsze „przeczytane”.
  let q = supabase
    .from('messages')
    .select('id, conversation_id, content, sender_email, created_at, message_type, attachments, deleted_at')
    .in('conversation_id', ids)
    .is('deleted_at', null);
  if (minSince) q = q.gt('created_at', minSince);
  const { data: rows, error: msgError } = await q.order('created_at', { ascending: false }).limit(UNREAD_LIMIT);
  if (msgError) throw msgError;
  const summary = unreadSummary(rows || [], userEmail, sinceByConv);
  const unreadIds = Object.keys(summary);
  if (!unreadIds.length) return [];

  // 3) Rozmowy z nieprzeczytanymi + druga osoba rozmów 1:1 + nazwiska — razem 3 zapytania.
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, type, name, ministry_key, updated_at')
    .in('id', unreadIds);
  const directIds = (convs || []).filter(c => c.type === 'direct').map(c => c.id);
  const { data: directParts } = directIds.length
    ? await supabase.from('conversation_participants').select('conversation_id, user_email').in('conversation_id', directIds)
    : { data: [] };
  const otherByConv = {};
  (directParts || []).forEach(p => { if (!sameEmail(p.user_email, userEmail)) otherByConv[String(p.conversation_id)] = p.user_email; });
  const emails = [...new Set([
    ...Object.values(summary).map(s => s.last?.sender_email),
    ...Object.values(otherByConv),
  ].filter(Boolean))];
  const { data: users } = emails.length
    ? await supabase.from('app_users').select('email, full_name, avatar_url').in('email', [...new Set(emails.flatMap(e => [e, normEmail(e)]))])
    : { data: [] };
  const userOf = {};
  (users || []).forEach(u => { userOf[normEmail(u.email)] = u; });

  return (convs || []).map(conv => {
    const s = summary[String(conv.id)];
    const last = s.last;
    const senderUser = userOf[normEmail(last?.sender_email)];
    let name = conv.name;
    if (conv.type === 'direct') {
      const other = otherByConv[String(conv.id)];
      name = userOf[normEmail(other)]?.full_name || other?.split('@')[0] || name;
    } else if (conv.type === 'ministry') {
      name = channelName(conv, getMinistryName);
    }
    return {
      id: conv.id,
      type: conv.type,
      name,
      unreadCount: s.count,
      lastMessage: last ? {
        content: previewText(last, tr),
        senderEmail: last.sender_email,
        sender: { email: last.sender_email, full_name: senderUser?.full_name, avatar_url: senderUser?.avatar_url },
        createdAt: last.created_at,
      } : null,
      updatedAt: conv.updated_at,
    };
  }).sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt) - new Date(a.lastMessage?.createdAt || a.updatedAt));
}

export default function UnreadMessagesWidget({ userEmail }) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!userEmail) { setLoading(false); return undefined; }
    let alive = true;
    const load = async () => {
      try {
        const list = await fetchUnreadConversations(userEmail);
        if (alive) setConversations(list);
      } catch (err) {
        console.error('Error fetching unread conversations:', err);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();

    // Nowe wiadomości / „przeczytane” z innego miejsca — odśwież z opóźnieniem (seria zdarzeń = 1 odczyt).
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(load, 1500);
    };
    const subscription = supabase
      .channel('unread-messages-widget')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, schedule)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, (payload) => {
        if (sameEmail(payload?.new?.user_email, userEmail)) schedule();
      })
      .subscribe();

    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(subscription);
    };
  }, [userEmail]);

  const totalUnread = useMemo(() => conversations.reduce((sum, conv) => sum + conv.unreadCount, 0), [conversations]);

  const handleConversationClick = (conversationId) => navigate(`/komunikator?conversation=${conversationId}`);
  const handleOpenMessenger = () => navigate('/komunikator');

  if (loading) {
    return <Spinner center />;
  }

  const renderSenderAvatar = (conv) => {
    const sender = conv.lastMessage?.sender;
    if (sender?.avatar_url) {
      return (
        <img
          src={sender.avatar_url}
          alt={sender.full_name || tr('Nadawca')}
          className="w-10 h-10 rounded-full object-cover"
        />
      );
    }
    return (
      <div
        data-tone={brandTone(sender?.email || conv.name)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
        style={{ backgroundColor: stringToColor(sender?.email || conv.name) }}
      >
        {getInitials(sender?.full_name || sender?.email || conv.name)}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {totalUnread > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 text-xs font-bold">
              {totalUnread > 99 ? '99+' : totalUnread}
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {totalUnread === 1 ? tr('nieprzeczytana wiadomość') : tr('nieprzeczytanych wiadomości')}
            </span>
          </div>
        </div>
      )}

      {conversations.length === 0 ? (
        <EmptyState compact icon={Inbox} title={tr('Wszystko przeczytane!')} subtitle={tr('Nie masz nowych wiadomości')} />
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
          {conversations.slice(0, 5).map(conv => {
            const sender = conv.lastMessage?.sender;
            const senderName = sender?.full_name || sender?.email?.split('@')[0] || tr('Nieznany nadawca');

            return (
              <button
                type="button"
                key={conv.id}
                onClick={() => handleConversationClick(conv.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
              >
                <div className="relative flex-shrink-0">
                  {renderSenderAvatar(conv)}
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-800 dark:text-white truncate text-sm">
                      {senderName}
                    </p>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {formatMessageTime(conv.lastMessage?.createdAt)}
                    </span>
                  </div>
                  {conv.lastMessage && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {conv.lastMessage.content}
                    </p>
                  )}
                  {conv.type !== 'direct' && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {tr('w: {name}', { name: conv.name || '' })}
                    </p>
                  )}
                </div>

                <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {conversations.length > 5 && (
        <button
          type="button"
          onClick={handleOpenMessenger}
          className="w-full text-center py-2 text-sm text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
        >
          {tr('Zobacz wszystkie ({n})', { n: conversations.length })}
        </button>
      )}

      {conversations.length > 0 && conversations.length <= 5 && (
        <button
          type="button"
          onClick={handleOpenMessenger}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
        >
          <MessageCircle size={16} />
          {tr('Otwórz komunikator')}
        </button>
      )}
    </div>
  );
}
