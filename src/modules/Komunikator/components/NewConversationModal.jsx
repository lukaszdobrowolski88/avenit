import React, { useState, useEffect } from 'react';
import { X, Search, User, Users, Check, Megaphone, Info, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import UserAvatar from './UserAvatar';
import { getMinistryName } from '../utils/messageHelpers';
import { normEmail, sameEmail } from '../utils/chatLogic';
import { fetchDirectAllowed } from '../hooks/useChatPolicy';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

// Źródła „całej służby” (te same tabele co kanały służb).
const MINISTRY_SOURCES = [
  { key: 'worship_team', table: 'worship_team' },
  { key: 'media_team', table: 'media_team' },
  { key: 'atmosfera_team', table: 'atmosfera_members' },
  { key: 'kids_ministry', table: 'kids_teachers' },
  { key: 'home_groups', table: 'home_group_leaders' },
];

export default function NewConversationModal({
  isOpen,
  onClose,
  onCreateDirect,
  onCreateGroup,
  onCreateAnnouncement,
  currentUserEmail,
  dmPolicy = null // K9: { dm: 'all'|'leaders'|'off', protectMinors, canStartDirect, allowedEmails }
}) {
  const t = useT();
  // Rozmowy prywatne wyłączone dla mnie — zaczynamy od „Grupa”, a zakładka „Prywatna” objaśnia dlaczego.
  const directBlocked = !!dmPolicy && dmPolicy.canStartDirect === false;
  const [mode, setMode] = useState(directBlocked ? 'group' : 'direct'); // 'direct' | 'group' | 'announcement'
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [homeGroups, setHomeGroups] = useState([]);
  const [segmentLoading, setSegmentLoading] = useState(false);

  // Pobierz listę użytkowników
  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url, status, is_active')
          .order('full_name');

        if (error) throw error;
        // Jak w aplikacji: tylko aktywne konta (bez oczekujących i wyłączonych), bez mnie.
        setUsers((data || []).filter(u => u.email && !sameEmail(u.email, currentUserEmail) &&
          u.is_active !== false && (u.status ?? 'active') === 'active'));
      } catch (err) {
        console.error('Error fetching users:', err);
        toast.error(err, { fallback: tr('Nie udało się wczytać listy osób. Spróbuj ponownie.') });
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentUserEmail]);

  // Grupy domowe do szybkiego dodania całego składu (grupa / kanał ogłoszeń)
  useEffect(() => {
    if (!isOpen || mode === 'direct' || homeGroups.length) return;
    supabase
      .from('home_groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => setHomeGroups(data || []), () => {});
  }, [isOpen, mode, homeGroups.length]);

  // Dodaj do wybranych wszystkie osoby (z kontem w aplikacji) z grupy domowej albo służby
  const addSegment = async (value) => {
    if (!value) return;
    setSegmentLoading(true);
    try {
      let emails = [];
      let label = '';
      if (value.startsWith('hg:')) {
        const gid = value.slice(3);
        label = homeGroups.find(h => String(h.id) === gid)?.name || tr('Grupa domowa');
        // Skład grupy jest w dwóch miejscach (home_group_members i members.home_group_id) + liderzy
        const results = await Promise.all([
          supabase.from('home_group_members').select('email').eq('group_id', gid),
          supabase.from('home_group_leaders').select('email').eq('group_id', gid),
          supabase.from('members').select('email').eq('home_group_id', gid),
        ]);
        if (results.every(r => r.error)) throw results[0].error;
        emails = results.flatMap(r => r.data || []).map(r => r.email);
      } else {
        const src = MINISTRY_SOURCES.find(m => m.key === value);
        if (!src) return;
        label = getMinistryName(value);
        const { data, error } = await supabase.from(src.table).select('email');
        if (error) throw error;
        emails = (data || []).map(r => r.email);
      }

      const keys = new Set(emails.filter(Boolean).map(normEmail));
      keys.delete(normEmail(currentUserEmail));
      const matched = users.filter(u => keys.has(normEmail(u.email)));
      const skipped = keys.size - matched.length;
      setSelectedUsers(prev => {
        const have = new Set(prev.map(u => normEmail(u.email)));
        return [...prev, ...matched.filter(u => !have.has(normEmail(u.email)))];
      });
      if (!groupName.trim()) setGroupName(label);

      if (matched.length === 0) {
        toast.info(t('Nikt z „{group}” nie ma jeszcze konta w aplikacji.', { group: label }));
      } else if (skipped > 0) {
        toast.success(t('Dodano osoby z „{group}”: {n}. Bez konta w aplikacji (pominięte): {m}.', { group: label, n: matched.length, m: skipped }));
      } else {
        toast.success(t('Dodano osoby z „{group}”: {n}.', { group: label, n: matched.length }));
      }
    } catch (err) {
      console.error('Error loading group members:', err);
      toast.error(err, { fallback: t('Nie udało się pobrać składu. Spróbuj ponownie.') });
    } finally {
      setSegmentLoading(false);
    }
  };

  // Reset przy zamknięciu
  useEffect(() => {
    if (!isOpen) {
      setMode(directBlocked ? 'group' : 'direct');
      setSearchQuery('');
      setSelectedUsers([]);
      setGroupName('');
    }
  }, [isOpen, directBlocked]);

  // Polityka ograniczona („tylko z liderem”, ochrona niepełnoletnich): pytamy serwer, z kim wolno
  // zacząć rozmowę 1:1, i chowamy pozostałe osoby (serwer i tak odrzuci — 403 DM_NOT_ALLOWED).
  const [directAllowed, setDirectAllowed] = useState(null); // { email: bool } | null
  const restricted = !!dmPolicy && dmPolicy.canStartDirect !== false && !!dmPolicy.scope && dmPolicy.scope !== 'all';
  // Także dorosły przy ochronie niepełnoletnich nie zacznie rozmowy z osobą poniżej 18 lat — schowamy ją.
  const checkTargets = restricted || (!!dmPolicy?.protectMinors && dmPolicy.canStartDirect !== false);
  useEffect(() => {
    if (!isOpen || mode !== 'direct' || !checkTargets || !users.length) { if (!isOpen) setDirectAllowed(null); return undefined; }
    let alive = true;
    if (Array.isArray(dmPolicy?.allowedEmails)) {
      const ok = new Set(dmPolicy.allowedEmails.map(normEmail));
      setDirectAllowed(Object.fromEntries(users.map(u => [normEmail(u.email), ok.has(normEmail(u.email))])));
      return undefined;
    }
    fetchDirectAllowed(users.map(u => u.email)).then((map) => {
      if (alive) setDirectAllowed(Object.keys(map).length ? map : null);
    });
    return () => { alive = false; };
  }, [isOpen, mode, checkTargets, users, dmPolicy?.allowedEmails]);

  // Filtruj użytkowników
  const filteredUsers = users.filter(user => {
    // Chowamy tylko osoby, o których serwer wprost powiedział „nie wolno” (brak odpowiedzi = pokazujemy).
    if (mode === 'direct' && directAllowed && directAllowed[normEmail(user.email)] === false) return false;
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
      // 403 DM_NOT_ALLOWED: serwer podaje ludzki powód (polityka kościoła / ochrona niepełnoletnich).
      toast.error(err, {
        fallback: err?.code === 'DM_NOT_ALLOWED'
          ? t('Rozmowa prywatna z tą osobą nie jest dozwolona w Twoim kościele. Możesz napisać do niej w grupie.')
          : t('Nie udało się utworzyć rozmowy. Spróbuj ponownie.'),
      });
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
      toast.error(err, { fallback: mode === 'announcement' ? t('Nie udało się utworzyć kanału. Spróbuj ponownie.') : t('Nie udało się utworzyć grupy. Spróbuj ponownie.') });
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
      title={tr('Nowa rozmowa')}
      size="sm"
      footer={mode !== 'direct' ? (
        /* Stopka - dla grupy i kanału ogłoszeń */
        <>
          <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
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
          {tr('Prywatna')}
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
            aria-label={mode === 'announcement' ? t('Nazwa kanału ogłoszeń') : t('Nazwa grupy')}
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />

          {/* Cała grupa domowa / służba jednym wyborem */}
          <div className="mt-3 flex items-center gap-2">
            <select
              value=""
              onChange={(e) => addSegment(e.target.value)}
              disabled={segmentLoading || loading}
              aria-label={t('Dodaj całą grupę lub służbę')}
              className="flex-1 min-w-0 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-700 dark:text-gray-200 disabled:opacity-60"
            >
              <option value="">{t('Dodaj całą grupę lub służbę…')}</option>
              <optgroup label={t('Służby')}>
                {MINISTRY_SOURCES.map(m => (
                  <option key={m.key} value={m.key}>{getMinistryName(m.key)}</option>
                ))}
              </optgroup>
              {homeGroups.length > 0 && (
                <optgroup label={t('Grupy domowe')}>
                  {homeGroups.map(h => (
                    <option key={h.id} value={`hg:${h.id}`}>{h.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {segmentLoading && <Spinner size={16} />}
          </div>

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
                    type="button"
                    onClick={() => handleUserSelect(user)}
                    aria-label={t('Usuń z wybranych: {name}', { name: user.full_name || user.email })}
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

      {/* Zasady rozmów prywatnych (K9) */}
      {mode === 'direct' && dmPolicy && (directBlocked || restricted) && (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
          {directBlocked ? <Lock size={14} className="mt-0.5 flex-shrink-0" /> : <Info size={14} className="mt-0.5 flex-shrink-0" />}
          <span>
            {directBlocked
              ? t('Rozmowy prywatne są w Twoim kościele wyłączone. Możesz pisać w grupach i kanałach.')
              : dmPolicy.scope === 'leaders'
                ? t('Rozmowę prywatną możesz zacząć tylko z liderem albo administratorem.')
                : dmPolicy.scope === 'minors'
                  ? t('Rozmowy prywatne z dorosłymi spoza rodziny są wyłączone. Z liderami rozmawiaj w grupie.')
                  : t('W Twoim kościele rozmowy prywatne mają ograniczenia. Na liście są osoby, do których możesz napisać.')}
          </span>
        </div>
      )}

      {mode === 'direct' && directBlocked ? null : (
      <>
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
            aria-label={t('Szukaj osób')}
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
      </>
      )}
    </Modal>
  );
}
