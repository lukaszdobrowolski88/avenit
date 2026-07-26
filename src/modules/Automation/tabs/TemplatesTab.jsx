import React, { useState } from 'react';
import { Sparkles, Plus, Mail, MessageSquare, Bell, ClipboardList, Tag, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { TEMPLATES, triggerLabel, actionLabel } from '../lib/automationApi';

const ACTION_ICONS = {
  send_email: Mail,
  send_sms: MessageSquare,
  send_push: Bell,
  create_task: ClipboardList,
  add_tag: Tag,
  wait: Clock,
};

export default function TemplatesTab({ campusIdForInsert, onNavigate }) {
  const [creatingKey, setCreatingKey] = useState(null);

  const createFromTemplate = async (tpl) => {
    setCreatingKey(tpl.key);
    try {
      const { data: wf, error } = await supabase
        .from('automation_workflows')
        .insert({
          name: tpl.name,
          description: tpl.description,
          trigger_type: tpl.trigger_type,
          trigger_config: {},
          is_active: true,
          campus_id: campusIdForInsert,
        })
        .select()
        .single();
      if (error) throw error;

      const stepsPayload = tpl.steps.map((s, i) => ({
        workflow_id: wf.id,
        step_order: i,
        action_type: s.action_type,
        action_config: s.action_config || {},
        delay_days: s.delay_days || 0,
      }));
      if (stepsPayload.length) {
        const { error: stepErr } = await supabase.from('automation_steps').insert(stepsPayload);
        if (stepErr) throw stepErr;
      }

      if (onNavigate) onNavigate('workflows');
    } catch (err) {
      console.error('Create from template error:', err);
      alert('Nie udało się utworzyć automatyzacji z szablonu: ' + (err.message || err));
    } finally {
      setCreatingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">Gotowe ścieżki — kliknij „Utwórz z szablonu", aby dodać automatyzację wraz z krokami. Możesz ją potem dowolnie edytować.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {TEMPLATES.map(tpl => (
          <div key={tpl.key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow">
                <Sparkles className="text-white" size={16} />
              </div>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-accent-primary-lightest text-accent-primary dark:bg-accent-primary-darkest/30 dark:text-accent-primary-light">
                {triggerLabel(tpl.trigger_type)}
              </span>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mt-1">{tpl.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex-1">{tpl.description}</p>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
              {tpl.steps.map((s, i) => {
                const Icon = ACTION_ICONS[s.action_type] || Clock;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Icon size={15} className="text-accent-primary dark:text-accent-primary-light shrink-0" />
                    <span className="truncate">{actionLabel(s.action_type)}</span>
                    {s.delay_days > 0 && <span className="text-xs text-gray-400 whitespace-nowrap ml-auto">+{s.delay_days} dni</span>}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => createFromTemplate(tpl)}
              disabled={creatingKey === tpl.key}
              className="mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg transition disabled:opacity-60"
            >
              {creatingKey === tpl.key ? 'Tworzenie...' : (<><Plus size={16} /> Utwórz z szablonu <ArrowRight size={14} /></>)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
