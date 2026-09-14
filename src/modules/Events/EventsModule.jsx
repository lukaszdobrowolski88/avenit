// Moduł „Wydarzenia" — pełnoprawny moduł (zastępuje dawny „Kalendarz").
// Jeden widok z przełącznikiem Kafelki/Lista/Kalendarz (w EventsListView) + filtr archiwum.
// „Nowe wydarzenie" otwiera szybki formularz → tworzy wydarzenie i otwiera jego stronę.
// Konfiguracja (kalendarze w pickerze, typy, pola, zakładki wg typu) — Ustawienia → Zarządzanie modułami.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Plus, Save } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import CustomSelect from '../../components/CustomSelect';
import TimeInput from '../../components/TimeInput';
import HomeGroupVisibilityPicker, { buildHgSegments, firstGroupFromKeys } from './HomeGroupVisibilityPicker';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { useModuleLabel } from '../../hooks/useModuleLabel';
import { useModules } from '../../hooks/useModules';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useT } from '../../i18n';
import EventsListView from './EventsListView';

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
  const title = useModuleLabel('calendar', 'Wydarzenia');
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <PageHeader
          moduleKey="calendar"
          icon={CalendarIcon}
          title={title}
          subtitle={t('Wszystkie wydarzenia — kafelki, lista, kalendarz i archiwum')}
          actions={
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all">
              <Plus size={18} />
              {t('Nowe wydarzenie')}
            </button>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
        <EventsListView />
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// Szybkie tworzenie wydarzenia — minimalny formularz, resztę ustawia się na stronie wydarzenia.
function CreateEventModal({ onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const { modules } = useModules();
  const { campusIdForInsert } = useCampusQuery();
  const [form, setForm] = useState({ title: '', module_key: '', date: '', time: '', end_time: '', location: '', visKeys: [] });
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(null); // klucze modułów-kalendarzy w pickerze
  const [homeGroups, setHomeGroups] = useState([]);
  const isHomeGroups = form.module_key === 'homegroups';
  const toggleVis = (key) => setForm((f) => ({ ...f, visKeys: f.visKeys.includes(key) ? f.visKeys.filter((k) => k !== key) : [...f.visKeys, key] }));

  useEffect(() => { readEventCalendars().then(setAllowed); }, []);
  // Dynamiczny wybór grupy domowej, gdy jako kalendarz/moduł wybrano „Grupy domowe".
  useEffect(() => {
    if (!isHomeGroups || homeGroups.length) return;
    supabase.from('home_groups').select('id, name, campus_id').order('name').then(({ data }) => setHomeGroups(data || []), () => {});
  }, [isHomeGroups, homeGroups.length]);

  const allowedKeys = Array.isArray(allowed) ? allowed : DEFAULT_EVENT_MODULES;
  const moduleOptions = [
    { value: '', label: t('Ogólne') },
    ...modules.filter((m) => m.is_enabled && allowedKeys.includes(m.key)).map((m) => ({ value: m.key, label: m.label })),
  ];

  const create = async () => {
    if (!form.title.trim()) { toast.error(t('Podaj tytuł')); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        title: form.title.trim(),
        module_key: form.module_key || null,
        date: form.date || null,
        time: form.time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        created_by: user?.email || null,
        campus_id: campusIdForInsert,
      };
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
      navigate(`/wydarzenie/${data.id}`);
    } catch (e) { toast.error('Nie udało się utworzyć: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="md" title={t('Nowe wydarzenie')}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Tytuł')}</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('Nazwa wydarzenia')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <CustomSelect label={t('Kalendarz / moduł')} value={form.module_key} onChange={(v) => setForm({ ...form, module_key: v, visKeys: [] })} options={moduleOptions} />
        {isHomeGroups && (
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Widoczność')}</label>
            <HomeGroupVisibilityPicker homeGroups={homeGroups} visKeys={form.visKeys} onToggle={toggleVis} />
            <p className="text-[11px] text-gray-400 mt-1 ml-1">{form.visKeys.length ? t('Widoczne dla zaznaczonych osób (+ administratorzy).') : t('Nic nie zaznaczono = widoczne dla całej społeczności.')}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Data')}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Godzina')}</label>
            <TimeInput value={form.time} onChange={(v) => setForm({ ...form, time: v })}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Koniec')}</label>
            <TimeInput value={form.end_time} onChange={(v) => setForm({ ...form, end_time: v })}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Lokalizacja')}</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t('Miejsce')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
        </div>
        <p className="text-xs text-gray-400">{t('Szczegóły (typ, opis, płatność, rejestracja, widoczność, pola własne) ustawisz na stronie wydarzenia.')}</p>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">{t('Anuluj')}</button>
        <button onClick={create} disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60 flex items-center gap-1.5">
          <Save size={15} /> {saving ? t('Tworzenie…') : t('Utwórz i otwórz')}
        </button>
      </div>
    </Modal>
  );
}
