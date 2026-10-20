import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Circle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { getInitials, stringToColor } from '../../../utils/text';
import { brandTone } from '../../../lib/brandTone';
import { toast } from '../../../lib/toast';
import { openOrCreateDirect } from '../../Komunikator/utils/directConversation';
import { thumbUrl } from '../../../lib/imageThumb';
import { presenceState, presenceByEmail, PRESENCE_ORDER } from '@avenit/shared/src/lib/presence.js';

// Kolory statusów (reguła stanów: @avenit/shared/src/lib/presence.js — wspólna z mobilką)
const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  recent: 'bg-gray-300 dark:bg-gray-600',
  offline: 'bg-gray-400'
};

// Etykieta pod nazwiskiem: online / zaraz wracam / „12 min temu”.
function statusText(status, lastSeen) {
  if (status === 'online') return tr('Online');
  if (status === 'away') return tr('Zaraz wracam');
  const min = Math.floor(Math.max(0, Date.now() - new Date(lastSeen || 0).getTime()) / 60000);
  if (min < 1) return tr('przed chwilą');
  return min < 60 ? tr('{n} min temu', { n: min }) : tr('{n} godz. temu', { n: Math.floor(min / 60) });
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

      // Mapuj presence do użytkowników (e-maile bez względu na wielkość liter)
      const presenceMap = presenceByEmail(presenceData);
      const now = Date.now();
      const usersWithStatus = (users || []).map(user => {
        const presence = presenceMap.get(String(user.email || '').toLowerCase());
        return { ...user, presence, calculatedStatus: presenceState(presence, now) };
      });

      // Online / zaraz wracam / ostatnio aktywni (do godziny) — od najświeższych
      const active = usersWithStatus
        .filter(u => u.calculatedStatus !== 'offline')
        .sort((a, b) => (PRESENCE_ORDER[a.calculatedStatus] - PRESENCE_ORDER[b.calculatedStatus])
          || (new Date(b.presence?.last_seen || 0) - new Date(a.presence?.last_seen || 0)));

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

  // Otwórz istniejącą rozmowę 1:1 (także z archiwum) albo załóż nową — wspólna logika Komunikatora
  // (dawniej każde kliknięcie mogło zakładać kolejną pustą rozmowę z tą samą osobą).
  const handleUserClick = async (targetEmail) => {
    try {
      const { id } = await openOrCreateDirect(userEmail, targetEmail);
      navigate(`/komunikator?conversation=${id}`);
    } catch (err) {
      console.error('Error opening conversation:', err);
      toast.error(err, { fallback: tr('Nie udało się otworzyć rozmowy. Spróbuj ponownie.') });
    }
  };

  if (loading) {
    return <Spinner center />;
  }

  const onlineCount = activeUsers.filter(u => u.calculatedStatus === 'online').length;
  const awayCount = activeUsers.filter(u => u.calculatedStatus === 'away').length;
  const recentCount = activeUsers.filter(u => u.calculatedStatus === 'recent').length;

  return (
    <div className="space-y-4">
      {/* Podsumowanie */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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
              <span className="font-semibold text-gray-800 dark:text-white">{awayCount}</span> {tr('zaraz wraca')}
            </span>
          </div>
        )}
        {recentCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Circle size={8} className="fill-gray-300 text-gray-300 dark:fill-gray-600 dark:text-gray-600" />
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-800 dark:text-white">{recentCount}</span> {tr('w ostatniej godzinie')}
            </span>
          </div>
        )}
      </div>

      {/* Lista użytkowników */}
      {activeUsers.length === 0 ? (
        <EmptyState compact icon={Users} title={tr('Nikt nie był aktywny w ostatniej godzinie')} />
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
          {activeUsers.map(user => {
            const status = user.calculatedStatus;
            const statusColor = statusColors[status];
            const statusLabel = statusText(status, user.presence?.last_seen);

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
                      src={thumbUrl(user.avatar_url, 40)}
                      alt={user.full_name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
                    />
                  ) : (
                    <div
                      data-tone={brandTone(user.email)}
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
                  <div className="p-1.5 rounded-lg bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white">
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
