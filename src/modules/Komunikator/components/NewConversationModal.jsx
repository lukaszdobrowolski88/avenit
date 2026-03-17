import React, { useState, useEffect } from 'react';
import { X, Search, User, Users, Check, Loader } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import UserAvatar from './UserAvatar';

export default function NewConversationModal({
  isOpen,
  onClose,
  onCreateDirect,
  onCreateGroup,
  currentUserEmail
}) {
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
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
      alert('Nie udało się utworzyć rozmowy');
    } finally {
      setCreating(false);
    }
  };

  // Utwórz grupę
  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    setCreating(true);
    try {
      const emails = selectedUsers.map(u => u.email);
      await onCreateGroup(groupName.trim(), emails);
      onClose();
    } catch (err) {
      console.error('Error creating group:', err);
      alert('Nie udało się utworzyć grupy');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Nowa rozmowa
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setMode('direct')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
              ${mode === 'direct'
                ? 'text-pink-600 border-b-2 border-pink-600'
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
                ? 'text-pink-600 border-b-2 border-pink-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }
            `}
          >
            <Users size={18} />
            Grupa
          </button>
        </div>

        {/* Group name input */}
        {mode === 'group' && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Nazwa grupy..."
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-gray-100 placeholder-gray-500"
            />

            {/* Wybrani użytkownicy */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {selectedUsers.map(user => (
                  <div
                    key={user.email}
                    className="flex items-center gap-1 px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 rounded-full text-xs"
                  >
                    <span>{user.full_name || user.email}</span>
                    <button
                      onClick={() => handleUserSelect(user)}
                      className="p-0.5 hover:bg-pink-200 dark:hover:bg-pink-800 rounded-full"
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
        <div className="p-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj użytkowników..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-gray-100 placeholder-gray-500"
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={24} className="animate-spin text-pink-600" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Nie znaleziono użytkowników
            </div>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map(user => {
                const isSelected = selectedUsers.some(u => u.email === user.email);
                return (
                  <button
                    key={user.email}
                    onClick={() => handleUserSelect(user)}
                    disabled={creating}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left
                      ${isSelected
                        ? 'bg-pink-50 dark:bg-pink-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }
                      disabled:opacity-50
                    `}
                  >
                    <UserAvatar user={user} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {user.full_name || 'Brak nazwy'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user.email}
                      </p>
                    </div>
                    {mode === 'group' && isSelected && (
                      <div className="w-5 h-5 bg-pink-600 rounded-full flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - tylko dla grupy */}
        {mode === 'group' && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedUsers.length === 0 || creating}
              className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-medium rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Tworzenie...
                </>
              ) : (
                <>
                  <Users size={18} />
                  Utwórz grupę ({selectedUsers.length} {selectedUsers.length === 1 ? 'osoba' : selectedUsers.length < 5 ? 'osoby' : 'osób'})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
