// Konfiguracja wydarzeń danego modułu (lub „Ogólne" = kalendarz Wydarzenia).
// W jednym miejscu (Ustawienia → Zarządzanie modułami): Typy, Pola własne, Zakładki wg typu,
// a dla kalendarza „Ogólne" dodatkowo — które moduły widać w pickerze „Kalendarz / moduł".
import React, { useState, useEffect } from 'react';
import { X, Plus, SlidersHorizontal, ListChecks, LayoutList, Users } from 'lucide-react';
import Modal from '../../../components/Modal';
import CustomSelect from '../../../components/CustomSelect';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { useModules } from '../../../hooks/useModules';
import { useModuleCalendars, saveModuleCalendar } from '../../../hooks/useModuleLabel';
import { EventTypesEditor, EventFieldsEditor } from '../../shared/EventsTab';
import { tr } from '../../../i18n';

const OGOLNE_TYPES = [
  { value: 'spotkanie', label: 'Spotkanie' },
  { value: 'wydarzenie', label: 'Wydarzenie' },
  { value: 'szkolenie', label: 'Szkolenie' },
  { value: 'inne', label: 'Inne' },
];
const DEFAULT_EVENT_MODULES = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'mlodziezowka'];
const TEAM_OPTIONS = [
  { value: 'worship', label: 'Zespół Uwielbienia' },
  { value: 'media', label: 'Media Team' },
  { value: 'atmosfera', label: 'Atmosfera Team' },
  { value: 'kids', label: 'Małe Avenit' },
  { value: 'mc', label: 'Scena / MC' },
];
const slugTab = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('t' + Math.random().toString(36).slice(2, 7));

export default function EventConfigModal({ moduleKey, label, isGeneral = false, onClose }) {
  const { modules } = useModules();
  const calendars = useModuleCalendars();
  const cfgKey = isGeneral ? 'general' : moduleKey; // klucz typów/pól
  const scopeKey = isGeneral ? '' : moduleKey;       // klucz reguł zakładek (Ogólne = '')

  const [showTypes, setShowTypes] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [fields, setFields] = useState([]);
  const [rules, setRules] = useState(null);       // [{event_type, tabsText}]
  const [otherRules, setOtherRules] = useState([]); // reguły innych zakresów (zachowujemy)
  const [teamRules, setTeamRules] = useState(null); // [{event_type, teams:[team_type]}]
  const [otherTeamRules, setOtherTeamRules] = useState([]);
  const [pickerSel, setPickerSel] = useState(null); // Set kluczy (tylko isGeneral)
  const [saving, setSaving] = useState(false);

  const loadFields = () => {
    supabase.from('event_custom_fields').select('*').eq('module_key', cfgKey).order('sort_order', { ascending: true })
      .then(({ data }) => setFields(data || [])).catch(() => setFields([]));
  };
  useEffect(() => { loadFields(); /* eslint-disable-next-line */ }, [cfgKey]);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'event_type_tabs').maybeSingle().then(({ data }) => {
      let all = []; try { all = JSON.parse(data?.value || '[]'); } catch { all = []; }
      if (!Array.isArray(all)) all = [];
      setOtherRules(all.filter((r) => (r?.module_key || '') !== scopeKey));
      setRules(all.filter((r) => (r?.module_key || '') === scopeKey).map((r) => ({
        event_type: r.event_type || '', tabsText: (r.tabs || []).map((x) => x.label).join(', '), materials: !!r.materials,
      })));
    }).catch(() => { setRules([]); setOtherRules([]); });
    supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle().then(({ data }) => {
      let all = []; try { all = JSON.parse(data?.value || '[]'); } catch { all = []; }
      if (!Array.isArray(all)) all = [];
      setOtherTeamRules(all.filter((r) => (r?.module_key || '') !== scopeKey));
      setTeamRules(all.filter((r) => (r?.module_key || '') === scopeKey).map((r) => ({
        event_type: r.event_type || '', teams: Array.isArray(r.teams) ? r.teams : [],
      })));
    }).catch(() => { setTeamRules([]); setOtherTeamRules([]); });
    if (isGeneral) {
      supabase.from('app_settings').select('value').eq('key', 'event_calendars').maybeSingle().then(({ data }) => {
        let arr = null; try { arr = JSON.parse(data?.value || 'null'); } catch { arr = null; }
        setPickerSel(new Set(Array.isArray(arr) ? arr : DEFAULT_EVENT_MODULES));
      }).catch(() => setPickerSel(new Set(DEFAULT_EVENT_MODULES)));
    }
  }, [scopeKey, isGeneral]);

  const typeList = (calendars[cfgKey]?.types?.length ? calendars[cfgKey].types : (isGeneral ? OGOLNE_TYPES : []));
  const typeOpts = [{ value: '', label: '— wybierz typ —' }, ...typeList.map((tp) => ({ value: tp.value, label: tp.label }))];

  const addRule = () => setRules((r) => [...(r || []), { event_type: '', tabsText: '', materials: false }]);
  const updRule = (i, patch) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delRule = (i) => setRules((r) => r.filter((_, j) => j !== i));
  const togglePicker = (key) => setPickerSel((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const teamOptions = [...TEAM_OPTIONS, ...(!isGeneral && !TEAM_OPTIONS.some((o) => o.value === moduleKey) ? [{ value: moduleKey, label }] : [])];
  const addTeamRule = () => setTeamRules((r) => [...(r || []), { event_type: '', teams: [] }]);
  const updTeamRule = (i, patch) => setTeamRules((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delTeamRule = (i) => setTeamRules((r) => r.filter((_, j) => j !== i));
  const toggleTeam = (i, tt) => setTeamRules((r) => r.map((x, j) => (j === i ? { ...x, teams: x.teams.includes(tt) ? x.teams.filter((t) => t !== tt) : [...x.teams, tt] } : x)));

  const save = async () => {
    setSaving(true);
    try {
      const scopeRules = (rules || []).filter((r) => r.event_type && (r.tabsText.trim() || r.materials)).map((r) => ({
        module_key: scopeKey,
        event_type: r.event_type,
        tabs: r.tabsText.split(',').map((s) => s.trim()).filter(Boolean).map((l) => ({ id: slugTab(l), label: l })),
        materials: !!r.materials,
      }));
      const merged = [...otherRules, ...scopeRules];
      const scopeTeamRules = (teamRules || []).filter((r) => r.event_type && r.teams.length).map((r) => ({
        module_key: scopeKey, event_type: r.event_type, teams: r.teams,
      }));
      const mergedTeams = [...otherTeamRules, ...scopeTeamRules];
      const ops = [
        supabase.from('app_settings').upsert({ key: 'event_type_tabs', value: JSON.stringify(merged) }, { onConflict: 'key' }),
        supabase.from('app_settings').upsert({ key: 'event_type_teams', value: JSON.stringify(mergedTeams) }, { onConflict: 'key' }),
      ];
      if (isGeneral) ops.push(supabase.from('app_settings').upsert({ key: 'event_calendars', value: JSON.stringify([...(pickerSel || [])]) }, { onConflict: 'key' }));
      const res = await Promise.all(ops);
      for (const r of res) if (r.error) throw r.error;
      toast.success(tr('Zapisano konfigurację'));
      onClose();
    } catch (e) { toast.error('Nie udało się zapisać: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const enabledModules = modules.filter((m) => m.is_enabled);

  return (
    <>
      <Modal isOpen onClose={onClose} size="lg" title={`${tr('Wydarzenia')} — ${label}`}>
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Typy + Pola */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowTypes(true)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
              <SlidersHorizontal size={16} /> {tr('Typy wydarzeń')}
            </button>
            <button onClick={() => setShowFields(true)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
              <ListChecks size={16} /> {tr('Pola własne')} {fields.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">{fields.length}</span>}
            </button>
          </div>

          {/* Zakładki wg typu */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <LayoutList size={16} className="text-accent-primary" />
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{tr('Zakładki wg typu')}</h4>
            </div>
            <p className="text-xs text-gray-400">Dla wybranego typu dodaj dodatkowe zakładki na stronie wydarzenia (nazwy po przecinku), np. „Szkółka Niedzielna, Atmosfera Team".</p>
            {rules === null ? <p className="text-sm text-gray-400 py-2">Wczytywanie…</p> : (
              <div className="space-y-2">
                {rules.map((r, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-48"><CustomSelect value={r.event_type} onChange={(v) => updRule(i, { event_type: v })} options={typeOpts} /></div>
                      <button onClick={() => delRule(i)} className="ml-auto p-1.5 text-gray-400 hover:text-red-500"><X size={16} /></button>
                    </div>
                    <input value={r.tabsText} onChange={(e) => updRule(i, { tabsText: e.target.value })}
                      placeholder="Zakładki po przecinku, np. Szkółka Niedzielna, Atmosfera Team"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={!!r.materials} onChange={(e) => updRule(i, { materials: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
                      {tr('Zakładka „Materiały" (upload + podpinanie plików)')}
                    </label>
                  </div>
                ))}
                {typeList.length === 0
                  ? <p className="text-xs text-amber-600 dark:text-amber-400">Najpierw zdefiniuj „Typy wydarzeń", aby móc przypisać do nich zakładki.</p>
                  : <button onClick={addRule} className="flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary"><Plus size={15} /> Dodaj regułę</button>}
              </div>
            )}
          </div>

          {/* Służby wg typu */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-accent-primary" />
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Służby wg typu</h4>
            </div>
            <p className="text-xs text-gray-400">Które służby pojawią się w zakładce „Służby" wydarzenia danego typu (np. Nabożeństwo → Uwielbienie, Media, Atmosfera, Kids). Bez reguły — pokazuje służbę tego modułu.</p>
            {teamRules === null ? <p className="text-sm text-gray-400 py-2">Wczytywanie…</p> : (
              <div className="space-y-2">
                {teamRules.map((r, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-48"><CustomSelect value={r.event_type} onChange={(v) => updTeamRule(i, { event_type: v })} options={typeOpts} /></div>
                      <button onClick={() => delTeamRule(i)} className="ml-auto p-1.5 text-gray-400 hover:text-red-500"><X size={16} /></button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {teamOptions.map((o) => (
                        <button key={o.value} type="button" onClick={() => toggleTeam(i, o.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${r.teams.includes(o.value) ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {typeList.length === 0
                  ? <p className="text-xs text-amber-600 dark:text-amber-400">Najpierw zdefiniuj „Typy wydarzeń", aby przypisać do nich służby.</p>
                  : <button onClick={addTeamRule} className="flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary"><Plus size={15} /> Dodaj regułę</button>}
              </div>
            )}
          </div>

          {/* Kalendarze w pickerze (tylko dla „Ogólne"/Wydarzenia) */}
          {isGeneral && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Kalendarze w pickerze</h4>
              <p className="text-xs text-gray-400">Które moduły pojawiają się w polu „Kalendarz / moduł" przy dodawaniu wydarzenia. „Ogólne" zawsze dostępne.</p>
              {pickerSel === null ? <p className="text-sm text-gray-400 py-2">Wczytywanie…</p> : (
                <div className="max-h-52 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
                  {enabledModules.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <input type="checkbox" checked={pickerSel.has(m.key)} onChange={() => togglePicker(m.key)} className="w-4 h-4 rounded accent-accent-primary" />
                      <span className="text-gray-700 dark:text-gray-200">{m.label}</span>
                      <span className="ml-auto text-[11px] text-gray-400">{m.key}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">{tr('Anuluj')}</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60">{saving ? tr('Zapisywanie…') : tr('Zapisz')}</button>
        </div>
      </Modal>

      {showTypes && (
        <EventTypesEditor
          initial={typeList}
          onClose={() => setShowTypes(false)}
          onSave={async (types) => {
            try { await saveModuleCalendar(cfgKey, { ...(calendars[cfgKey] || {}), types }); toast.success(tr('Zapisano typy wydarzeń')); setShowTypes(false); }
            catch (e) { toast.error(e.message); }
          }}
        />
      )}
      {showFields && (
        <EventFieldsEditor
          moduleKey={cfgKey}
          initial={fields}
          onClose={() => setShowFields(false)}
          onSaved={() => { loadFields(); setShowFields(false); }}
        />
      )}
    </>
  );
}
