import React, { useState, useMemo, useEffect } from 'react';
import { Users, Building2, Home, UserCheck, Search, X, Check, AlertTriangle } from 'lucide-react';
import { useRecipients } from '../hooks/useRecipients';

export default function RecipientSelector({ selectedSegments = [], onChange, selectedEmails = [], onEmailsChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [localSegments, setLocalSegments] = useState(selectedSegments);

  // Synchronizuj lokalny stan z props
  useEffect(() => {
    setLocalSegments(selectedSegments);
  }, [selectedSegments]);

  const segments = localSegments;

  const {
    allUsers,
    ministries,
    homeGroups,
    loading,
    getSegmentCount,
    searchUsers,
    totalActive,
    totalUnsubscribed
  } = useRecipients();

  // Wyniki wyszukiwania
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    return searchUsers(searchQuery);
  }, [searchQuery, searchUsers]);

  // Oblicz łączną liczbę odbiorców
  const totalRecipients = useMemo(() => {
    if (segments.some(s => s.type === 'all')) {
      return totalActive;
    }

    const emails = new Set(selectedEmails.map(e => e.email));

    segments.forEach(segment => {
      if (segment.type === 'ministry') {
        const ministry = ministries.find(m => m.id === segment.id || m.key === segment.id);
        ministry?.members?.forEach(m => {
          if (m.email) emails.add(m.email);
        });
      } else if (segment.type === 'home_group') {
        const group = homeGroups.find(g => g.id === segment.id);
        group?.members?.forEach(m => {
          if (m.email) emails.add(m.email);
        });
      }
    });

    return emails.size;
  }, [segments, selectedEmails, ministries, homeGroups, totalActive]);

  const toggleSegment = (type, id, name) => {
    const exists = segments.some(s => s.type === type && s.id === id);

    let newSegments;
    if (exists) {
      newSegments = segments.filter(s => !(s.type === type && s.id === id));
    } else {
      if (type === 'all') {
        newSegments = [{ type: 'all', id: null, name: 'Wszyscy członkowie' }];
        onEmailsChange?.([]);
      } else {
        const filtered = segments.filter(s => s.type !== 'all');
        newSegments = [...filtered, { type, id, name }];
      }
    }

    setLocalSegments(newSegments);
    onChange(newSegments);
  };

  const toggleEmail = (user) => {
    const exists = selectedEmails.some(e => e.email === user.email);
    if (exists) {
      onEmailsChange?.(selectedEmails.filter(e => e.email !== user.email));
    } else {
      onEmailsChange?.([...selectedEmails, user]);
    }
  };

  const isSegmentSelected = (type, id = null) => {
    return segments.some(s => s.type === type && s.id === id);
  };

  const isEmailSelected = (email) => {
    return selectedEmails.some(e => e.email === email);
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Ładowanie odbiorców...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Podsumowanie */}
      <div className="bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white dark:bg-gray-800 rounded-lg">
            <Users className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {totalRecipients} odbiorców
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalUnsubscribed > 0 && `(${totalUnsubscribed} wypisanych)`}
            </p>
          </div>
        </div>
      </div>

      {/* Wszyscy członkowie */}
      <div>
        <SegmentCheckbox
          checked={isSegmentSelected('all')}
          onChange={() => toggleSegment('all', null, 'Wszyscy członkowie')}
          icon={Users}
          label="Wszyscy członkowie"
          count={totalActive}
          description="Wyślij do wszystkich aktywnych członków"
        />
      </div>

      {!isSegmentSelected('all') && (
        <>
          {/* Służby */}
          {ministries.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Building2 size={16} />
                Służby
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ministries.map(ministry => (
                  <SegmentCheckbox
                    key={ministry.id}
                    checked={isSegmentSelected('ministry', ministry.id)}
                    onChange={() => toggleSegment('ministry', ministry.id, ministry.name)}
                    label={ministry.name}
                    count={getSegmentCount('ministry', ministry.id)}
                    small
                  />
                ))}
              </div>
            </div>
          )}

          {/* Grupy domowe */}
          {homeGroups.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Home size={16} />
                Grupy domowe
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {homeGroups.map(group => (
                  <SegmentCheckbox
                    key={group.id}
                    checked={isSegmentSelected('home_group', group.id)}
                    onChange={() => toggleSegment('home_group', group.id, group.name)}
                    label={group.name}
                    count={getSegmentCount('home_group', group.id)}
                    small
                  />
                ))}
              </div>
            </div>
          )}

          {/* Wybór ręczny */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <UserCheck size={16} />
              Wybierz ręcznie
            </h4>

            {/* Wyszukiwarka */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearch(true);
                }}
                onFocus={() => setShowSearch(true)}
                placeholder="Szukaj po nazwisku lub email..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50"
              />

              {/* Wyniki wyszukiwania */}
              {showSearch && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto z-20">
                  {searchResults.map(user => (
                    <button
                      key={user.email}
                      onClick={() => toggleEmail(user)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {user.full_name?.[0] || user.email[0].toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {user.full_name || user.email}
                          </p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                      {isEmailSelected(user.email) && (
                        <Check className="w-5 h-5 text-green-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Wybrane osoby */}
            {selectedEmails.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedEmails.map(user => (
                  <span
                    key={user.email}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 rounded-full text-sm"
                  >
                    {user.full_name || user.email}
                    <button
                      onClick={() => toggleEmail(user)}
                      className="hover:bg-pink-200 dark:hover:bg-pink-800 rounded-full p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Ostrzeżenie o wypisanych */}
      {totalUnsubscribed > 0 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl text-yellow-800 dark:text-yellow-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">{totalUnsubscribed} osób wypisanych z newslettera</p>
            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
              Te osoby nie otrzymają tej wiadomości.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentCheckbox({ checked, onChange, icon: Icon, label, count, description, small = false }) {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange();
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
        checked
          ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-700'
      } ${small ? 'p-2.5' : 'p-3'}`}
    >
      <div className={`flex-shrink-0 rounded-lg flex items-center justify-center ${
        checked ? 'bg-pink-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
      } ${small ? 'w-5 h-5' : 'w-6 h-6'}`}>
        {checked ? <Check size={small ? 12 : 14} /> : (Icon && <Icon size={small ? 12 : 14} />)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-medium text-gray-900 dark:text-white ${small ? 'text-sm' : ''}`}>
            {label}
          </span>
          <span className={`text-gray-500 dark:text-gray-400 ${small ? 'text-xs' : 'text-sm'}`}>
            ({count})
          </span>
        </div>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}
