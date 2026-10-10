import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Search, X, Check, Mail, Video, Phone, Save } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import CustomSelect from '../../../components/CustomSelect';
import { DateInput, TimeField } from '../../../components/pickers';
import UserAvatar from '../components/UserAvatar';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { normEmail, sameEmail } from '../utils/chatLogic';
import { callFn } from '../calls/callApi';
import {
  DURATION_OPTIONS, DEFAULT_DURATION, MAX_GUESTS, defaultSlot, formFromMeeting, parseGuestInput,
  meetingPayload, validateForm, toStartsAt,
} from './meetingLogic';

const field = 'w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400';
const labelCls = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1.5';
const chip = 'inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100';

function durationLabel(min) {
  if (min < 60) return tr('{n} min', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? tr('{h} h {m} min', { h, m }) : tr('{h} h', { h });
}

// „Zaplanuj spotkanie” (jak w Teams): członkowie po koncie, goście po adresie e-mail.
// meeting — edycja (z meeting-get organizatora: goście z e-mailami).
export default function MeetingModal({ isOpen, onClose, currentUserEmail, meeting = null, onSaved }) {
  const editing = !!meeting;
  const [form, setForm] = useState(() => (meeting ? formFromMeeting(meeting) : { title: '', description: '', ...defaultSlot(), duration: DEFAULT_DURATION, kind: 'video', guestsAutoAdmit: false }));
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState(() => (meeting?.members || [])
    .filter((m) => !m.organizer && !sameEmail(m.email, currentUserEmail))
    .map((m) => ({ email: m.email, full_name: m.name })));
  const [guests, setGuests] = useState(() => (meeting?.guests || []).filter((g) => g.email).map((g) => ({ email: g.email, name: g.name })));
  const [guestText, setGuestText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const originalStart = useMemo(() => (meeting ? toStartsAt(formFromMeeting(meeting).date, formFromMeeting(meeting).time) : null), [meeting]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setLoadingUsers(true);
    supabase.from('app_users').select('email, full_name, avatar_url, status, is_active').order('full_name')
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) throw err;
        setUsers((data || []).filter((u) => u.email && !sameEmail(u.email, currentUserEmail)
          && u.is_active !== false && (u.status ?? 'active') === 'active'));
      })
      .catch((err) => toast.error(err, { fallback: tr('Nie udało się wczytać listy osób. Spróbuj ponownie.') }))
      .finally(() => { if (alive) setLoadingUsers(false); });
    return () => { alive = false; };
  }, [isOpen, currentUserEmail]);

  const accountByEmail = useMemo(() => new Map(users.map((u) => [normEmail(u.email), u])), [users]);
  const chosen = useMemo(() => new Set(members.map((m) => normEmail(m.email))), [members]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return users.filter((u) => !chosen.has(normEmail(u.email))
      && ((u.full_name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))).slice(0, 8);
  }, [users, query, chosen]);

  const addMember = (u) => {
    setMembers((prev) => (prev.some((m) => sameEmail(m.email, u.email)) ? prev : [...prev, u]));
    setGuests((prev) => prev.filter((g) => !sameEmail(g.email, u.email)));
    setQuery('');
  };
  const removeMember = (email) => setMembers((prev) => prev.filter((m) => !sameEmail(m.email, email)));

  // Adres e-mail osoby z kontem w aplikacji trafia do członków (zaproszenie po koncie).
  const addGuests = () => {
    const { emails, invalid } = parseGuestInput(guestText);
    if (invalid.length) {
      setError(tr('Nieprawidłowy adres e-mail: {email}', { email: invalid[0] }));
      return;
    }
    let toMembers = 0;
    const nextGuests = [...guests];
    for (const e of emails) {
      if (sameEmail(e, currentUserEmail)) continue;
      const acc = accountByEmail.get(normEmail(e));
      if (acc) { if (!chosen.has(normEmail(e))) { addMember(acc); toMembers += 1; } continue; }
      if (!nextGuests.some((g) => sameEmail(g.email, e))) nextGuests.push({ email: e, name: null });
    }
    if (nextGuests.length > MAX_GUESTS) {
      setError(tr('Na spotkanie można zaprosić najwyżej {n} gości', { n: MAX_GUESTS }));
      return;
    }
    setGuests(nextGuests);
    setGuestText('');
    setError('');
    if (toMembers) toast.info(tr('Osoby z kontem w aplikacji dodano jako uczestników: {n}', { n: toMembers }));
  };
  const removeGuest = (email) => setGuests((prev) => prev.filter((g) => !sameEmail(g.email, email)));

  const submit = async () => {
    const pendingGuests = parseGuestInput(guestText);
    if (guestText.trim() && (pendingGuests.emails.length || pendingGuests.invalid.length)) {
      setError(tr('Kliknij „Dodaj”, żeby zaprosić wpisane adresy, albo wyczyść pole.'));
      return;
    }
    const problem = validateForm(form, { editing, originalStart });
    if (problem) { setError(tr(problem)); return; }
    setError('');
    setSaving(true);
    try {
      const body = meetingPayload(form, { members, guests });
      const res = editing
        ? await callFn('meeting-update', { meeting_id: meeting.id, ...body })
        : await callFn('meeting-create', body);
      toast.success(editing ? tr('Zapisano zmiany spotkania') : (guests.length
        ? tr('Spotkanie zaplanowane. Zaproszenia wysłane.')
        : tr('Spotkanie zaplanowane')));
      onSaved?.(res.meeting);
      onClose();
    } catch (err) {
      if (err?.status === 503) setError(tr('Połączenia audio i wideo nie są jeszcze włączone. Zapytaj administratora.'));
      else setError(err?.context?.error || err?.message || tr('Nie udało się zapisać spotkania. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  const pill = (active) => `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
    active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? undefined : onClose}
      closeOnBackdrop={false}
      title={editing ? tr('Edytuj spotkanie') : tr('Zaplanuj spotkanie')}
      subtitle={tr('Spotkanie online audio/wideo z czatem')}
      icon={CalendarPlus}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr('Anuluj')}</Button>
          <Button icon={editing ? Save : CalendarPlus} onClick={submit} loading={saving}>
            {editing ? tr('Zapisz zmiany') : tr('Zaplanuj spotkanie')}
          </Button>
        </>
      )}
    >
      <div className="p-6 space-y-5">
        <div>
          <label htmlFor="mt-title" className={labelCls}>{tr('Nazwa')}</label>
          <input id="mt-title" type="text" value={form.title} onChange={set('title')} maxLength={120} placeholder={tr('np. Spotkanie liderów')} className={field} autoFocus={!editing} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <span id="mt-date-l" className={labelCls}>{tr('Dzień')}</span>
            <DateInput value={form.date} onChange={set('date')} required aria-labelledby="mt-date-l" />
          </div>
          <div>
            <span id="mt-time-l" className={labelCls}>{tr('Godzina')}</span>
            <TimeField value={form.time} onChange={set('time')} aria-labelledby="mt-time-l" />
          </div>
          <div>
            <span id="mt-dur-l" className={labelCls}>{tr('Czas trwania')}</span>
            <CustomSelect
              value={Number(form.duration)}
              onChange={(v) => setForm((f) => ({ ...f, duration: Number(v) }))}
              options={(DURATION_OPTIONS.includes(Number(form.duration)) ? DURATION_OPTIONS : [...DURATION_OPTIONS, Number(form.duration)].sort((a, b) => a - b))
                .map((m) => ({ value: m, label: durationLabel(m) }))}
              aria-labelledby="mt-dur-l"
            />
          </div>
        </div>

        <fieldset>
          <legend className={labelCls}>{tr('Rodzaj')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            <button type="button" role="radio" aria-checked={form.kind === 'video'} className={pill(form.kind === 'video')} onClick={() => set('kind')('video')}>
              <Video size={15} aria-hidden="true" /> {tr('Wideo')}
            </button>
            <button type="button" role="radio" aria-checked={form.kind === 'audio'} className={pill(form.kind === 'audio')} onClick={() => set('kind')('audio')}>
              <Phone size={15} aria-hidden="true" /> {tr('Tylko głos')}
            </button>
          </div>
        </fieldset>

        {/* Członkowie — po koncie */}
        <section aria-labelledby="mt-members-l">
          <h3 id="mt-members-l" className={labelCls}>{tr('Uczestnicy z kościoła')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tr('Dostaną powiadomienie w aplikacji, a spotkanie pojawi się w ich Komunikatorze.')}</p>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Szukaj osób…')} aria-label={tr('Szukaj osób')} className={`${field} pl-9`} />
          </div>
          {loadingUsers && <div className="py-3"><Spinner size={18} /></div>}
          {results.length > 0 && (
            <ul className="mt-2 space-y-0.5" aria-label={tr('Wyniki wyszukiwania')}>
              {results.map((u) => (
                <li key={u.email}>
                  <button type="button" onClick={() => addMember(u)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                    <UserAvatar user={u} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{u.full_name || u.email}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</span>
                    </span>
                    <Check size={15} className="text-gray-300" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {members.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {members.map((m) => (
                <span key={m.email} className={chip}>
                  {m.full_name || m.email}
                  <button type="button" onClick={() => removeMember(m.email)} aria-label={tr('Usuń z zaproszonych: {name}', { name: m.full_name || m.email })} className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Goście — po e-mailu */}
        <section aria-labelledby="mt-guests-l">
          <h3 id="mt-guests-l" className={labelCls}>{tr('Goście spoza aplikacji')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tr('Każdy dostanie e-mail z osobistym linkiem i plikiem do kalendarza. Konto nie jest potrzebne.')}</p>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="email"
                inputMode="email"
                multiple
                value={guestText}
                onChange={(e) => setGuestText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addGuests(); } }}
                placeholder={tr('adres@przyklad.pl')}
                aria-label={tr('Adresy e-mail gości')}
                className={`${field} pl-9`}
              />
            </div>
            <Button variant="secondary" onClick={addGuests} disabled={!guestText.trim()}>{tr('Dodaj')}</Button>
          </div>
          {guests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {guests.map((g) => (
                <span key={g.email} className={chip}>
                  {g.name ? `${g.name} · ${g.email}` : g.email}
                  <button type="button" onClick={() => removeGuest(g.email)} aria-label={tr('Usuń z zaproszonych: {name}', { name: g.email })} className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {guests.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer mt-3">
              <input type="checkbox" checked={form.guestsAutoAdmit} onChange={(e) => set('guestsAutoAdmit')(e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
              <span className="text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{tr('Wpuszczaj gości bez pytania')}</span>
                <span className="block text-gray-500 dark:text-gray-400">{tr('Bez tego gość czeka w poczekalni, aż ktoś ze spotkania go wpuści.')}</span>
              </span>
            </label>
          )}
        </section>

        <div>
          <label htmlFor="mt-desc" className={labelCls}>{tr('Opis')} <span className="font-normal text-gray-500">({tr('opcjonalnie')})</span></label>
          <textarea id="mt-desc" rows={3} value={form.description} onChange={set('description')} maxLength={2000} placeholder={tr('Plan spotkania, materiały…')} className={`${field} resize-y`} />
        </div>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
