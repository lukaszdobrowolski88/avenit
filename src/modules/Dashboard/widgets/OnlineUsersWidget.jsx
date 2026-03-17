import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Circle } from 'lucide-react';
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

// Kolory statusów
const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-400'
};

// Etykiety statusów
const statusLabels = {
  online: 'Online',
  away: 'Zaraz wracam',
  offline: 'Offline'
};

// Sprawdź status na podstawie last_seen
function calculateStatus(presence) {
  if (!presence || !presence.last_seen) return 'offline';

  const lastSeenTime = new Date(presence.last_seen).getTime();
  const now = Date.now();
  const timeDiff = now - lastSeenTime;

  // Jeśli ostatnia aktywność była ponad 2 minuty temu, użytkownik jest offline
  if (timeDiff > 120000) {
    return 'offline';
  }

  // Jeśli ostatnia aktywność była ponad 45 sekund temu, oznacz jako away
  if (timeDiff > 45000 && presence.status === 'online') {
    return 'away';
  }

  return presence.status || 'offline';
}

export default function OnlineUsersWidget({ userEmail }) {
  const navigate = useNavigate();
  const [activeUsers, setActiveUsers] = useState([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pobierz użytkowników z ich statusami presence
  const fetchUsersWithPresence = useCallback(async () => {
    if (!userEmail) return;

    try {
      // Pobierz wszystkich użytkowników oprócz bieżącego
      const { data: users, error: usersError } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url')
        .neq('email', userEmail)
        .order('full_name');

      if (usersError) throw usersError;

      // Pobierz statusy presence
      const { data: presenceData, error: presenceError } = await supabase
        .from('user_presence')
        .select('user_email, status, last_seen');

      if (presenceError) throw presenceError;

      // Mapuj presence do użytkowników
      const presenceMap = new Map();
      (presenceData || []).forEach(p => {
        presenceMap.set(p.user_email, { status: p.status, last_seen: p.last_seen });
      });

      // Oblicz rzeczywiste statusy i filtruj
      const usersWithStatus = (users || []).map(user => ({
        ...user,
        presence: presenceMap.get(user.email),
        calculatedStatus: calculateStatus(presenceMap.get(user.email))
      }));

      // Filtruj aktywnych (online/away) i sortuj
      const active = usersWithStatus
        .filter(u => u.calculatedStatus === 'online' || u.calculatedStatus === 'away')
        .sort((a, b) => {
          const statusOrder = { online: 0, away: 1 };
          return statusOrder[a.calculatedStatus] - statusOrder[b.calculatedStatus];
        });

      const offline = usersWithStatus.filter(u => u.calculatedStatus === 'offline').length;

      setActiveUsers(active);
      setOfflineCount(offline);
    } catch (err) {
      console.error('Error fetching users with presence:', err);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Pobierz dane przy starcie i odświeżaj co 15 sekund
  useEffect(() => {
    fetchUsersWithPresence();

    // Odświeżaj dane co 15 sekund
    const interval = setInterval(fetchUsersWithPresence, 15000);

    // Subskrypcja real-time na zmiany presence
    const subscription = supabase
      .channel('online-users-widget-presence')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_presence'
      }, () => {
        // Przy każdej zmianie presence odśwież dane
        fetchUsersWithPresence();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(subscription);
    };
  }, [fetchUsersWithPresence]);

  // Utwórz lub znajdź konwersację i nawiguj do niej
  const handleUserClick = async (targetEmail) => {
    try {
      // Szukaj istniejącej konwersacji direct
      const { data: existingConvs } = await supabase
        .from('conversations')
        .select(`
          id,
          conversation_participants!inner (user_email)
        `)
        .eq('type', 'direct');

      // Znajdź konwersację, w której są obaj użytkownicy
      let conversationId = null;

      if (existingConvs) {
        for (const conv of existingConvs) {
          const participants = conv.conversation_participants.map(p => p.user_email);
          if (participants.includes(userEmail) && participants.includes(targetEmail) && participants.length === 2) {
            conversationId = conv.id;
            break;
          }
        }
      }

      // Jeśli nie ma konwersacji, utwórz nową
      if (!conversationId) {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({ type: 'direct' })
          .select()
          .single();

        if (convError) throw convError;

        // Dodaj uczestników
        await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: newConv.id, user_email: userEmail },
            { conversation_id: newConv.id, user_email: targetEmail }
          ]);

        conversationId = newConv.id;
      }

      // Nawiguj do komunikatora z parametrem conversation
      navigate(`/komunikator?conversation=${conversationId}`);
    } catch (err) {
      console.error('Error opening conversation:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const onlineCount = activeUsers.filter(u => u.calculatedStatus === 'online').length;
  const awayCount = activeUsers.filter(u => u.calculatedStatus === 'away').length;

  return (
    <div className="space-y-4">
      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <Circle size={8} className="fill-green-500 text-green-500" />
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-white">{onlineCount}</span> online
          </span>
        </div>
        {awayCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Circle size={8} className="fill-yellow-500 text-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-800 dark:text-white">{awayCount}</span> away
            </span>
          </div>
        )}
      </div>

      {/* Lista użytkowników */}
      {activeUsers.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Users size={24} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Brak aktywnych użytkowników
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
          {activeUsers.map(user => {
            const status = user.calculatedStatus;
            const statusColor = statusColors[status];
            const statusLabel = statusLabels[status];

            return (
              <button
                key={user.email}
                onClick={() => handleUserClick(user.email)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.full_name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ring-2 ring-white dark:ring-gray-800"
                      style={{ backgroundColor: stringToColor(user.email) }}
                    >
                      {getInitials(user.full_name || user.email)}
                    </div>
                  )}
                  {/* Status indicator */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${statusColor} rounded-full border-2 border-white dark:border-gray-900`}
                    title={statusLabel}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 dark:text-white truncate text-sm">
                    {user.full_name || user.email.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {statusLabel}
                  </p>
                </div>

                {/* Action icon */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="p-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-orange-500 text-white">
                    <MessageCircle size={14} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pokaż więcej jeśli są offline */}
      {offlineCount > 0 && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            + {offlineCount} offline
          </p>
        </div>
      )}
    </div>
  );
}
