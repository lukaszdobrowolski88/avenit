import React, { useState } from 'react';
import { X, Zap, Plus, Trash2, Bell, Flag, CalendarPlus, UserPlus, MessageSquarePlus, Sparkles, Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import CustomSelect from '../../../components/CustomSelect';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { generateAutomationSpec } from '../lib/aiBoards';
import { tr } from '../../../i18n';
import { AI_ENABLED } from '../../../lib/features';
import { confirmDialog } from '../../../lib/dialog';

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
const WEEKDAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

const statusCols = (cols) => cols.filter(c => c.type === 'status' || c.type === 'priority');
const dateCols = (cols) => cols.filter(c => c.type === 'date' || c.type === 'timeline');
const peopleCols = (cols) => cols.filter(c => c.type === 'people');

function sentence(a, columns) {
  const colName = (id) => columns.find(c => c.id === id)?.name || '?';
  const labelName = (colId, val) => (columns.find(c => c.id === colId)?.settings?.labels || []).find(l => l.id === val)?.title || val;
  let t = '';
  const trg = a.trigger || {};
  if (trg.type === 'status_changes_to') t = tr('Gdy „{col}" = „{label}"', { col: colName(trg.columnId), label: labelName(trg.columnId, trg.value) });
  else if (trg.type === 'column_changes') t = tr('Gdy zmieni się „{col}"', { col: colName(trg.columnId) });
  else if (trg.type === 'person_assigned') t = tr('Gdy przypisano osobę');
  else if (trg.type === 'item_created') t = tr('Gdy utworzono element');
  else if (trg.type === 'date_arrives') t = tr('Gdy nadejdzie „{col}"', { col: colName(trg.columnId) });
  else if (trg.type === 'every_period') t = tr('Cyklicznie ({period})', { period: trg.period === 'weekly' ? tr('co tydzień') : trg.period === 'monthly' ? tr('co miesiąc') : tr('codziennie') });
  const acts = (a.actions || []).map(ac => { const l = ACTION_TYPES.find(x => x.type === ac.type)?.label; return l ? tr(l) : ac.type; }).join(' + ');
  return `${t} → ${acts}`;
}

// Generator automatyzacji z AI (styl monday AI Workflows).
function AiAutomationBox({ columns, onAdd }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setErr('');
    try {
      const spec = await generateAutomationSpec(prompt.trim(), columns);
      await onAdd(spec.name || tr('Automatyzacja AI'), spec.trigger, spec.actions);
      setPrompt('');
    } catch (e) { setErr(e.message || tr('Błąd generowania.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-4 rounded-xl p-[1.5px] bg-gradient-to-r from-accent-primary via-purple-400 to-accent-secondary">
      <div className="rounded-xl bg-white dark:bg-gray-800 p-3">
        <div className="flex items-center gap-1.5 mb-2 text-sm font-medium text-gray-800 dark:text-gray-100">
          <Sparkles size={15} className="text-accent-primary" /> {tr('Opisz automatyzację, a AI ją zbuduje')}
        </div>
        <div className="flex items-end gap-2">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder={tr('np. Gdy status = Gotowe, powiadom przypisane osoby')}
            className="flex-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm outline-none text-gray-800 dark:text-gray-100" />
          <button onClick={run} disabled={busy || !prompt.trim()}
            className="flex items-center gap-1 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50 shrink-0">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          </button>
        </div>
        {err && <div className="text-xs text-red-500 mt-1.5">{err}</div>}
      </div>
    </div>
  );
}

export default function AutomationsPanel({ automations, columns, people, onAdd, onUpdate, onDelete, onClose }) {
  const [creating, setCreating] = useState(false);
  const [trigger, setTrigger] = useState({ type: 'status_changes_to', columnId: statusCols(columns)[0]?.id, value: statusCols(columns)[0]?.settings?.labels?.[0]?.id });
  const [actions, setActions] = useState([{ type: 'notify', params: { targetType: 'assignee' } }]);

  const setTr = (patch) => setTrigger(t => ({ ...t, ...patch }));
  const setAct = (i, patch) => setActions(list => list.map((a, j) => j === i ? { ...a, params: { ...a.params, ...patch } } : a));
  const setActType = (i, type) => setActions(list => list.map((a, j) => j === i ? { type, params: defaultParams(type) } : a));

  function defaultParams(type) {
    if (type === 'notify') return { targetType: 'assignee' };
    if (type === 'change_status') return { columnId: statusCols(columns)[0]?.id, value: statusCols(columns)[0]?.settings?.labels?.[0]?.id };
    if (type === 'set_date') return { columnId: dateCols(columns)[0]?.id, offsetDays: 0 };
    if (type === 'assign_person') return { columnId: peopleCols(columns)[0]?.id, email: people[0]?.email, name: people[0]?.name };
    if (type === 'create_update') return { text: '' };
    if (type === 'create_item') return { name: tr('Zadanie cykliczne') };
    return {};
  }

  const save = async () => {
    const name = sentence({ trigger, actions }, columns).slice(0, 80);
    await onAdd(name, trigger, actions);
    setCreating(false);
    setActions([{ type: 'notify', params: { targetType: 'assignee' } }]);
  };

  return (
    <Modal isOpen onClose={onClose} title={tr('Automatyzacje')} subtitle={tr('Reguły „kiedy… to…” wykonywane przy zmianach w zadaniach')} icon={Zap} size="lg">
      <div>
        <div className="p-6">
          {AI_ENABLED && <AiAutomationBox columns={columns} onAdd={onAdd} />}
          {/* Istniejące */}
          <div className="space-y-2 mb-4">
            {automations.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                <button type="button" role="switch" aria-checked={!!a.enabled} aria-label={tr('Włączona')} onClick={() => onUpdate(a.id, { enabled: !a.enabled })}
                  className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${a.enabled ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${a.enabled ? 'translate-x-4' : ''}`} />
                </button>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{sentence(a, columns)}</span>
                <button type="button" aria-label={tr('Usuń automatyzację')} title={tr('Usuń')}
                  onClick={async () => { if (await confirmDialog({ title: tr('Usunąć automatyzację?'), message: sentence(a, columns), confirmLabel: tr('Usuń'), danger: true })) onDelete(a.id); }}
                  className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={15} aria-hidden="true" /></button>
              </div>
            ))}
            {automations.length === 0 && !creating && <EmptyState compact icon={Zap} title={tr('Brak automatyzacji.')} />}
          </div>

          {creating ? (
            <div className="rounded-xl p-4 space-y-3 bg-[rgba(42,35,18,0.035)] dark:bg-white/[0.04] border border-gray-200 dark:border-gray-700">
              {/* Wyzwalacz */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">{tr('KIEDY')}</div>
                <CustomSelect compact value={trigger.type}
                  onChange={(v) => setTr({ type: v, columnId: v === 'date_arrives' ? dateCols(columns)[0]?.id : statusCols(columns)[0]?.id })}
                  options={TRIGGERS} mapOptionToValue={(t) => t.type} mapOptionToLabel={(t) => tr(t.label)} />
                {trigger.type === 'status_changes_to' && (
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1"><CustomSelect compact value={trigger.columnId}
                      onChange={(v) => setTr({ columnId: v, value: statusCols(columns).find(c => c.id === v)?.settings?.labels?.[0]?.id })}
                      options={statusCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                    <div className="flex-1"><CustomSelect compact value={trigger.value}
                      onChange={(v) => setTr({ value: v })}
                      options={statusCols(columns).find(c => c.id === trigger.columnId)?.settings?.labels || []}
                      mapOptionToValue={(l) => l.id} mapOptionToLabel={(l) => l.title} /></div>
                  </div>
                )}
                {(trigger.type === 'column_changes') && (
                  <div className="mt-2"><CustomSelect compact value={trigger.columnId}
                    onChange={(v) => setTr({ columnId: v })}
                    options={columns} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                )}
                {trigger.type === 'date_arrives' && (
                  <div className="mt-2"><CustomSelect compact value={trigger.columnId}
                    onChange={(v) => setTr({ columnId: v })}
                    options={dateCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                )}
                {trigger.type === 'every_period' && (
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1"><CustomSelect compact value={trigger.period || 'daily'}
                      onChange={(v) => setTr({ period: v })}
                      options={[{ value: 'daily', label: tr('Codziennie') }, { value: 'weekly', label: tr('Co tydzień') }, { value: 'monthly', label: tr('Co miesiąc') }]} /></div>
                    {trigger.period === 'weekly' && (
                      <div className="flex-1"><CustomSelect compact value={trigger.dayOfWeek ?? 1}
                        onChange={(v) => setTr({ dayOfWeek: Number(v) })}
                        options={WEEKDAYS.map((d, i) => ({ value: i, label: tr(d) }))} /></div>
                    )}
                    {trigger.period === 'monthly' && (
                      <input type="number" min={1} max={28} value={trigger.dayOfMonth ?? 1} onChange={(e) => setTr({ dayOfMonth: Number(e.target.value) })}
                        className="w-20 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none" title={tr('Dzień miesiąca')} />
                    )}
                  </div>
                )}
              </div>

              {/* Akcje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">{tr('WYKONAJ')}</div>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className="bg-white dark:bg-gray-700 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><CustomSelect compact value={a.type} onChange={(v) => setActType(i, v)}
                          options={ACTION_TYPES} mapOptionToValue={(t) => t.type} mapOptionToLabel={(t) => tr(t.label)} /></div>
                        {actions.length > 1 && <button onClick={() => setActions(list => list.filter((_, j) => j !== i))}><X size={14} className="text-gray-400 hover:text-red-500" /></button>}
                      </div>
                      <div className="mt-1.5">
                        {a.type === 'notify' && (
                          <CustomSelect compact value={a.params.targetType} onChange={(v) => setAct(i, { targetType: v })}
                            options={[{ value: 'assignee', label: tr('przypisane osoby') }, { value: 'creator', label: tr('twórcę elementu') }]} />
                        )}
                        {a.type === 'change_status' && (
                          <div className="flex gap-2">
                            <div className="flex-1"><CustomSelect compact value={a.params.columnId}
                              onChange={(v) => setAct(i, { columnId: v, value: statusCols(columns).find(c => c.id === v)?.settings?.labels?.[0]?.id })}
                              options={statusCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                            <div className="flex-1"><CustomSelect compact value={a.params.value} onChange={(v) => setAct(i, { value: v })}
                              options={statusCols(columns).find(c => c.id === a.params.columnId)?.settings?.labels || []}
                              mapOptionToValue={(l) => l.id} mapOptionToLabel={(l) => l.title} /></div>
                          </div>
                        )}
                        {a.type === 'set_date' && (
                          <div className="flex gap-2 items-center">
                            <div className="flex-1"><CustomSelect compact value={a.params.columnId} onChange={(v) => setAct(i, { columnId: v })}
                              options={dateCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                            <span className="text-xs text-gray-500 shrink-0">{tr('dziś +')}</span>
                            <input type="number" value={a.params.offsetDays} onChange={(e) => setAct(i, { offsetDays: Number(e.target.value) })} className="w-16 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none" />
                          </div>
                        )}
                        {a.type === 'assign_person' && (
                          <div className="flex gap-2">
                            <div className="flex-1"><CustomSelect compact value={a.params.columnId} onChange={(v) => setAct(i, { columnId: v })}
                              options={peopleCols(columns)} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} /></div>
                            <div className="flex-1"><CustomSelect compact value={a.params.email}
                              onChange={(v) => { const p = people.find(x => x.email === v); setAct(i, { email: p?.email, name: p?.name }); }}
                              options={people} mapOptionToValue={(p) => p.email} mapOptionToLabel={(p) => p.name} /></div>
                          </div>
                        )}
                        {a.type === 'create_update' && (
                          <input value={a.params.text} onChange={(e) => setAct(i, { text: e.target.value })} placeholder={tr('Treść komentarza')} className="w-full text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none" />
                        )}
                        {a.type === 'create_item' && (
                          <input value={a.params.name} onChange={(e) => setAct(i, { name: e.target.value })} placeholder={tr('Nazwa nowego elementu')} className="w-full text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none" />
                        )}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setActions(list => [...list, { type: 'notify', params: { targetType: 'assignee' } }])} className="flex items-center gap-1 text-sm text-accent-primary"><Plus size={14} /> {tr('Dodaj akcję')}</button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>{tr('Anuluj')}</Button>
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
