import React, { useEffect, useState } from 'react';
import { X, Zap, Plus, Trash2, Bell, Flag, CalendarPlus, UserPlus, MessageSquarePlus } from 'lucide-react';
import Modal from '../../../components/Modal';
import CustomSelect from '../../../components/CustomSelect';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { Toggle } from '../../Settings/components/SettingsUI';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { confirmDialog } from '../../../lib/dialog';
import '../../../components/toolbar.css';

const TRIGGERS = [
  { type: 'status_changes_to', label: 'Gdy status zmieni się na…' },
  { type: 'column_changes', label: 'Gdy zmieni się kolumna…' },
  { type: 'person_assigned', label: 'Gdy przypisano osobę' },
  { type: 'item_created', label: 'Gdy utworzono element' },
  { type: 'date_arrives', label: 'Gdy nadejdzie data… (serwer)' },
  { type: 'every_period', label: 'Cyklicznie (co okres)… (serwer)' },
];
const ACTION_TYPES = [
  { type: 'notify', label: 'Powiadom', icon: Bell },
  { type: 'change_status', label: 'Zmień status', icon: Flag },
  { type: 'set_date', label: 'Ustaw datę', icon: CalendarPlus },
  { type: 'assign_person', label: 'Przypisz osobę', icon: UserPlus },
  { type: 'create_update', label: 'Dodaj komentarz', icon: MessageSquarePlus },
  { type: 'create_item', label: 'Utwórz element', icon: Plus },
];
// Akcje, które wykonuje dany wyzwalacz. Natychmiastowe — klient (useBoardAutomations), wszystkie.
// Czasowe — worker (packages/api/src/fn/board-automations-run.js): „gdy nadejdzie data” umie
// powiadomić / zmienić status / ustawić datę / dodać komentarz, „cyklicznie” — tylko utworzyć element.
const SERVER_ACTIONS = {
  date_arrives: ['notify', 'change_status', 'set_date', 'create_update'],
  every_period: ['create_item'],
};
export const actionsForTrigger = (type) => (SERVER_ACTIONS[type]
  ? ACTION_TYPES.filter((a) => SERVER_ACTIONS[type].includes(a.type))
  : ACTION_TYPES);
const isServerTrigger = (type) => !!SERVER_ACTIONS[type];

const WEEKDAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const DATE_MODES = [
  { value: 'on', label: 'w dniu terminu' },
  { value: 'before', label: 'dni przed terminem' },
  { value: 'after', label: 'dni po terminie' },
];

const statusCols = (cols) => cols.filter(c => c.type === 'status' || c.type === 'priority');
const dateCols = (cols) => cols.filter(c => c.type === 'date' || c.type === 'timeline');
const peopleCols = (cols) => cols.filter(c => c.type === 'people');
const NONE = '';

// Przesunięcie wyzwalacza „gdy nadejdzie data” ↔ pole trigger.daysBefore, które czyta worker
// (dopasowuje komórkę = dziś + daysBefore: dodatnie = przed terminem, ujemne = po terminie).
export function daysBeforeFrom(mode, days) {
  const n = Math.max(0, Math.min(365, Math.round(Number(days) || 0)));
  if (mode === 'before') return n;
  if (mode === 'after') return -n;
  return 0;
}

export function sentence(a, columns) {
  const colName = (id) => columns.find(c => c.id === id)?.name || '?';
  const labelName = (colId, val) => (columns.find(c => c.id === colId)?.settings?.labels || []).find(l => l.id === val)?.title || val;
  let t = '';
  const trg = a.trigger || {};
  if (trg.type === 'status_changes_to') t = tr('Gdy „{col}" = „{label}"', { col: colName(trg.columnId), label: labelName(trg.columnId, trg.value) });
  else if (trg.type === 'column_changes') t = tr('Gdy zmieni się „{col}"', { col: colName(trg.columnId) });
  else if (trg.type === 'person_assigned') t = tr('Gdy przypisano osobę');
  else if (trg.type === 'item_created') t = tr('Gdy utworzono element');
  else if (trg.type === 'date_arrives') {
    const d = Number(trg.daysBefore) || 0;
    const when = d > 0 ? tr('{n} dni przed', { n: d }) : d < 0 ? tr('{n} dni po', { n: -d }) : '';
    t = tr('Gdy nadejdzie „{col}"', { col: colName(trg.columnId) }) + (when ? ` (${when})` : '');
  } else if (trg.type === 'every_period') t = tr('Cyklicznie ({period})', { period: trg.period === 'weekly' ? tr('co tydzień') : trg.period === 'monthly' ? tr('co miesiąc') : tr('codziennie') });
  const acts = (a.actions || []).map(ac => {
    const l = ACTION_TYPES.find(x => x.type === ac.type)?.label;
    const label = l ? tr(l) : ac.type;
    return ac.type === 'create_item' && ac.params?.name ? `${label} „${ac.params.name}”` : label;
  }).join(' + ');
  return `${t} → ${acts}`;
}

// Parametry akcji „Utwórz element”: nazwa, grupa, status, osoba (komórki dla klienta i workera)
// i — przy wyzwalaczach natychmiastowych — termin „dziś + N dni”.
export function createItemParams(form, columns, { allowDue = true } = {}) {
  const cells = {};
  if (form.statusColumnId && form.statusValue) cells[form.statusColumnId] = form.statusValue;
  if (form.peopleColumnId && form.assignee?.email) cells[form.peopleColumnId] = [{ email: form.assignee.email, name: form.assignee.name || form.assignee.email }];
  const params = { name: (form.name || '').trim() || tr('Nowe zadanie'), cells };
  if (form.groupId) params.groupId = form.groupId;
  const due = dateCols(columns).find(c => c.id === form.dueColumnId && c.type === 'date');
  if (allowDue && due && form.dueOffsetDays !== '' && form.dueOffsetDays != null) {
    params.dueColumnId = due.id;
    params.dueOffsetDays = Math.max(-365, Math.min(365, Math.round(Number(form.dueOffsetDays) || 0)));
  }
  return params;
}

const SMALL_INPUT = 'text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none';

function CreateItemFields({ form, setForm, columns, people, groups, allowDue }) {
  const sCol = statusCols(columns).find(c => c.type === 'status') || statusCols(columns)[0];
  const pCol = peopleCols(columns)[0];
  const dCols = dateCols(columns).filter(c => c.type === 'date');
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  return (
    <div className="space-y-2">
      <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={tr('Nazwa nowego elementu')}
        aria-label={tr('Nazwa nowego elementu')} className={`w-full ${SMALL_INPUT}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {groups.length > 0 && (
          <CustomSelect compact aria-label={tr('Grupa')} value={form.groupId || NONE} onChange={(v) => set({ groupId: v || null })}
            options={[{ value: NONE, label: tr('Pierwsza grupa') }, ...groups.map(g => ({ value: g.id, label: g.name }))]} />
        )}
        {sCol && (
          <CustomSelect compact aria-label={sCol.name} value={form.statusValue || NONE}
            onChange={(v) => set({ statusColumnId: sCol.id, statusValue: v || null })}
            options={[{ value: NONE, label: tr('Bez statusu') }, ...(sCol.settings?.labels || []).map(l => ({ value: l.id, label: l.title }))]} />
        )}
        {pCol && people.length > 0 && (
          <CustomSelect compact aria-label={pCol.name} value={form.assignee?.email || NONE}
            onChange={(v) => { const p = people.find(x => x.email === v); set({ peopleColumnId: pCol.id, assignee: p ? { email: p.email, name: p.name } : null }); }}
            options={[{ value: NONE, label: tr('Bez osoby') }, ...people.map(p => ({ value: p.email, label: p.name || p.email }))]} />
        )}
        {allowDue && dCols.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{tr('Termin: dziś +')}</span>
            <input type="number" min={0} max={365} value={form.dueOffsetDays ?? ''} placeholder="—"
              onChange={(e) => set({ dueColumnId: form.dueColumnId || dCols[0].id, dueOffsetDays: e.target.value === '' ? '' : Number(e.target.value) })}
              aria-label={tr('Termin nowego elementu: za ile dni')} className={`w-16 ${SMALL_INPUT}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{tr('dni')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const emptyItemForm = () => ({ name: '', groupId: null, statusColumnId: null, statusValue: null, peopleColumnId: null, assignee: null, dueColumnId: null, dueOffsetDays: '' });

export default function AutomationsPanel({ automations, columns, people, groups: groupsProp, onAdd, onUpdate, onDelete, onClose }) {
  const [creating, setCreating] = useState(false);
  const [trigger, setTrigger] = useState({ type: 'status_changes_to', columnId: statusCols(columns)[0]?.id, value: statusCols(columns)[0]?.settings?.labels?.[0]?.id });
  const [dateOffset, setDateOffset] = useState({ mode: 'on', days: 1 });
  const [actions, setActions] = useState([{ type: 'notify', params: { targetType: 'assignee' } }]);
  const [groups, setGroups] = useState(groupsProp || []);
  const boardId = columns[0]?.board_id;

  // Grupy tablicy do akcji „Utwórz element” (gdy rodzic ich nie podał).
  useEffect(() => {
    if (groupsProp) { setGroups(groupsProp); return; }
    if (!boardId) return;
    supabase.from('board_groups').select('id, name, display_order').eq('board_id', boardId).order('display_order')
      .then(({ data }) => setGroups(data || []));
  }, [groupsProp, boardId]);

  const setTr = (patch) => setTrigger(t => ({ ...t, ...patch }));
  const setAct = (i, patch) => setActions(list => list.map((a, j) => j === i ? { ...a, params: { ...a.params, ...patch } } : a));
  const setActType = (i, type) => setActions(list => list.map((a, j) => j === i ? { type, params: defaultParams(type) } : a));
  // Formularz „Utwórz element” trzymany przy akcji (a.form) — zamieniany na params przy zapisie.
  const setItemForm = (i, fn) => setActions(list => list.map((a, j) => j === i ? { ...a, form: fn(a.form || emptyItemForm()) } : a));
  const allowed = actionsForTrigger(trigger.type);

  function defaultParams(type) {
    if (type === 'notify') return { targetType: 'assignee' };
    if (type === 'change_status') return { columnId: statusCols(columns)[0]?.id, value: statusCols(columns)[0]?.settings?.labels?.[0]?.id };
    if (type === 'set_date') return { columnId: dateCols(columns)[0]?.id, offsetDays: 0 };
    if (type === 'assign_person') return { columnId: peopleCols(columns)[0]?.id, email: people[0]?.email, name: people[0]?.name };
    if (type === 'create_update') return { text: '' };
    if (type === 'create_item') return {};
    return {};
  }

  // Zmiana wyzwalacza: akcje, których nowy wyzwalacz nie wykona, zamień na pierwszą dozwoloną.
  const changeTrigger = (type) => {
    setTr({ type, columnId: type === 'date_arrives' ? dateCols(columns)[0]?.id : statusCols(columns)[0]?.id });
    const ok = actionsForTrigger(type).map(a => a.type);
    setActions(list => {
      const kept = list.filter(a => ok.includes(a.type));
      return kept.length ? kept : [{ type: ok[0], params: defaultParams(ok[0]) }];
    });
  };

  const reset = () => {
    setCreating(false);
    setActions([{ type: 'notify', params: { targetType: 'assignee' } }]);
    setDateOffset({ mode: 'on', days: 1 });
  };

  const save = async () => {
    const trg = trigger.type === 'date_arrives' ? { ...trigger, daysBefore: daysBeforeFrom(dateOffset.mode, dateOffset.days) } : trigger;
    const acts = actions.map((a) => (a.type === 'create_item'
      ? { type: 'create_item', params: createItemParams(a.form || emptyItemForm(), columns, { allowDue: !isServerTrigger(trg.type) }) }
      : { type: a.type, params: a.params }));
    const name = sentence({ trigger: trg, actions: acts }, columns).slice(0, 80);
    const row = await onAdd(name, trg, acts);
    if (row !== null) reset();
  };

  return (
    <Modal isOpen onClose={onClose} title={tr('Automatyzacje')} subtitle={tr('Reguły „kiedy… to…” wykonywane przy zmianach w zadaniach')} icon={Zap} size="lg">
      <div>
        <div className="p-6">
          {/* Istniejące */}
          <ul className="space-y-2 mb-4">
            {automations.map(a => (
              <li key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(42,35,18,0.035)] dark:bg-white/[0.04]">
                <Toggle checked={!!a.enabled} onChange={(v) => onUpdate(a.id, { enabled: v })} label={tr('Włączona: {name}', { name: sentence(a, columns) })} />
                <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-200">{sentence(a, columns)}</span>
                <button type="button" aria-label={tr('Usuń automatyzację')} title={tr('Usuń')}
                  onClick={async () => { if (await confirmDialog({ title: tr('Usunąć automatyzację?'), message: sentence(a, columns), confirmLabel: tr('Usuń'), danger: true })) onDelete(a.id); }}
                  className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0"><Trash2 size={15} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          {automations.length === 0 && !creating && <EmptyState compact icon={Zap} title={tr('Brak automatyzacji.')} />}

          {creating ? (
            <div className="rounded-xl p-4 space-y-3 bg-[rgba(42,35,18,0.035)] dark:bg-white/[0.04]">
              {/* Wyzwalacz */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">{tr('KIEDY')}</div>
                <CustomSelect compact aria-label={tr('Wyzwalacz')} value={trigger.type} onChange={changeTrigger}
                  options={TRIGGERS} mapOptionToValue={(t) => t.type} mapOptionToLabel={(t) => tr(t.label)} />
                {trigger.type === 'status_changes_to' && (
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1"><CustomSelect compact aria-label={tr('Kolumna')} value={trigger.columnId}
                      onChange={(v) => setTr({ columnId: v, value: statusCols(columns).find(c => c.id === v)?.settings?.labels?.[0]?.id })}
                      options={statusCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                    <div className="flex-1"><CustomSelect compact aria-label={tr('Status')} value={trigger.value}
                      onChange={(v) => setTr({ value: v })}
                      options={statusCols(columns).find(c => c.id === trigger.columnId)?.settings?.labels || []}
                      mapOptionToValue={(l) => l.id} mapOptionToLabel={(l) => l.title} /></div>
                  </div>
                )}
                {(trigger.type === 'column_changes') && (
                  <div className="mt-2"><CustomSelect compact aria-label={tr('Kolumna')} value={trigger.columnId}
                    onChange={(v) => setTr({ columnId: v })}
                    options={columns} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                )}
                {trigger.type === 'date_arrives' && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className="flex-1 min-w-[10rem]"><CustomSelect compact aria-label={tr('Kolumna daty')} value={trigger.columnId}
                      onChange={(v) => setTr({ columnId: v })}
                      options={dateCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                    {dateOffset.mode !== 'on' && (
                      <input type="number" min={1} max={365} value={dateOffset.days}
                        onChange={(e) => setDateOffset(o => ({ ...o, days: e.target.value === '' ? '' : Number(e.target.value) }))}
                        aria-label={tr('Liczba dni')} className={`w-16 ${SMALL_INPUT}`} />
                    )}
                    <div className="min-w-[11rem]"><CustomSelect compact aria-label={tr('Kiedy względem terminu')} value={dateOffset.mode}
                      onChange={(v) => setDateOffset(o => ({ ...o, mode: v, days: v === 'on' ? o.days : (Number(o.days) || 1) }))}
                      options={DATE_MODES.map(m => ({ value: m.value, label: tr(m.label) }))} /></div>
                  </div>
                )}
                {trigger.type === 'every_period' && (
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1"><CustomSelect compact aria-label={tr('Okres')} value={trigger.period || 'daily'}
                      onChange={(v) => setTr({ period: v })}
                      options={[{ value: 'daily', label: tr('Codziennie') }, { value: 'weekly', label: tr('Co tydzień') }, { value: 'monthly', label: tr('Co miesiąc') }]} /></div>
                    {trigger.period === 'weekly' && (
                      <div className="flex-1"><CustomSelect compact aria-label={tr('Dzień tygodnia')} value={trigger.dayOfWeek ?? 1}
                        onChange={(v) => setTr({ dayOfWeek: Number(v) })}
                        options={WEEKDAYS.map((d, i) => ({ value: i, label: tr(d) }))} /></div>
                    )}
                    {trigger.period === 'monthly' && (
                      <input type="number" min={1} max={28} value={trigger.dayOfMonth ?? 1} onChange={(e) => setTr({ dayOfMonth: Number(e.target.value) })}
                        className={`w-20 ${SMALL_INPUT}`} aria-label={tr('Dzień miesiąca')} title={tr('Dzień miesiąca')} />
                    )}
                  </div>
                )}
              </div>

              {/* Akcje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">{tr('WYKONAJ')}</div>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className="bg-white dark:bg-gray-700 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><CustomSelect compact aria-label={tr('Akcja')} value={a.type} onChange={(v) => setActType(i, v)}
                          options={allowed} mapOptionToValue={(t) => t.type} mapOptionToLabel={(t) => tr(t.label)} /></div>
                        {actions.length > 1 && (
                          <button type="button" className="icon-btn !w-8 !h-8" aria-label={tr('Usuń akcję')} title={tr('Usuń akcję')}
                            onClick={() => setActions(list => list.filter((_, j) => j !== i))}><X size={14} aria-hidden="true" /></button>
                        )}
                      </div>
                      <div className="mt-1.5">
                        {a.type === 'notify' && (
                          <CustomSelect compact aria-label={tr('Kogo powiadomić')} value={a.params.targetType} onChange={(v) => setAct(i, { targetType: v })}
                            options={[{ value: 'assignee', label: tr('przypisane osoby') }, { value: 'creator', label: tr('twórcę elementu') }]} />
                        )}
                        {a.type === 'change_status' && (
                          <div className="flex gap-2">
                            <div className="flex-1"><CustomSelect compact aria-label={tr('Kolumna')} value={a.params.columnId}
                              onChange={(v) => setAct(i, { columnId: v, value: statusCols(columns).find(c => c.id === v)?.settings?.labels?.[0]?.id })}
                              options={statusCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                            <div className="flex-1"><CustomSelect compact aria-label={tr('Status')} value={a.params.value} onChange={(v) => setAct(i, { value: v })}
                              options={statusCols(columns).find(c => c.id === a.params.columnId)?.settings?.labels || []}
                              mapOptionToValue={(l) => l.id} mapOptionToLabel={(l) => l.title} /></div>
                          </div>
                        )}
                        {a.type === 'set_date' && (
                          <div className="flex gap-2 items-center">
                            <div className="flex-1"><CustomSelect compact aria-label={tr('Kolumna daty')} value={a.params.columnId} onChange={(v) => setAct(i, { columnId: v })}
                              options={dateCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                            <span className="text-xs text-gray-500 shrink-0">{tr('dziś +')}</span>
                            <input type="number" value={a.params.offsetDays} onChange={(e) => setAct(i, { offsetDays: Number(e.target.value) })}
                              aria-label={tr('Liczba dni')} className={`w-16 ${SMALL_INPUT}`} />
                          </div>
                        )}
                        {a.type === 'assign_person' && (
                          <div className="flex gap-2">
                            <div className="flex-1"><CustomSelect compact aria-label={tr('Kolumna')} value={a.params.columnId} onChange={(v) => setAct(i, { columnId: v })}
                              options={peopleCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                            <div className="flex-1"><CustomSelect compact aria-label={tr('Osoba')} value={a.params.email}
                              onChange={(v) => { const p = people.find(x => x.email === v); setAct(i, { email: p?.email, name: p?.name }); }}
                              options={people} mapOptionToValue={(p) => p.email} mapOptionToLabel={(p) => p.name} /></div>
                          </div>
                        )}
                        {a.type === 'create_update' && (
                          <input value={a.params.text} onChange={(e) => setAct(i, { text: e.target.value })} placeholder={tr('Treść komentarza')}
                            aria-label={tr('Treść komentarza')} className={`w-full ${SMALL_INPUT}`} />
                        )}
                        {a.type === 'create_item' && (
                          <CreateItemFields form={a.form || emptyItemForm()} columns={columns} people={people} groups={groups}
                            allowDue={!isServerTrigger(trigger.type)} setForm={(fn) => setItemForm(i, fn)} />
                        )}
                      </div>
                    </div>
                  ))}
                  {allowed.length > 1 && (
                    <button type="button" onClick={() => setActions(list => [...list, { type: allowed[0].type, params: defaultParams(allowed[0].type) }])}
                      className="tool-btn"><Plus size={14} aria-hidden="true" />{tr('Dodaj akcję')}</button>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={reset}>{tr('Anuluj')}</Button>
                <Button size="sm" onClick={save}>{tr('Zapisz automatyzację')}</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" icon={Plus} onClick={() => setCreating(true)} className="w-full">{tr('Nowa automatyzacja')}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
