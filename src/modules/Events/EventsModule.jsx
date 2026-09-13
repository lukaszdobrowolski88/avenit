// Moduł „Wydarzenia" — pełnoprawny moduł (zastępuje dawny „Kalendarz").
// Jeden widok z przełącznikiem Kafelki/Lista/Kalendarz (w EventsListView) + filtr archiwum.
// „Nowe wydarzenie" otwiera szybki formularz → tworzy wydarzenie i otwiera jego stronę.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Plus, Save, Settings, X } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import CustomSelect from '../../components/CustomSelect';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { useModuleLabel, useModuleCalendars } from '../../hooks/useModuleLabel';
import { useModules } from '../../hooks/useModules';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useCan } from '../../components/Can';
import { useT } from '../../i18n';
import EventsListView from './EventsListView';

// Domyślne moduły-kalendarze widoczne w pickerze (gdy admin nic nie skonfiguruje).
const DEFAULT_EVENT_MODULES = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'mlodziezowka'];

// Typy dla kalendarza „Ogólne" (spójne z EventDetailPage DEFAULT_TYPES).
const OGOLNE_TYPES = [
  { value: 'spotkanie', label: 'Spotkanie' },
  { value: 'wydarzenie', label: 'Wydarzenie' },
  { value: 'szkolenie', label: 'Szkolenie' },
  { value: 'inne', label: 'Inne' },
];
const slugTab = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('t' + Math.random().toString(36).slice(2, 7));

async function readEventCalendars() {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'event_calendars').maybeSingle();
    if (data?.value) { const arr = JSON.parse(data.value); if (Array.isArray(arr)) return arr; }
  } catch { /* brak konfiguracji */ }
  return null;
}
async function readEventTypeTabs() {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'event_type_tabs').maybeSingle();
    if (data?.value) { const arr = JSON.parse(data.value); if (Array.isArray(arr)) return arr; }
  } catch { /* brak konfiguracji */ }
  return [];
}

export default function EventsModule() {
  const t = useT();
  const title = useModuleLabel('calendar', 'Wydarzenia');
  const canManageSettings = useCan('module:settings');
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <PageHeader
          moduleKey="calendar"
          icon={CalendarIcon}
          title={title}
          subtitle={t('Wszystkie wydarzenia — kafelki, lista, kalendarz i archiwum')}
          actions={
            <div className="flex items-center gap-2">
              {canManageSettings && (
                <button onClick={() => setShowSettings(true)} title={t('Ustawienia wydarzeń')}
                  className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <Settings size={18} />
                </button>
              )}
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all">
                <Plus size={18} />
                {t('Nowe wydarzenie')}
              </button>
            </div>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
        <EventsListView />
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
      {showSettings && <EventSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// Szybkie tworzenie wydarzenia — minimalny formularz, resztę ustawia się na stronie wydarzenia.
function CreateEventModal({ onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const { modules } = useModules();
  const { campusIdForInsert } = useCampusQuery();
  const [form, setForm] = useState({ title: '', module_key: '', date: '', time: '', end_time: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(null); // lista kluczy modułów-kalendarzy w pickerze

  useEffect(() => { readEventCalendars().then(setAllowed); }, []);

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
      const { data, error } = await supabase.from('events').insert([{
        title: form.title.trim(),
        module_key: form.module_key || null,
        date: form.date || null,
        time: form.time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        created_by: user?.email || null,
        campus_id: campusIdForInsert,
      }]).select().single();
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
        <CustomSelect label={t('Kalendarz / moduł')} value={form.module_key} onChange={(v) => setForm({ ...form, module_key: v })} options={moduleOptions} />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Data')}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Godzina')}</label>
            <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="18:00"
              className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Koniec')}</label>
            <input value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} placeholder="20:00"
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

// Ustawienia wydarzeń: (A) kalendarze w pickerze, (B) zakładki wg typu wydarzenia.
function EventSettingsModal({ onClose }) {
  const t = useT();
  const { modules } = useModules();
  const calendars = useModuleCalendars(); // { key: { types:[{value,label}] } }
  const [selected, setSelected] = useState(null); // Set kluczy modułów w pickerze
  const [rules, setRules] = useState(null);       // [{module_key, event_type, tabsText}]
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readEventCalendars().then((arr) => setSelected(new Set(Array.isArray(arr) ? arr : DEFAULT_EVENT_MODULES)));
    readEventTypeTabs().then((arr) => setRules(arr.map((r) => ({
      module_key: r.module_key || '', event_type: r.event_type || '',
      tabsText: (r.tabs || []).map((x) => x.label).join(', '),
    }))));
  }, []);

  const enabledModules = modules.filter((m) => m.is_enabled);
  const toggle = (key) => setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const moduleOpts = [{ value: '', label: t('Ogólne') }, ...enabledModules.map((m) => ({ value: m.key, label: m.label }))];
  const typeOptsFor = (mk) => {
    const types = mk ? (calendars[mk]?.types || []) : OGOLNE_TYPES;
    return [{ value: '', label: '— wybierz typ —' }, ...types.map((tp) => ({ value: tp.value, label: tp.label }))];
  };
  const addRule = () => setRules((r) => [...(r || []), { module_key: '', event_type: '', tabsText: '' }]);
  const updRule = (i, patch) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delRule = (i) => setRules((r) => r.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    try {
      const calArr = [...(selected || [])];
      const tabsArr = (rules || []).filter((r) => r.event_type && r.tabsText.trim()).map((r) => ({
        module_key: r.module_key || '',
        event_type: r.event_type,
        tabs: r.tabsText.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ id: slugTab(label), label })),
      }));
      const [a, b] = await Promise.all([
        supabase.from('app_settings').upsert({ key: 'event_calendars', value: JSON.stringify(calArr) }, { onConflict: 'key' }),
        supabase.from('app_settings').upsert({ key: 'event_type_tabs', value: JSON.stringify(tabsArr) }, { onConflict: 'key' }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      toast.success(t('Zapisano ustawienia'));
      onClose();
    } catch (e) { toast.error('Nie udało się zapisać: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg" title={t('Ustawienia wydarzeń')}>
      <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
        {/* A. Kalendarze w pickerze */}
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Kalendarze w pickerze</h4>
            <p className="text-xs text-gray-400 mt-0.5">Które moduły pojawiają się w polu „Kalendarz / moduł" przy dodawaniu wydarzenia. „Ogólne" jest zawsze dostępne.</p>
          </div>
          {selected === null ? <p className="text-sm text-gray-400 py-3 text-center">Wczytywanie…</p> : (
            <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
              {enabledModules.map((m) => (
                <label key={m.key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggle(m.key)} className="w-4 h-4 rounded accent-accent-primary" />
                  <span className="text-gray-700 dark:text-gray-200">{m.label}</span>
                  <span className="ml-auto text-[11px] text-gray-400">{m.key}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* B. Zakładki wg typu wydarzenia */}
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Zakładki wg typu wydarzenia</h4>
            <p className="text-xs text-gray-400 mt-0.5">Dla wybranego kalendarza i typu (np. Nabożeństwo) dodaj dodatkowe zakładki na stronie wydarzenia (np. „Szkółka Niedzielna", „Atmosfera Team"). Nazwy po przecinku.</p>
          </div>
          {rules === null ? <p className="text-sm text-gray-400 py-3 text-center">Wczytywanie…</p> : (
            <div className="space-y-2">
              {rules.map((r, i) => (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-44"><CustomSelect value={r.module_key} onChange={(v) => updRule(i, { module_key: v, event_type: '' })} options={moduleOpts} /></div>
                    <div className="w-44"><CustomSelect value={r.event_type} onChange={(v) => updRule(i, { event_type: v })} options={typeOptsFor(r.module_key)} /></div>
                    <button onClick={() => delRule(i)} className="ml-auto p-1.5 text-gray-400 hover:text-red-500"><X size={16} /></button>
                  </div>
                  <input value={r.tabsText} onChange={(e) => updRule(i, { tabsText: e.target.value })}
                    placeholder="Zakładki po przecinku, np. Szkółka Niedzielna, Atmosfera Team"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                </div>
              ))}
              <button onClick={addRule} className="flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary"><Plus size={15} /> Dodaj regułę</button>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">{t('Anuluj')}</button>
        <button onClick={save} disabled={saving || selected === null} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60">{saving ? t('Zapisywanie…') : t('Zapisz')}</button>
      </div>
    </Modal>
  );
}
