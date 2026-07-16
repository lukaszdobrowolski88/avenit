import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { PUSH_CATEGORIES, ACTION_LABEL_MAX } from '../constants';
import { tr } from '../../../i18n';

const ACTION_TYPE_LABELS = {
  deep_link: 'Deep link (ekran w aplikacji)',
  inline_rsvp: 'Akcja inline (bez otwierania)',
  open_form: tr('Otwórz formularz'),
  external_url: tr('Zewnętrzny link'),
};

export default function ActionButtonsBuilder({ categoryId, actions = [], onChange }) {
  const category = PUSH_CATEGORIES.find(c => c.id === categoryId);
  const required = category?.actions || [];

  const updateAction = (idx, patch) => {
    const next = [...actions];
    next[idx] = { ...(next[idx] || {}), ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* Wybór kategorii */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {tr('Typ przycisków akcji')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PUSH_CATEGORIES.map(c => {
            const Icon = c.icon;
            const active = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.actions.map(a => ({
                  label: a.defaultLabel,
                  action_type: a.type,
                  action_value: a.value || '',
                  destructive: !!a.destructive,
                })), c.id)}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  active
                    ? 'border-accent-primary bg-accent-primary-lightest dark:bg-accent-primary-darkest/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className={active ? 'text-accent-primary' : 'text-gray-500'} />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{c.label}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Edycja przycisków */}
      {required.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {tr('Konfiguracja przycisków')}
          </div>

          {required.map((catAction, idx) => {
            const action = actions[idx] || {};
            return (
              <div key={idx} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Przycisk {idx + 1}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">{ACTION_TYPE_LABELS[catAction.type]}</span>
                  {action.destructive && (
                    <span className="text-xs text-red-500 flex items-center gap-1 ml-auto">
                      <AlertTriangle size={11} /> destruktywny
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Etykieta (web)</label>
                    <input
                      maxLength={ACTION_LABEL_MAX}
                      value={action.label || catAction.defaultLabel}
                      onChange={e => updateAction(idx, { label: e.target.value, action_type: catAction.type })}
                      className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
                    />
                  </div>
                  {catAction.type !== 'inline_rsvp' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        {catAction.type === 'deep_link' && tr('Ścieżka (np. /events/123)')}
                        {catAction.type === 'open_form' && 'ID formularza'}
                        {catAction.type === 'external_url' && 'URL'}
                      </label>
                      <input
                        value={action.action_value || ''}
                        onChange={e => updateAction(idx, { action_value: e.target.value, action_type: catAction.type, label: action.label || catAction.defaultLabel })}
                        placeholder={
                          catAction.type === 'deep_link' ? '/events/123' :
                          catAction.type === 'external_url' ? 'https://...' :
                          'form_id'
                        }
                        className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
                      />
                    </div>
                  )}
                  {catAction.type === 'inline_rsvp' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">{tr('Wartość RSVP')}</label>
                      <input
                        value={action.action_value || catAction.value || ''}
                        onChange={e => updateAction(idx, { action_value: e.target.value, action_type: catAction.type, label: action.label || catAction.defaultLabel })}
                        placeholder="yes / no / maybe"
                        className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-gray-500 italic">
            Uwaga: na mobile etykiety pochodzą ze sztywnej rejestracji kategorii w aplikacji
            (zmiana wymaga deploya). Web stosuje labelki z tego edytora od razu.
          </p>
        </div>
      )}
    </div>
  );
}
