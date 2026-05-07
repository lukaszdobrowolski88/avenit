import React, { useState, useMemo } from 'react';
import {
  Users, MapPin, Sparkles, Home, Shield, UserCheck, Phone, Search, X, Check,
  AlertTriangle, Plus, Minus,
} from 'lucide-react';
import { useRecipientsSource, ROLE_OPTIONS, normalizePhone } from '../../shared/recipients';

const SEGMENT_GROUPS = [
  { id: 'all', label: 'Wszyscy', icon: Users },
  { id: 'campus', label: 'Campus', icon: MapPin },
  { id: 'ministry', label: 'Służba', icon: Sparkles },
  { id: 'home_group', label: 'Grupa domowa', icon: Home },
  { id: 'role', label: 'Rola', icon: Shield },
  { id: 'custom_email', label: 'Wybrane osoby', icon: UserCheck },
  { id: 'custom_phone', label: 'Numery', icon: Phone },
];

export default function RecipientSelector({ segments = [], onChange }) {
  const [activeGroup, setActiveGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [phonesInput, setPhonesInput] = useState('');

  const {
    allUsers, ministries, homeGroups, campuses, unsubscribed, loading,
    resolveSegments, searchUsers, totalActive,
  } = useRecipientsSource({ optOutSource: 'sms_user_preferences' });

  const recipients = useMemo(() => resolveSegments(segments), [segments, resolveSegments]);
  const withPhone = recipients.filter(r => r.phone && normalizePhone(r.phone));
  const withoutPhone = recipients.filter(r => !r.phone || !normalizePhone(r.phone));

  const isSelected = (type, id, exclude = false) =>
    segments.some(s => s.type === type && String(s.id ?? '') === String(id ?? '') && !!s.exclude === exclude);

  const toggleSegment = (type, id, name, exclude = false) => {
    const exists = isSelected(type, id, exclude);
    if (exists) {
      onChange(segments.filter(s => !(s.type === type && String(s.id ?? '') === String(id ?? '') && !!s.exclude === exclude)));
    } else {
      const next = type === 'all' && !exclude
        ? [{ type, id: null, name, exclude: false }]
        : [...segments.filter(s => !(s.type === 'all' && !s.exclude)), { type, id, name, exclude }];
      onChange(next);
    }
  };

  const addCustomEmail = (email) => {
    const existing = segments.find(s => s.type === 'custom_email' && !s.exclude);
    const emails = new Set(existing?.emails || []);
    emails.add(email);
    const next = segments.filter(s => !(s.type === 'custom_email' && !s.exclude));
    next.push({ type: 'custom_email', id: 'custom', name: 'Wybrane osoby', emails: Array.from(emails), exclude: false });
    onChange(next);
  };

  const removeCustomEmail = (email) => {
    const existing = segments.find(s => s.type === 'custom_email' && !s.exclude);
    if (!existing) return;
    const emails = (existing.emails || []).filter(e => e !== email);
    const next = segments.filter(s => !(s.type === 'custom_email' && !s.exclude));
    if (emails.length) next.push({ ...existing, emails });
    onChange(next);
  };

  const customEmails = segments.find(s => s.type === 'custom_email' && !s.exclude)?.emails || [];
  const customPhones = segments.find(s => s.type === 'custom_phone' && !s.exclude)?.phones || [];

  const addCustomPhones = () => {
    const lines = phonesInput.split(/[\s,;\n]+/).map(s => s.trim()).filter(Boolean);
    const valid = [];
    const invalid = [];
    lines.forEach(raw => {
      const norm = normalizePhone(raw);
      if (norm) valid.push(norm); else invalid.push(raw);
    });
    if (!valid.length) {
      alert(`Brak poprawnych numerów. Niepoprawne: ${invalid.join(', ')}`);
      return;
    }
    const set = new Set(customPhones);
    valid.forEach(p => set.add(p));
    const next = segments.filter(s => !(s.type === 'custom_phone' && !s.exclude));
    next.push({ type: 'custom_phone', id: 'custom_phone', name: 'Numery telefonów', phones: Array.from(set), exclude: false });
    onChange(next);
    setPhonesInput('');
    if (invalid.length) alert(`Pominięto niepoprawne: ${invalid.join(', ')}`);
  };

  const removeCustomPhone = (phone) => {
    const remaining = customPhones.filter(p => p !== phone);
    const next = segments.filter(s => !(s.type === 'custom_phone' && !s.exclude));
    if (remaining.length) next.push({ type: 'custom_phone', id: 'custom_phone', name: 'Numery telefonów', phones: remaining, exclude: false });
    onChange(next);
  };

  const searchResults = useMemo(() => searchUsers(search), [search, searchUsers]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Ładowanie...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Podsumowanie */}
      <div className="bg-gradient-to-r from-accent-primary-lightest/30 to-accent-secondary-lightest/30 dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{withPhone.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">odbiorców z numerem (po opt-outach)</div>
        </div>
        {withoutPhone.length > 0 && (
          <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {withoutPhone.length} bez numeru — zostaną pominięci
          </div>
        )}
        {unsubscribed.length > 0 && (
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-500" />
            {unsubscribed.length} z opt-outem SMS
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SEGMENT_GROUPS.map(g => (
          <button
            key={g.id}
            onClick={() => setActiveGroup(g.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeGroup === g.id
                ? 'bg-accent-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <g.icon size={14} />
            {g.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        {activeGroup === 'all' && (
          <SegmentRow
            checked={isSelected('all', null)}
            onClick={() => toggleSegment('all', null, 'Wszyscy aktywni')}
            label={`Wszyscy aktywni użytkownicy (${totalActive})`}
            description="Każdy użytkownik z włączonym SMS i zgodą marketingową."
          />
        )}

        {activeGroup === 'campus' && (
          <div className="space-y-1">
            {campuses.length === 0 && <Empty>Brak skonfigurowanych campusów.</Empty>}
            {campuses.map(c => (
              <SegmentRow
                key={c.id}
                checked={isSelected('campus', c.id)}
                excluded={isSelected('campus', c.id, true)}
                onClick={() => toggleSegment('campus', c.id, c.name)}
                onExcludeClick={() => toggleSegment('campus', c.id, c.name, true)}
                label={c.name}
                count={allUsers.filter(u => String(u.campus_id) === String(c.id)).length}
              />
            ))}
          </div>
        )}

        {activeGroup === 'ministry' && (
          <div className="space-y-1">
            {ministries.length === 0 && <Empty>Brak danych o służbach.</Empty>}
            {ministries.map(m => (
              <SegmentRow
                key={m.id}
                checked={isSelected('ministry', m.id)}
                excluded={isSelected('ministry', m.id, true)}
                onClick={() => toggleSegment('ministry', m.id, m.name)}
                onExcludeClick={() => toggleSegment('ministry', m.id, m.name, true)}
                label={m.name}
                count={m.members.length}
              />
            ))}
          </div>
        )}

        {activeGroup === 'home_group' && (
          <div className="space-y-1">
            {homeGroups.length === 0 && <Empty>Brak grup domowych.</Empty>}
            {homeGroups.map(g => (
              <SegmentRow
                key={g.id}
                checked={isSelected('home_group', g.id)}
                excluded={isSelected('home_group', g.id, true)}
                onClick={() => toggleSegment('home_group', g.id, g.name)}
                onExcludeClick={() => toggleSegment('home_group', g.id, g.name, true)}
                label={g.name}
                count={g.members.length}
              />
            ))}
          </div>
        )}

        {activeGroup === 'role' && (
          <div className="space-y-1">
            {ROLE_OPTIONS.map(r => (
              <SegmentRow
                key={r.id}
                checked={isSelected('role', r.id)}
                excluded={isSelected('role', r.id, true)}
                onClick={() => toggleSegment('role', r.id, r.name)}
                onExcludeClick={() => toggleSegment('role', r.id, r.name, true)}
                label={r.name}
                count={allUsers.filter(u => u.role === r.id).length}
              />
            ))}
          </div>
        )}

        {activeGroup === 'custom_email' && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Szukaj po imieniu lub emailu..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-auto border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                {searchResults.map(u => (
                  <button
                    key={u.email}
                    onClick={() => { addCustomEmail(u.email); setSearch(''); }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-white">{u.full_name || u.email}</div>
                      <div className="text-xs text-gray-500">
                        {u.email}
                        {u.phone && <span className="ml-2 text-emerald-600">· {u.phone}</span>}
                        {!u.phone && <span className="ml-2 text-amber-600">· brak numeru</span>}
                      </div>
                    </div>
                    <Plus size={16} className="text-accent-primary" />
                  </button>
                ))}
              </div>
            )}

            {customEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customEmails.map(email => (
                  <span key={email} className="inline-flex items-center gap-1.5 px-2 py-1 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light rounded-md text-xs">
                    {email}
                    <button onClick={() => removeCustomEmail(email)}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {activeGroup === 'custom_phone' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                Wklej numery (po przecinku, średniku lub w nowych liniach)
              </label>
              <textarea
                value={phonesInput}
                onChange={e => setPhonesInput(e.target.value)}
                rows={3}
                placeholder="500123456&#10;+48 600 700 800&#10;48 700 800 900"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">Numery zostaną znormalizowane do formatu 48xxxxxxxxx (Polska).</p>
              <button
                onClick={addCustomPhones}
                disabled={!phonesInput.trim()}
                className="mt-2 px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg disabled:opacity-50"
              >
                Dodaj numery
              </button>
            </div>

            {customPhones.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1.5">Dodane ({customPhones.length}):</div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
                  {customPhones.map(phone => (
                    <span key={phone} className="inline-flex items-center gap-1.5 px-2 py-1 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light rounded-md text-xs font-mono">
                      +{phone}
                      <button onClick={() => removeCustomPhone(phone)}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentRow({ checked, excluded, onClick, onExcludeClick, label, count, description }) {
  return (
    <div className={`flex items-center gap-2 p-2.5 rounded-lg transition-colors ${
      checked ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30' :
      excluded ? 'bg-red-50 dark:bg-red-900/20' :
      'hover:bg-gray-50 dark:hover:bg-gray-700/50'
    }`}>
      <button onClick={onClick} className="flex items-center gap-2 flex-1 text-left">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          checked ? 'bg-accent-primary border-accent-primary' : 'border-gray-300 dark:border-gray-600'
        }`}>
          {checked && <Check size={12} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {label}
            {count !== undefined && <span className="text-xs text-gray-500 ml-1.5">({count})</span>}
          </div>
          {description && <div className="text-xs text-gray-500">{description}</div>}
        </div>
      </button>
      {onExcludeClick && (
        <button
          onClick={onExcludeClick}
          title="Wyklucz tę grupę"
          className={`p-1 rounded ${excluded ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
        >
          <Minus size={14} />
        </button>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <div className="text-center py-6 text-sm text-gray-500">{children}</div>;
}
