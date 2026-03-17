import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Music, Zap, Sparkles, Baby, Home, Heart, UserCheck, Shield, ChevronRight, Inbox } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// Helper do generowania koloru z emaila
function stringToColor(str) {
  if (!str) return '#6366f1';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'
  ];
  return colors[Math.abs(hash) % colors.length];
}

// Helper do pobierania inicjałów
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Ikony dla kanałów służb
const ministryIcons = {
  worship_team: Music,
  media_team: Zap,
  atmosfera_team: Sparkles,
  kids_ministry: Baby,
  home_groups: Home,
  youth_ministry: Users,
  prayer_team: Heart,
  welcome_team: UserCheck,
  small_groups: Home,
  admin_team: Shield,
};

// Nazwy służb
const ministryNames = {
  worship_team: 'Grupa Uwielbienia',
  media_team: 'Media Team',
  atmosfera_team: 'Atmosfera',
  kids_ministry: 'Małe SchWro',
  home_groups: 'Grupy Domowe',
  youth_ministry: 'Młodzieżówka',
  prayer_team: 'Centrum Modlitwy',
  welcome_team: 'Welcome Team',
  admin_team: 'Administracja',
};

// Formatowanie daty
function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'teraz';
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours} godz.`;
  if (diffDays < 7) return `${diffDays} dni`;
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

// Skróć tekst
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export default function UnreadMessagesWidget({ userEmail }) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pobierz konwersacje z nieprzeczytanymi wiadomościami
  useEffect(() => {
    const fetchUnreadConversations = async () => {
      if (!userEmail) return;

      try {
        // Pobierz konwersacje użytkownika z uczestnikami
        const { data: participations, error: partError } = await supabase
          .from('conversation_participants')
          .select(`
            conversation_id,
            last_read_at,
            conversations (
              id,
              type,
              name,
              ministry_key,
              updated_at
            )
          `)
          .eq('user_email', userEmail);

        if (partError) throw partError;

        const unreadConvs = [];

        for (const part of participations || []) {
          const conv = part.conversations;
          if (!conv) continue;

          // Policz nieprzeczytane wiadomości
          let query = supabase
            .from('messages')
            .select('id, content, sender_email, created_at', { count: 'exact' })
            .eq('conversation_id', conv.id)
            .neq('sender_email', userEmail)
            .order('created_at', { ascending: false })
            .limit(1);

          if (part.last_read_at) {
            query = query.gt('created_at', part.last_read_at);
          }

          const { data: messages, count, error: msgError } = await query;
          if (msgError) continue;

          if (count > 0) {
            // Pobierz uczestników dla konwersacji direct
            let displayName = conv.name;
            let otherParticipant = null;

            if (conv.type === 'direct') {
              const { data: participants } = await supabase
                .from('conversation_participants')
                .select('user_email, users(full_name, avatar_url)')
                .eq('conversation_id', conv.id)
                .neq('user_email', userEmail)
                .limit(1);

              if (participants?.[0]) {
                otherParticipant = {
                  email: participants[0].user_email,
                  full_name: participants[0].users?.full_name,
                  avatar_url: participants[0].users?.avatar_url
                };
                displayName = otherParticipant.full_name || otherParticipant.email?.split('@')[0];
              }
            } else if (conv.type === 'ministry') {
              displayName = ministryNames[conv.ministry_key] || conv.name;
            }

            // Pobierz info o nadawcy ostatniej wiadomości (dla wszystkich typów)
            let sender = null;
            if (messages?.[0]) {
              const { data: senderData } = await supabase
                .from('app_users')
                .select('full_name, avatar_url, email')
                .eq('email', messages[0].sender_email)
                .single();
              sender = {
                email: messages[0].sender_email,
                full_name: senderData?.full_name,
                avatar_url: senderData?.avatar_url
              };
            }

            unreadConvs.push({
              id: conv.id,
              type: conv.type,
              name: displayName,
              ministryKey: conv.ministry_key,
              unreadCount: count,
              lastMessage: messages?.[0] ? {
                content: messages[0].content,
                senderEmail: messages[0].sender_email,
                sender,
                createdAt: messages[0].created_at
              } : null,
              otherParticipant,
              updatedAt: conv.updated_at
            });
          }
        }

        // Sortuj po czasie ostatniej wiadomości
        unreadConvs.sort((a, b) => {
          const timeA = a.lastMessage?.createdAt || a.updatedAt;
          const timeB = b.lastMessage?.createdAt || b.updatedAt;
          return new Date(timeB) - new Date(timeA);
        });

        setConversations(unreadConvs);
      } catch (err) {
        console.error('Error fetching unread conversations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUnreadConversations();

    // Subskrypcja na nowe wiadomości
    const subscription = supabase
      .channel('unread-messages-widget')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, () => {
        fetchUnreadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userEmail]);

  // Łączna liczba nieprzeczytanych
  const totalUnread = useMemo(() => {
    return conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
  }, [conversations]);

  // Otwórz konwersację
  const handleConversationClick = (conversationId) => {
    navigate(`/komunikator?conversation=${conversationId}`);
  };

  // Otwórz komunikator
  const handleOpenMessenger = () => {
    navigate('/komunikator');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Renderuj awatar nadawcy wiadomości
  const renderSenderAvatar = (conv) => {
    const sender = conv.lastMessage?.sender;

    if (sender?.avatar_url) {
      return (
        <img
          src={sender.avatar_url}
          alt={sender.full_name || 'Nadawca'}
          className="w-10 h-10 rounded-full object-cover"
        />
      );
    }

    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
        style={{ backgroundColor: stringToColor(sender?.email || conv.name) }}
      >
        {getInitials(sender?.full_name || sender?.email || conv.name)}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header z liczbą */}
      {totalUnread > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 text-white text-xs font-bold">
              {totalUnread > 99 ? '99+' : totalUnread}
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {totalUnread === 1 ? 'nieprzeczytana wiadomość' : 'nieprzeczytanych wiadomości'}
            </span>
          </div>
        </div>
      )}

      {/* Lista konwersacji */}
      {conversations.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Inbox size={24} className="text-green-500" />
          </div>
          <p className="text-gray-600 dark:text-gray-300 font-medium text-sm">
            Wszystko przeczytane!
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            Nie masz nowych wiadomości
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
          {conversations.slice(0, 5).map(conv => {
            const sender = conv.lastMessage?.sender;
            const senderName = sender?.full_name || sender?.email?.split('@')[0] || 'Nieznany';

            return (
              <button
                key={conv.id}
                onClick={() => handleConversationClick(conv.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
              >
                {/* Awatar nadawcy */}
                <div className="relative flex-shrink-0">
                  {renderSenderAvatar(conv)}
                  {/* Unread badge */}
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </span>
                </div>

                {/* Content */}
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
                      {truncateText(conv.lastMessage.content, 40)}
                    </p>
                  )}
                  {/* Nazwa konwersacji dla grup/służb */}
                  {conv.type !== 'direct' && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      w: {conv.name}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-pink-500 transition-colors flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Pokaż więcej */}
      {conversations.length > 5 && (
        <button
          onClick={handleOpenMessenger}
          className="w-full text-center py-2 text-sm text-pink-600 dark:text-pink-400 font-medium hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition-colors"
        >
          Zobacz wszystkie ({conversations.length})
        </button>
      )}

      {/* Przycisk do komunikatora */}
      {conversations.length > 0 && conversations.length <= 5 && (
        <button
          onClick={handleOpenMessenger}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
        >
          <MessageCircle size={16} />
          Otwórz komunikator
        </button>
      )}
    </div>
  );
}
