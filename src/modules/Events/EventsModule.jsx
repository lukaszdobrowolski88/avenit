// Moduł „Wydarzenia" — pełnoprawny moduł (zastępuje dawny „Kalendarz").
// Jeden widok z przełącznikiem Kafelki/Lista/Kalendarz (w EventsListView) + filtr archiwum.
// „Nowe wydarzenie" (i dodawanie z widoku Kalendarz) otwiera szybki formularz → tworzy wydarzenie i otwiera jego stronę.
// Konfiguracja (kalendarze w pickerze, typy, pola, zakładki wg typu) — Ustawienia → Zarządzanie modułami.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Plus, Save } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import CustomSelect from '../../components/CustomSelect';
import TimeInput from '../../components/TimeInput';
import HomeGroupVisibilityPicker, { buildHgSegments, firstGroupFromKeys } from './HomeGroupVisibilityPicker';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { useModuleLabel } from '../../hooks/useModuleLabel';
import { useModules } from '../../hooks/useModules';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useT, tr } from '../../i18n';
import EventsListView from './EventsListView';
import { DateInput } from '../../components/pickers';
import { EventFormatPicker, hasPlace, isOnlineFormat } from './eventFormat';

// Domyślne moduły-kalendarze w pickerze (gdy admin nic nie skonfiguruje w Ustawieniach).
const DEFAULT_EVENT_MODULES = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'mlodziezowka'];

async function readEventCalendars() {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'event_calendars').maybeSingle();
    if (data?.value) { const arr = JSON.parse(data.value); if (Array.isArray(arr)) return arr; }
  } catch { /* brak konfiguracji */ }
  return null;
}

export default function EventsModule() {
  const t = useT();
  const title = useModuleLabel('calendar', t('Wydarzenia'));
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div>
        <PageHeader
          moduleKey="calendar"
          icon={CalendarIcon}
          title={title}
          subtitle={t('Wszystkie wydarzenia — kafelki, lista, kalendarz i archiwum')}
          actions={
            // Na telefonie sam „+” (tytuł strony nie jest ucinany), podpis od sm.
            <Button icon={Plus} onClick={() => setShowCreate(true)} aria-label={t('Nowe wydarzenie')}>
              <span className="hidden sm:inline">{t('Nowe wydarzenie')}</span>
            </Button>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto pt-6">
        <EventsListView onCreate={() => setShowCreate(true)} />
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// Godzina końca musi być po początku (porównanie 'HH:MM'; '18:00:00' z bazy = '18:00').
export const endNotAfterStart = (start, end) => {
  const a = String(start || '').slice(0, 5);
  const b = String(end || '').slice(0, 5);
  return !!(a && b && b <= a);
};

// Walidacja szybkiego formularza wydarzenia → { pole: komunikat } (puste = OK).
export function validateNewEvent(form) {
  const errors = {};
  if (!String(form?.title || '').trim()) errors.title = tr('Podaj tytuł wydarzenia.');
  if (!form?.date) errors.date = tr('Wybierz datę — bez niej wydarzenie nie trafi do kalendarza.');
  if (endNotAfterStart(form?.time, form?.end_time)) errors.end_time = tr('Koniec musi być później niż początek.');
  return errors;
}

const FieldError = ({ id, children }) => (children ? <p id={id} className="text-xs text-red-600 dark:text-red-400 mt-1 ml-1" role="alert">{children}</p> : null);

// Szybkie tworzenie wydarzenia — minimalny formularz, resztę ustawia się na stronie wydarzenia.
// Wspólny dla „Nowe wydarzenie” i dodawania z widoku Kalendarz (initial: { date, title, module_key, event_type, time }).
// Nic nie jest zapisywane przed kliknięciem „Utwórz i otwórz”.
export function CreateEventModal({ onClose, initial = null }) {
  const t = useT();
  const navigate = useNavigate();
  const { modules } = useModules();
  const { campusIdForInsert } = useCampusQuery();
  const [form, setForm] = useState(() => ({
    title: initial?.title || '',
    module_key: initial?.module_key || '',
    date: initial?.date || '',
    time: initial?.time || '',
    end_time: initial?.end_time || '',
    location: '',
    format: initial?.format || 'in_person',
    visKeys: [],
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(null); // klucze modułów-kalendarzy w pickerze
  const [homeGroups, setHomeGroups] = useState([]);
  const isHomeGroups = form.module_key === 'homegroups';
  const toggleVis = (key) => setForm((f) => ({ ...f, visKeys: f.visKeys.includes(key) ? f.visKeys.filter((k) => k !== key) : [...f.visKeys, key] }));
  const setField = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };

  useEffect(() => { readEventCalendars().then(setAllowed); }, []);
  // Dynamiczny wybór grupy domowej, gdy jako kalendarz/moduł wybrano „Grupy domowe".
  useEffect(() => {
    if (!isHomeGroups || homeGroups.length) return;
    supabase.from('home_groups').select('id, name, campus_id').order('name').then(({ data }) => setHomeGroups(data || []), () => {});
  }, [isHomeGroups, homeGroups.length]);

  const allowedKeys = Array.isArray(allowed) ? allowed : DEFAULT_EVENT_MODULES;
  const moduleOptions = [
    { value: '', label: t('Ogólne') },
    // Moduł wskazany z kalendarza jest zawsze na liście (nawet spoza konfiguracji pickera).
    ...modules.filter((m) => m.is_enabled && (allowedKeys.includes(m.key) || m.key === form.module_key)).map((m) => ({ value: m.key, label: m.label })),
  ];

  const create = async () => {
    const errs = validateNewEvent(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        title: form.title.trim(),
        module_key: form.module_key || null,
        date: form.date,
        time: form.time || null,
        end_time: form.end_time || null,
        location: hasPlace(form.format) ? (form.location || null) : null,
        format: form.format || 'in_person',
        created_by: user?.email || null,
        campus_id: campusIdForInsert,
      };
      if (initial?.event_type) row.event_type = initial.event_type;
      // Grupa domowa: widoczność wg zaznaczeń (członkowie/liderzy/koordynatorzy/konkretne grupy),
      // przypisanie do pierwszej konkretnej grupy (badge/filtr) + dziedziczenie jej kampusu.
      if (isHomeGroups && form.visKeys.length) {
        const nameOf = (id) => homeGroups.find((x) => String(x.id) === String(id))?.name || null;
        row.visibility_segments = buildHgSegments(form.visKeys, nameOf);
        const firstGroup = firstGroupFromKeys(form.visKeys);
        if (firstGroup) {
          row.home_group_id = firstGroup;
          const g = homeGroups.find((x) => String(x.id) === String(firstGroup));
          if (g && g.campus_id != null) row.campus_id = g.campus_id;
        }
      }
      const { data, error } = await supabase.from('events').insert([row]).select().single();
      if (error) throw error;
      toast.success(t('Utworzono wydarzenie'));
      onClose?.();
      navigate(`/wydarzenie/${data.id}`);
    } catch (e) { toast.error(e, { fallback: t('Nie udało się utworzyć wydarzenia. Spróbuj ponownie.') }); }
    finally { setSaving(false); }
  };

  const inputCls = (bad) => `w-full px-4 py-3 rounded-xl border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 ${bad ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      closeOnBackdrop={false}
      title={t('Nowe wydarzenie')}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('Anuluj')}</Button>
        <Button data-tour="cal-event-save" icon={Save} onClick={create} loading={saving}>{t('Utwórz i otwórz')}</Button>
      </>}
    >
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="new-event-title" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Tytuł')}</label>
          <input id="new-event-title" data-tour="cal-event-title" autoFocus value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder={t('Nazwa wydarzenia')}
            aria-invalid={!!errors.title || undefined} aria-describedby={errors.title ? 'new-event-title-err' : undefined}
            className={inputCls(errors.title)} />
          <FieldError id="new-event-title-err">{errors.title}</FieldError>
        </div>
        <CustomSelect label={t('Kalendarz / moduł')} value={form.module_key} onChange={(v) => setForm({ ...form, module_key: v, visKeys: [] })} options={moduleOptions} />
        {isHomeGroups && (
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Widoczność')}</label>
            <HomeGroupVisibilityPicker homeGroups={homeGroups} visKeys={form.visKeys} onToggle={toggleVis} />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-1">{form.visKeys.length ? t('Widoczne dla zaznaczonych osób (+ administratorzy).') : t('Nic nie zaznaczono = widoczne dla całej społeczności.')}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="new-event-date" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Data')}</label>
            <DateInput id="new-event-date" value={form.date} onChange={(e) => setField('date', e.target.value)}
              aria-invalid={!!errors.date || undefined}
              className={`w-full px-3 py-3 rounded-xl border bg-white dark:bg-gray-800 text-sm ${errors.date ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
            <FieldError>{errors.date}</FieldError>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Godzina')}</label>
            <TimeInput value={form.time} onChange={(v) => setField('time', v)}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Koniec')}</label>
            <TimeInput value={form.end_time} onChange={(v) => setField('end_time', v)}
              className={`w-full px-3 py-3 rounded-xl border bg-white dark:bg-gray-800 text-sm ${errors.end_time ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
            <FieldError>{errors.end_time}</FieldError>
          </div>
        </div>
        <div>
          <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Forma')}</span>
          <EventFormatPicker value={form.format} onChange={(f) => setField('format', f)} />
          {isOnlineFormat(form.format) && (
            <p className="mt-1.5 ml-1 text-xs text-gray-500 dark:text-gray-400">
              {form.time ? t('Utworzy się spotkanie online z czatem — dołączy każdy, kto widzi wydarzenie.') : t('Ustaw godzinę, żeby utworzyć spotkanie online.')}
            </p>
          )}
        </div>
        {hasPlace(form.format) && (
          <div>
            <label htmlFor="new-event-location" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Lokalizacja')}</label>
            <input id="new-event-location" value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder={t('Miejsce')}
              className={inputCls(false)} />
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('Szczegóły (typ, opis, płatność, rejestracja, widoczność, pola własne) ustawisz na stronie wydarzenia.')}</p>
      </div>
    </Modal>
  );
}
