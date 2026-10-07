import React, { useState, useEffect } from 'react';
import { Search, UserPlus, UserMinus, Crown, Users, LogOut, Edit2, Check, X, UserCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import UserAvatar from './UserAvatar';
import { ChannelIcon } from './ConversationHeader';
import { getMinistryName } from '../utils/messageHelpers';
import { leaveBlocker, sameEmail, channelName, isHomeGroupChannel } from '../utils/chatLogic';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

export default function GroupSettingsModal({
  isOpen,
  onClose,
  conversation,
  currentUserEmail,
  onUpdate,
  onLeave,
  perms = {}
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
  const isAnnouncement = conversation?.type === 'announcement';
  const participants = conversation?.participants || [];
  const allowed = (k) => perms[k] !== false;

  // Ustawienia rozmowy zmienia jej administrator (serwer: komunikator.js). Skład kanału służby
  // wynika z zespołu (synchronizacja), więc tam nie dodajemy/usuwamy osób ręcznie.
  const canEditName = isAdmin && allowed('editConversation') && !isMinistryChannel;
  const canAdd = isAdmin && allowed('addParticipants') && !isMinistryChannel;
  const canRemove = isAdmin && allowed('removeParticipants') && !isMinistryChannel;
  const canChangeRoles = isAdmin && allowed('manageOwn');
  const canLeave = !!onLeave && !isMinistryChannel;
  const nameOf = (email) => participants.find(p => sameEmail(p.user_email, email))?.full_name || email;

  // Pobierz wszystkich użytkowników do dodania
  useEffect(() => {
    if (!isOpen || activeTab !== 'add') return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url, status, is_active')
          .order('full_name');

        if (error) throw error;

        // Odfiltruj już dodanych uczestników i nieaktywne konta (jak w aplikacji)
        const availableUsers = (data || []).filter(
          u => u.email && u.is_active !== false && (u.status ?? 'active') === 'active' &&
            !participants.some(p => sameEmail(p.user_email, u.email))
        );

        setAllUsers(availableUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
        toast.error(err, { fallback: tr('Nie udało się wczytać listy osób.') });
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
      setNewName(isMinistryChannel ? channelName(conversation, getMinistryName) : (conversation?.name || ''));
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
  const handleAddParticipant = async (user) => {
    const email = user.email;
    setSaving(true);
    try {
      // .select() — serwer roześle zmianę (nowa osoba od razu zobaczy rozmowę na liście)
      const { error } = await supabase
        .from('conversation_participants')
        .insert({
          conversation_id: conversation.id,
          user_email: email,
          role: 'member'
        })
        .select('conversation_id, user_email');

      if (error) throw error;

      setAllUsers(prev => prev.filter(u => u.email !== email));
      toast.success(tr('Dodano: {name}', { name: user.full_name || email }));
      onUpdate?.();
    } catch (err) {
      console.error('Error adding participant:', err);
      toast.error(err, { fallback: tr('Nie udało się dodać uczestnika.') });
    } finally {
      setSaving(false);
    }
  };

  const groupName = (isMinistryChannel ? channelName(conversation, getMinistryName) : conversation?.name) || conversation?.displayName || tr('bez nazwy');

  // Usuń uczestnika (administrator rozmowy)
  const handleRemoveParticipant = async (email) => {
    const name = nameOf(email);
    const ok = await confirmDialog({
      title: tr('Usunąć osobę z rozmowy?'),
      message: tr('{name} przestanie widzieć rozmowę „{group}” i nie dostanie nowych wiadomości.', { name, group: groupName }),
      confirmLabel: tr('Usuń z rozmowy'),
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversation.id)
        .eq('user_email', email)
        .select('conversation_id, user_email');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error(tr('Osoby usuwa administrator rozmowy.'));
      toast.success(tr('Usunięto z rozmowy: {name}', { name }));
      onUpdate?.();
    } catch (err) {
      console.error('Error removing participant:', err);
      toast.error(err, { fallback: tr('Nie udało się usunąć uczestnika.') });
    } finally {
      setSaving(false);
    }
  };

  // Opuść rozmowę (własny wiersz). Jedyny administrator musi najpierw przekazać uprawnienia.
  const handleLeave = async () => {
    const blocker = leaveBlocker(conversation, currentUserEmail);
    if (blocker === 'lastAdmin') {
      toast.info(tr('Jesteś jedynym administratorem. Najpierw nadaj komuś uprawnienia administratora (korona przy osobie), potem opuść rozmowę.'));
      return;
    }
    if (blocker) return;
    const ok = await confirmDialog({
      title: tr('Opuścić rozmowę?'),
      message: tr('Przestaniesz widzieć rozmowę „{group}” i nie dostaniesz nowych wiadomości. Wrócić możesz tylko, jeśli administrator doda Cię ponownie.', { group: groupName }),
      confirmLabel: tr('Opuść rozmowę'),
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await onLeave(conversation.id);
      onClose();
    } catch (err) {
      console.error('Error leaving conversation:', err);
      toast.error(err, { fallback: tr('Nie udało się opuścić rozmowy.') });
    } finally {
      setSaving(false);
    }
  };

  // Zmień rolę uczestnika
  const handleToggleAdmin = async (email, currentRole) => {
    setSaving(true);
    try {
      const newRole = currentRole === 'admin' ? 'member' : 'admin';
      const { data, error } = await supabase
        .from('conversation_participants')
        .update({ role: newRole })
        .eq('conversation_id', conversation.id)
        .eq('user_email', email)
        .select('conversation_id, user_email, role');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error(tr('Role zmienia administrator rozmowy.'));
      toast.success(newRole === 'admin'
        ? tr('{name} jest teraz administratorem', { name: nameOf(email) })
        : tr('{name} nie jest już administratorem', { name: nameOf(email) }));
      onUpdate?.();
    } catch (err) {
      console.error('Error changing role:', err);
      toast.error(err, { fallback: tr('Nie udało się zmienić roli.') });
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
      const { data, error } = await supabase
        .from('conversations')
        .update({ name: newName.trim() })
        .eq('id', conversation.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error(tr('Nazwę zmienia administrator rozmowy.'));

      setEditingName(false);
      toast.success(tr('Nazwa zmieniona'));
      onUpdate?.();
    } catch (err) {
      console.error('Error updating name:', err);
      toast.error(err, { fallback: tr('Nie udało się zmienić nazwy.') });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !conversation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      title={isMinistryChannel || isAnnouncement ? tr('Ustawienia kanału') : tr('Ustawienia grupy')}
      size="sm"
    >
      {/* Group info */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <ChannelIcon conversation={conversation} size="lg" />
          <div className="flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  aria-label={tr('Nazwa grupy')}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={isMinistryChannel ? getMinistryName(conversation?.ministry_key) : tr('Nazwa grupy')}
                  className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={saving}
                  aria-label={tr('Zapisz nazwę')}
                  title={tr('Zapisz nazwę')}
                  className="p-1.5 bg-accent-primary hover:bg-accent-primary text-white rounded-full disabled:opacity-60"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNewName(isMinistryChannel ? channelName(conversation, getMinistryName) : (conversation?.name || ''));
                  }}
                  aria-label={tr('Anuluj zmianę nazwy')}
                  title={tr('Anuluj')}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {isMinistryChannel ? channelName(conversation, getMinistryName) : conversation.name}
                </h3>
                {canEditName && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                    title={tr('Zmień nazwę')}
                    aria-label={tr('Zmień nazwę')}
                  >
                    <Edit2 size={14} className="text-gray-500" />
                  </button>
                )}
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isHomeGroupChannel(conversation)
                ? tr('Kanał grupy domowej • {n} członków', { n: participants.length })
                : isMinistryChannel
                  ? tr('Kanał służby • {n} członków', { n: participants.length })
                  : tr('{n} uczestników', { n: participants.length })}
            </p>
            {isMinistryChannel && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {isHomeGroupChannel(conversation)
                  ? tr('Skład wynika z grupy domowej i aktualizuje się sam.')
                  : tr('Skład wynika ze służby i aktualizuje się sam.')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
            ${activeTab === 'members'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <Users size={18} />
          {tr('Członkowie')}
        </button>
        {canAdd && (
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
              ${activeTab === 'add'
                ? 'text-accent-primary border-b-2 border-accent-primary'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }
            `}
          >
            <UserPlus size={18} />
            {tr('Dodaj')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'members' ? tr('Szukaj członków...') : tr('Szukaj użytkowników...')}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
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
                    {sameEmail(participant.user_email, currentUserEmail) && (
                      <span className="text-xs text-gray-500">({tr('Ty')})</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {participant.user_email}
                  </p>
                </div>

                {/* Akcje */}
                <div className="flex items-center gap-1">
                  {!sameEmail(participant.user_email, currentUserEmail) && (
                    <>
                      {canChangeRoles && (
                      <button
                        type="button"
                        onClick={() => handleToggleAdmin(participant.user_email, participant.role)}
                        disabled={saving}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"
                        title={participant.role === 'admin' ? tr('Odbierz uprawnienia administratora') : tr('Nadaj uprawnienia administratora')}
                        aria-label={participant.role === 'admin'
                          ? tr('Odbierz uprawnienia administratora: {name}', { name: participant.full_name || participant.user_email })
                          : tr('Nadaj uprawnienia administratora: {name}', { name: participant.full_name || participant.user_email })}
                      >
                        <Crown
                          size={16}
                          className={participant.role === 'admin' ? 'text-amber-500' : 'text-gray-400'}
                        />
                      </button>
                      )}
                      {canRemove && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(participant.user_email)}
                        disabled={saving}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition text-red-500"
                        title={tr('Usuń z rozmowy')}
                        aria-label={tr('Usuń z rozmowy: {name}', { name: participant.full_name || participant.user_email })}
                      >
                        <UserMinus size={16} />
                      </button>
                      )}
                    </>
                  )}
                  {sameEmail(participant.user_email, currentUserEmail) && canLeave && (
                    <button
                      type="button"
                      onClick={handleLeave}
                      disabled={saving}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition text-red-500"
                      title={tr('Opuść rozmowę')}
                      aria-label={tr('Opuść rozmowę')}
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
            <Spinner center />
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              compact
              icon={searchQuery ? Search : UserCheck}
              title={searchQuery ? tr('Nie znaleziono użytkowników') : tr('Wszyscy użytkownicy są już w grupie')}
            />
          ) : (
            <div className="space-y-1">
              {filteredUsers.map(user => (
                <button
                  key={user.email}
                  onClick={() => handleAddParticipant(user)}
                  disabled={saving}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-left disabled:opacity-50"
                >
                  <UserAvatar user={user} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {user.full_name || tr('Brak nazwy')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                  <UserPlus size={18} className="text-accent-primary flex-shrink-0" />
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
