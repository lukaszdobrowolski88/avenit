import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Zap, ArrowUp, ArrowDown, GripVertical, Workflow } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import {
  TRIGGER_TYPES, ACTION_TYPES, ACTION_CONFIG_FIELDS,
  triggerLabel, actionLabel, stepSummary, emptyStep,
} from '../lib/automationApi';

const emptyForm = { name: '', description: '', trigger_type: 'new_guest' };

export default function WorkflowsTab({ campusIdForInsert, withCampusFilter }) {
  const [workflows, setWorkflows] = useState([]);
  const [stepsByWorkflow, setStepsByWorkflow] = useState({});
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('automation_workflows').select('*').order('created_at', { ascending: false });
      q = withCampusFilter(q);
      const { data: wfs, error } = await q;
      if (error) throw error;
      const list = wfs || [];
      setWorkflows(list);

      const ids = list.map(w => w.id);
      if (ids.length) {
        const { data: stepData } = await supabase
          .from('automation_steps')
          .select('*')
          .in('workflow_id', ids)
          .order('step_order', { ascending: true });
        const grouped = {};
        (stepData || []).forEach(s => {
          (grouped[s.workflow_id] = grouped[s.workflow_id] || []).push(s);
        });
        setStepsByWorkflow(grouped);
      } else {
        setStepsByWorkflow({});
      }
    } catch (err) {
      console.error('Load workflows error:', err);
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSteps([emptyStep()]);
    setModalOpen(true);
  };

  const openEdit = (wf) => {
    setEditing(wf);
    setForm({ name: wf.name || '', description: wf.description || '', trigger_type: wf.trigger_type || 'manual' });
    const existing = (stepsByWorkflow[wf.id] || []).map(s => ({
      action_type: s.action_type || 'send_email',
      delay_days: s.delay_days ?? 0,
      action_config: s.action_config || {},
    }));
    setSteps(existing.length ? existing : [emptyStep()]);
    setModalOpen(true);
  };

  // --- edycja kroków w builderze ---
  const addStep = () => setSteps(s => [...s, emptyStep()]);
  const removeStep = (idx) => setSteps(s => s.filter((_, i) => i !== idx));
  const moveStep = (idx, dir) => setSteps(s => {
    const target = idx + dir;
    if (target < 0 || target >= s.length) return s;
    const next = [...s];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  });
  const updateStep = (idx, patch) => setSteps(s => s.map((st, i) => (i === idx ? { ...st, ...patch } : st)));
  const updateStepConfig = (idx, key, value) => setSteps(s => s.map((st, i) => (
    i === idx ? { ...st, action_config: { ...st.action_config, [key]: value } } : st
  )));

  const save = async () => {
    if (!form.name.trim()) { alert('Podaj nazwę automatyzacji.'); return; }
    setSaving(true);
    try {
      const wfPayload = {
        name: form.name.trim(),
        description: form.description || null,
        trigger_type: form.trigger_type,
      };
      let workflowId;
      if (editing) {
        const { error } = await supabase.from('automation_workflows').update(wfPayload).eq('id', editing.id);
        if (error) throw error;
        workflowId = editing.id;
        // usuń istniejące kroki i wstaw ponownie
        const { error: delErr } = await supabase.from('automation_steps').delete().eq('workflow_id', workflowId);
        if (delErr) throw delErr;
      } else {
        wfPayload.is_active = true;
        wfPayload.trigger_config = {};
        wfPayload.campus_id = campusIdForInsert;
        const { data, error } = await supabase.from('automation_workflows').insert(wfPayload).select().single();
        if (error) throw error;
        workflowId = data.id;
      }

      const stepsPayload = steps.map((s, i) => ({
        workflow_id: workflowId,
        step_order: i,
        action_type: s.action_type,
        action_config: s.action_config || {},
        delay_days: Number(s.delay_days) || 0,
      }));
      if (stepsPayload.length) {
        const { error: stepErr } = await supabase.from('automation_steps').insert(stepsPayload);
        if (stepErr) throw stepErr;
      }

      setModalOpen(false);
      load();
    } catch (err) {
      console.error('Save workflow error:', err);
      alert('Nie udało się zapisać automatyzacji: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (wf) => {
    try {
      const { error } = await supabase
        .from('automation_workflows')
        .update({ is_active: !wf.is_active })
        .eq('id', wf.id);
      if (error) throw error;
      setWorkflows(ws => ws.map(w => (w.id === wf.id ? { ...w, is_active: !w.is_active } : w)));
    } catch (err) {
      alert('Nie udało się zmienić statusu: ' + (err.message || err));
    }
  };

  const remove = async (wf) => {
    if (!confirm(`Usunąć automatyzację „${wf.name}"? Kroki i uruchomienia zostaną usunięte.`)) return;
    try {
      const { error } = await supabase.from('automation_workflows').delete().eq('id', wf.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  const triggerOptions = useMemo(() => TRIGGER_TYPES, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Warunkowe ścieżki: wyzwalacz uruchamia sekwencję kroków.</p>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition shrink-0">
          <Plus size={16} /> Nowa automatyzacja
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">Ładowanie...</div>
      ) : workflows.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <Workflow size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak automatyzacji. Utwórz pierwszą lub skorzystaj z zakładki „Szablony".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workflows.map(wf => {
            const wfSteps = stepsByWorkflow[wf.id] || [];
            return (
              <div key={wf.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{wf.name}</h3>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-accent-primary-lightest text-accent-primary dark:bg-accent-primary-darkest/30 dark:text-accent-primary-light">
                        {triggerLabel(wf.trigger_type)}
                      </span>
                    </div>
                    {wf.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{wf.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Przełącznik aktywny */}
                    <button
                      onClick={() => toggleActive(wf)}
                      title={wf.is_active ? 'Aktywna — kliknij, aby wyłączyć' : 'Wyłączona — kliknij, aby włączyć'}
                      className={`relative w-10 h-6 rounded-full transition-colors ${wf.is_active ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${wf.is_active ? 'translate-x-4' : ''}`} />
                    </button>
                    <button onClick={() => openEdit(wf)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                    <button onClick={() => remove(wf)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-xs uppercase font-semibold text-gray-400">Kroki ({wfSteps.length})</span>
                  {wfSteps.length === 0 ? (
                    <p className="text-xs text-gray-400 mt-1">Brak kroków.</p>
                  ) : (
                    <ol className="mt-2 space-y-1.5">
                      {wfSteps.map((s, i) => (
                        <li key={s.id || i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 text-xs flex items-center justify-center text-gray-500 dark:text-gray-400">{i + 1}</span>
                          <span className="truncate">{stepSummary(s)}</span>
                          {s.delay_days > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">+{s.delay_days} dni</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal builder */}
      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj automatyzację' : 'Nowa automatyzacja'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwa</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="np. Powitanie nowego gościa" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Opis</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Krótki opis automatyzacji..." className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
              <CustomSelect label="Wyzwalacz" value={form.trigger_type} onChange={v => setForm(f => ({ ...f, trigger_type: v }))} options={triggerOptions} />

              {/* Kroki */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 ml-1">Kroki ({steps.length})</span>
                  <button onClick={addStep} className="text-xs text-accent-primary dark:text-accent-primary-light font-medium flex items-center gap-1 hover:underline"><Plus size={13} /> Dodaj krok</button>
                </div>

                {steps.length === 0 ? (
                  <p className="text-sm text-gray-400 p-3 text-center rounded-xl bg-gray-50 dark:bg-gray-700/30">Brak kroków — dodaj pierwszy.</p>
                ) : (
                  <div className="space-y-3">
                    {steps.map((step, idx) => {
                      const fields = ACTION_CONFIG_FIELDS[step.action_type] || [];
                      return (
                        <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-gray-400">
                              <GripVertical size={14} />
                              <span className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 text-xs flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">{idx + 1}</span>
                            </span>
                            <div className="flex-1 min-w-0">
                              <CustomSelect value={step.action_type} onChange={v => updateStep(idx, { action_type: v })} options={ACTION_TYPES} compact />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-1.5 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"><ArrowUp size={14} /></button>
                              <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} className="p-1.5 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"><ArrowDown size={14} /></button>
                              <button onClick={() => removeStep(idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={14} /></button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Opóźnienie (dni)</label>
                              <input type="number" min="0" value={step.delay_days} onChange={e => updateStep(idx, { delay_days: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                            </div>
                          </div>

                          {fields.length > 0 && (
                            <div className="space-y-2">
                              {fields.map(f => (
                                <div key={f.key}>
                                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{f.label}</label>
                                  {f.type === 'textarea' ? (
                                    <textarea
                                      value={step.action_config?.[f.key] || ''}
                                      onChange={e => updateStepConfig(idx, f.key, e.target.value)}
                                      rows={2} placeholder={f.placeholder}
                                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none"
                                    />
                                  ) : (
                                    <input
                                      value={step.action_config?.[f.key] || ''}
                                      onChange={e => updateStepConfig(idx, f.key, e.target.value)}
                                      placeholder={f.placeholder}
                                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {step.action_type === 'wait' && (
                            <p className="text-xs text-gray-400">Krok oczekiwania — wstrzymuje ścieżkę o podane opóźnienie.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
