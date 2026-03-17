import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, UserMinus, Crown, Loader, Users, Trash2, LogOut, Edit2, Check, Music, Zap, Baby, Heart, UserCheck, Home, Shield } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import UserAvatar from './UserAvatar';
import { getMinistryName } from '../utils/messageHelpers';

// Ikony dla kanałów służb
const ministryIcons = {
  worship_team: Music,
  media_team: Zap,
  kids_ministry: Baby,
  youth_ministry: Users,
  prayer_team: Heart,
  welcome_team: UserCheck,
  small_groups: Home,
  admin_team: Shield,
};

export default function GroupSettingsModal({
  isOpen,
  onClose,
  conversation,
  currentUserEmail,
  onUpdate
}) {
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'add'
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const isAdmin = conversation?.myRole === 'admin';
  const isMinistryChannel = conversation?.type === 'ministry';
  const participants = conversation?.participants || [];

  // Dla kanałów służb każdy uczestnik może edytować nazwę
  const canEditName = isAdmin || isMinistryChannel;

  // Pobierz wszystkich użytkowników do dodania
  useEffect(() => {
    if (!isOpen || activeTab !== 'add') return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .order('full_name');

        if (error) throw error;

        // Odfiltruj już dodanych uczestników
        const participantEmails = participants.map(p => p.user_email);
        const availableUsers = (data || []).filter(
          u => !participantEmails.includes(u.email)
        );

        setAllUsers(availableUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, activeTab, participants]);

  // Reset przy zamknięciu
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('members');
      setSearchQuery('');
      setEditingName(false);
      setNewName('');
    } else {
      // Dla kanałów służb użyj nazwy z ministry_key jeśli brak nazwy własnej
      const displayName = isMinistryChannel
        ? (conversation?.name || getMinistryName(conversation?.ministry_key))
        : (conversation?.name || '');
      setNewName(displayName);
    }
  }, [isOpen, conversation?.name, conversation?.ministry_key, isMinistryChannel]);

  // Filtruj użytkowników
  const filteredUsers = allUsers.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  });

  const filteredParticipants = participants.filter(p => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(query) ||
      p.user_email?.toLowerCase().includes(query)
    );
  });

  // Dodaj uczestnika
  const handleAddParticipant = async (email) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .insert({
          conversation_id: conversation.id,
          user_email: email,
          role: 'member'
        });

      if (error) throw error;

      onUpdate?.();
      setAllUsers(prev => prev.filter(u => u.email !== email));
    } catch (err) {
      console.error('Error adding participant:', err);
      alert('Nie udało się dodać uczestnika');
    } finally {
      setSaving(false);
    }
  };

  // Usuń uczestnika
  const handleRemoveParticipant = async (email) => {
    if (email === currentUserEmail) {
      if (!window.confirm('Czy na pewno chcesz opuścić tę grupę?')) return;
    } else {
      if (!window.confirm(`Czy na pewno chcesz usunąć tego uczestnika?`)) return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversation.id)
        .eq('user_email', email);

      if (error) throw error;

      if (email === currentUserEmail) {
        onClose();
      }
      onUpdate?.();
    } catch (err) {
      console.error('Error removing participant:', err);
      alert('Nie udało się usunąć uczestnika');
    } finally {
      setSaving(false);
    }
  };

  // Zmień rolę uczestnika
  const handleToggleAdmin = async (email, currentRole) => {
    setSaving(true);
    try {
      const newRole = currentRole === 'admin' ? 'member' : 'admin';
      const { error } = await supabase
        .from('conversation_participants')
        .update({ role: newRole })
        .eq('conversation_id', conversation.id)
        .eq('user_email', email);

      if (error) throw error;
      onUpdate?.();
    } catch (err) {
      console.error('Error changing role:', err);
      alert('Nie udało się zmienić roli');
    } finally {
      setSaving(false);
    }
  };

  // Zapisz nazwę grupy
  const handleSaveName = async () => {
    if (!newName.trim() || newName === conversation?.name) {
      setEditingName(false);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ name: newName.trim() })
        .eq('id', conversation.id);

      if (error) throw error;

      setEditingName(false);
      onUpdate?.();
    } catch (err) {
      console.error('Error updating name:', err);
      alert('Nie udało się zmienić nazwy');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !conversation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {isMinistryChannel ? 'Ustawienia kanału' : 'Ustawienia grupy'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Group info */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {isMinistryChannel ? (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                {(() => {
                  const IconComponent = ministryIcons[conversation?.ministry_key] || Users;
                  return <IconComponent size={28} />;
                })()}
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                <Users size={28} />
              </div>
            )}
            <div className="flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={isMinistryChannel ? getMinistryName(conversation?.ministry_key) : 'Nazwa grupy'}
                    className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={saving}
                    className="p-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-full"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      const displayName = isMinistryChannel
                        ? (conversation?.name || getMinistryName(conversation?.ministry_key))
                        : (conversation?.name || '');
                      setNewName(displayName);
                    }}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {isMinistryChannel
                      ? (conversation.name || getMinistryName(conversation?.ministry_key))
                      : conversation.name}
                  </h3>
                  {canEditName && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                      title="Zmień nazwę"
                    >
                      <Edit2 size={14} className="text-gray-500" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isMinistryChannel ? 'Kanał służby • ' : ''}{participants.length} uczestników
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
              ${activeTab === 'members'
                ? 'text-pink-600 border-b-2 border-pink-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }
            `}
          >
            <Users size={18} />
            Członkowie
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('add')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
                ${activeTab === 'add'
                  ? 'text-pink-600 border-b-2 border-pink-600'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }
              `}
            >
              <UserPlus size={18} />
              Dodaj
            </button>
          )}
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'members' ? 'Szukaj członków...' : 'Szukaj użytkowników...'}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-gray-100 placeholder-gray-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
          {activeTab === 'members' ? (
            // Lista członków
            <div className="space-y-1">
              {filteredParticipants.map(participant => (
                <div
                  key={participant.user_email}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <UserAvatar user={participant} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {participant.full_name || participant.user_email}
                      </p>
                      {participant.role === 'admin' && (
                        <Crown size={14} className="text-amber-500 flex-shrink-0" />
                      )}
                      {participant.user_email === currentUserEmail && (
                        <span className="text-xs text-gray-500">(Ty)</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {participant.user_email}
                    </p>
                  </div>

                  {/* Akcje */}
                  <div className="flex items-center gap-1">
                    {isAdmin && participant.user_email !== currentUserEmail && (
                      <>
                        <button
                          onClick={() => handleToggleAdmin(participant.user_email, participant.role)}
                          disabled={saving}
                          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"
                          title={participant.role === 'admin' ? 'Usuń uprawnienia admina' : 'Nadaj uprawnienia admina'}
                        >
                          <Crown
                            size={16}
                            className={participant.role === 'admin' ? 'text-amber-500' : 'text-gray-400'}
                          />
                        </button>
                        <button
                          onClick={() => handleRemoveParticipant(participant.user_email)}
                          disabled={saving}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition text-red-500"
                          title="Usuń z grupy"
                        >
                          <UserMinus size={16} />
                        </button>
                      </>
                    )}
                    {participant.user_email === currentUserEmail && (
                      <button
                        onClick={() => handleRemoveParticipant(currentUserEmail)}
                        disabled={saving}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition text-red-500"
                        title="Opuść grupę"
                      >
                        <LogOut size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Lista użytkowników do dodania
            loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={24} className="animate-spin text-pink-600" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Nie znaleziono użytkowników' : 'Wszyscy użytkownicy są już w grupie'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map(user => (
                  <button
                    key={user.email}
                    onClick={() => handleAddParticipant(user.email)}
                    disabled={saving}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-left disabled:opacity-50"
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
                    <UserPlus size={18} className="text-pink-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
