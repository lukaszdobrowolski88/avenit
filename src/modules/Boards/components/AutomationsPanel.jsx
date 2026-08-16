import React, { useState } from 'react';
import { X, Zap, Plus, Trash2, Bell, Flag, CalendarPlus, UserPlus, MessageSquarePlus, Sparkles, Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { generateAutomationSpec } from '../lib/aiBoards';

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
  const tr = a.trigger || {};
  if (tr.type === 'status_changes_to') t = `Gdy „${colName(tr.columnId)}" = „${labelName(tr.columnId, tr.value)}"`;
  else if (tr.type === 'column_changes') t = `Gdy zmieni się „${colName(tr.columnId)}"`;
  else if (tr.type === 'person_assigned') t = 'Gdy przypisano osobę';
  else if (tr.type === 'item_created') t = 'Gdy utworzono element';
  else if (tr.type === 'date_arrives') t = `Gdy nadejdzie „${colName(tr.columnId)}"`;
  else if (tr.type === 'every_period') t = `Cyklicznie (${tr.period === 'weekly' ? 'co tydzień' : tr.period === 'monthly' ? 'co miesiąc' : 'codziennie'})`;
  const acts = (a.actions || []).map(ac => ACTION_TYPES.find(x => x.type === ac.type)?.label || ac.type).join(' + ');
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
      await onAdd(spec.name || 'Automatyzacja AI', spec.trigger, spec.actions);
      setPrompt('');
    } catch (e) { setErr(e.message || 'Błąd generowania.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-4 rounded-xl p-[1.5px] bg-gradient-to-r from-accent-primary via-purple-400 to-accent-secondary">
      <div className="rounded-xl bg-white dark:bg-gray-800 p-3">
        <div className="flex items-center gap-1.5 mb-2 text-sm font-medium text-gray-800 dark:text-gray-100">
          <Sparkles size={15} className="text-accent-primary" /> Opisz automatyzację, a AI ją zbuduje
        </div>
        <div className="flex items-end gap-2">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="np. Gdy status = Gotowe, powiadom przypisane osoby"
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
    if (type === 'create_item') return { name: 'Zadanie cykliczne' };
    return {};
  }

  const save = async () => {
    const name = sentence({ trigger, actions }, columns).slice(0, 80);
    await onAdd(name, trigger, actions);
    setCreating(false);
    setActions([{ type: 'notify', params: { targetType: 'assignee' } }]);
  };

  return (
    <Modal isOpen className="flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] h-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Zap size={20} className="text-accent-primary" />
          <h2 className="flex-1 text-lg font-semibold text-gray-800 dark:text-gray-100">Automatyzacje</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <AiAutomationBox columns={columns} onAdd={onAdd} />
          {/* Istniejące */}
          <div className="space-y-2 mb-4">
            {automations.map(a => (
              <div key={a.id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={a.enabled} onChange={() => onUpdate(a.id, { enabled: !a.enabled })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 dark:bg-gray-600 peer-checked:bg-accent-primary rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                </label>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{sentence(a, columns)}</span>
                <button onClick={() => onDelete(a.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
            {automations.length === 0 && !creating && <div className="text-center text-sm text-gray-400 py-6">Brak automatyzacji.</div>}
          </div>

          {creating ? (
            <div className="border border-accent-primary/30 rounded-xl p-4 space-y-3 bg-accent-primary/5">
              {/* Wyzwalacz */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">KIEDY</div>
                <select value={trigger.type} onChange={(e) => setTr({ type: e.target.value, columnId: e.target.value === 'date_arrives' ? dateCols(columns)[0]?.id : statusCols(columns)[0]?.id })}
                  className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-2 outline-none">
                  {TRIGGERS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
                {trigger.type === 'status_changes_to' && (
                  <div className="flex gap-2 mt-2">
                    <select value={trigger.columnId} onChange={(e) => setTr({ columnId: e.target.value, value: statusCols(columns).find(c => c.id === e.target.value)?.settings?.labels?.[0]?.id })}
                      className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none">
                      {statusCols(columns).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={trigger.value} onChange={(e) => setTr({ value: e.target.value })}
                      className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none">
                      {(statusCols(columns).find(c => c.id === trigger.columnId)?.settings?.labels || []).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </select>
                  </div>
                )}
                {(trigger.type === 'column_changes') && (
                  <select value={trigger.columnId} onChange={(e) => setTr({ columnId: e.target.value })}
                    className="w-full mt-2 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none">
                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {trigger.type === 'date_arrives' && (
                  <select value={trigger.columnId} onChange={(e) => setTr({ columnId: e.target.value })}
                    className="w-full mt-2 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none">
                    {dateCols(columns).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {trigger.type === 'every_period' && (
                  <div className="flex gap-2 mt-2">
                    <select value={trigger.period || 'daily'} onChange={(e) => setTr({ period: e.target.value })}
                      className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none">
                      <option value="daily">Codziennie</option><option value="weekly">Co tydzień</option><option value="monthly">Co miesiąc</option>
                    </select>
                    {trigger.period === 'weekly' && (
                      <select value={trigger.dayOfWeek ?? 1} onChange={(e) => setTr({ dayOfWeek: Number(e.target.value) })} className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none">
                        {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    )}
                    {trigger.period === 'monthly' && (
                      <input type="number" min={1} max={28} value={trigger.dayOfMonth ?? 1} onChange={(e) => setTr({ dayOfMonth: Number(e.target.value) })}
                        className="w-20 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none" title="Dzień miesiąca" />
                    )}
                  </div>
                )}
              </div>

              {/* Akcje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">WYKONAJ</div>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className="bg-white dark:bg-gray-700 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-2">
                        <select value={a.type} onChange={(e) => setActType(i, e.target.value)} className="flex-1 text-sm bg-transparent outline-none">
                          {ACTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                        </select>
                        {actions.length > 1 && <button onClick={() => setActions(list => list.filter((_, j) => j !== i))}><X size={14} className="text-gray-400 hover:text-red-500" /></button>}
                      </div>
                      <div className="mt-1.5">
                        {a.type === 'notify' && (
                          <select value={a.params.targetType} onChange={(e) => setAct(i, { targetType: e.target.value })} className="w-full text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none">
                            <option value="assignee">przypisane osoby</option>
                            <option value="creator">twórcę elementu</option>
                          </select>
                        )}
                        {a.type === 'change_status' && (
                          <div className="flex gap-2">
                            <select value={a.params.columnId} onChange={(e) => setAct(i, { columnId: e.target.value, value: statusCols(columns).find(c => c.id === e.target.value)?.settings?.labels?.[0]?.id })} className="flex-1 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none">
                              {statusCols(columns).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select value={a.params.value} onChange={(e) => setAct(i, { value: e.target.value })} className="flex-1 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none">
                              {(statusCols(columns).find(c => c.id === a.params.columnId)?.settings?.labels || []).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                            </select>
                          </div>
                        )}
                        {a.type === 'set_date' && (
                          <div className="flex gap-2 items-center">
                            <select value={a.params.columnId} onChange={(e) => setAct(i, { columnId: e.target.value })} className="flex-1 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none">
                              {dateCols(columns).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <span className="text-xs text-gray-500">dziś +</span>
                            <input type="number" value={a.params.offsetDays} onChange={(e) => setAct(i, { offsetDays: Number(e.target.value) })} className="w-16 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none" />
                          </div>
                        )}
                        {a.type === 'assign_person' && (
                          <div className="flex gap-2">
                            <select value={a.params.columnId} onChange={(e) => setAct(i, { columnId: e.target.value })} className="flex-1 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none">
                              {peopleCols(columns).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select value={a.params.email} onChange={(e) => { const p = people.find(x => x.email === e.target.value); setAct(i, { email: p?.email, name: p?.name }); }} className="flex-1 text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none">
                              {people.map(p => <option key={p.email} value={p.email}>{p.name}</option>)}
                            </select>
                          </div>
                        )}
                        {a.type === 'create_update' && (
                          <input value={a.params.text} onChange={(e) => setAct(i, { text: e.target.value })} placeholder="Treść komentarza" className="w-full text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none" />
                        )}
                        {a.type === 'create_item' && (
                          <input value={a.params.name} onChange={(e) => setAct(i, { name: e.target.value })} placeholder="Nazwa nowego elementu" className="w-full text-sm bg-gray-100 dark:bg-gray-600/50 rounded px-2 py-1 outline-none" />
                        )}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setActions(list => [...list, { type: 'notify', params: { targetType: 'assignee' } }])} className="flex items-center gap-1 text-sm text-accent-primary"><Plus size={14} /> Dodaj akcję</button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setCreating(false)} className="text-sm text-gray-500 px-3 py-1.5">Anuluj</button>
                <button onClick={save} className="text-sm bg-accent-primary text-white px-4 py-1.5 rounded-lg">Zapisz automatyzację</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-accent-primary hover:border-accent-primary/50">
              <Plus size={18} /> Nowa automatyzacja
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
