import React, { useState, useEffect } from 'react';
import { X, Search, User, Users, Check, Megaphone } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import UserAvatar from './UserAvatar';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

export default function NewConversationModal({
  isOpen,
  onClose,
  onCreateDirect,
  onCreateGroup,
  onCreateAnnouncement,
  currentUserEmail
}) {
  const t = useT();
  const [mode, setMode] = useState('direct'); // 'direct' | 'group' | 'announcement'
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // Pobierz listę użytkowników
  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .neq('email', currentUserEmail)
          .order('full_name');

        if (error) throw error;
        setUsers(data || []);
      } catch (err) {
        console.error('Error fetching users:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentUserEmail]);

  // Reset przy zamknięciu
  useEffect(() => {
    if (!isOpen) {
      setMode('direct');
      setSearchQuery('');
      setSelectedUsers([]);
      setGroupName('');
    }
  }, [isOpen]);

  // Filtruj użytkowników
  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  });

  // Wybór użytkownika
  const handleUserSelect = (user) => {
    if (mode === 'direct') {
      // Bezpośrednio utwórz rozmowę
      handleCreateDirect(user.email);
    } else {
      // Toggle selection dla grupy
      setSelectedUsers(prev => {
        const isSelected = prev.some(u => u.email === user.email);
        if (isSelected) {
          return prev.filter(u => u.email !== user.email);
        }
        return [...prev, user];
      });
    }
  };

  // Utwórz rozmowę direct
  const handleCreateDirect = async (email) => {
    setCreating(true);
    try {
      await onCreateDirect(email);
      onClose();
    } catch (err) {
      console.error('Error creating conversation:', err);
      toast.error(t('Nie udało się utworzyć rozmowy'));
    } finally {
      setCreating(false);
    }
  };

  // Utwórz grupę lub kanał ogłoszeń
  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    setCreating(true);
    try {
      const emails = selectedUsers.map(u => u.email);
      if (mode === 'announcement') {
        await onCreateAnnouncement(groupName.trim(), emails);
      } else {
        await onCreateGroup(groupName.trim(), emails);
      }
      onClose();
    } catch (err) {
      console.error('Error creating group:', err);
      toast.error(mode === 'announcement' ? t('Nie udało się utworzyć kanału') : t('Nie udało się utworzyć grupy'));
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      title="Nowa rozmowa"
      size="sm"
      footer={mode !== 'direct' ? (
        /* Stopka - dla grupy i kanału ogłoszeń */
        <>
          <Button variant="secondary" onClick={onClose}>Anuluj</Button>
          <Button
            icon={mode === 'announcement' ? Megaphone : Users}
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || selectedUsers.length === 0}
            loading={creating}
          >
            {mode === 'announcement' ? tr('Utwórz kanał') : tr('Utwórz grupę')} ({selectedUsers.length} {selectedUsers.length === 1 ? tr('osoba') : selectedUsers.length < 5 ? tr('osoby') : tr('osób')})
          </Button>
        </>
      ) : undefined}
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setMode('direct')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
            ${mode === 'direct'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <User size={18} />
          Prywatna
        </button>
        <button
          onClick={() => setMode('group')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
            ${mode === 'group'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <Users size={18} />
          {tr('Grupa')}
        </button>
        <button
          onClick={() => setMode('announcement')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
            ${mode === 'announcement'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <Megaphone size={18} />
          {tr('Ogłoszenia')}
        </button>
      </div>

      {/* Nazwa grupy / kanału */}
      {mode !== 'direct' && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          {mode === 'announcement' && (
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Megaphone size={13} className="text-amber-500" />
              {tr('W kanale ogłoszeń piszą tylko administratorzy. Pozostali czytają i reagują.')}
            </p>
          )}
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={mode === 'announcement' ? t('Nazwa kanału ogłoszeń...') : t('Nazwa grupy...')}
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />

          {/* Wybrani użytkownicy */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedUsers.map(user => (
                <div
                  key={user.email}
                  className="flex items-center gap-1 px-2 py-1 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light rounded-full text-xs"
                >
                  <span>{user.full_name || user.email}</span>
                  <button
                    onClick={() => handleUserSelect(user)}
                    className="p-0.5 hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-dark rounded-full"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            data-tour="komunikator-user-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Szukaj użytkowników...')}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
      </div>

      {/* User list */}
      <div className="px-4 pb-4">
        {loading ? (
          <Spinner center />
        ) : filteredUsers.length === 0 ? (
          <EmptyState compact icon={Search} title={tr('Nie znaleziono użytkowników')} />
        ) : (
          <div data-tour="komunikator-users" className="space-y-1">
            {filteredUsers.map(user => {
              const isSelected = selectedUsers.some(u => u.email === user.email);
              return (
                <button
                  key={user.email}
                  onClick={() => handleUserSelect(user)}
                  disabled={creating}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left
                    ${isSelected
                      ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }
                    disabled:opacity-50
                  `}
                >
                  <UserAvatar user={user} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {user.full_name || t('Brak nazwy')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                  {mode !== 'direct' && isSelected && (
                    <div className="w-5 h-5 bg-accent-primary rounded-full flex items-center justify-center">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
