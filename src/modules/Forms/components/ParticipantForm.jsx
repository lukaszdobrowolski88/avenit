import { Trash2 } from 'lucide-react';
import FieldRenderer from './FieldRenderer';
import AddonSelector from './AddonSelector';

export default function ParticipantForm({
  participant,
  fields,
  addons,
  index,
  label,
  onUpdate,
  onRemove,
  canRemove,
  errors
}) {
  const handleFieldChange = (fieldId, value) => {
    onUpdate({
      ...participant,
      answers: { ...participant.answers, [fieldId]: value }
    });
  };

  const handleAddonsChange = (addonId, quantity) => {
    onUpdate({
      ...participant,
      addons: { ...participant.addons, [addonId]: quantity }
    });
  };

  const perPersonAddons = (addons || []).filter(a => a.scope === 'per_person' && a.available !== false);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {label || 'Członek zespołu'} {index + 1}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            title="Usuń uczestnika"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.id} id={`field-p${index}-${field.id}`}>
            <label className="block mb-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
            <FieldRenderer
              field={field}
              value={participant.answers[field.id]}
              onChange={(value) => handleFieldChange(field.id, value)}
              error={errors?.[field.id]}
            />
            {errors?.[field.id] && (
              <p className="mt-1 text-xs text-red-500">{errors[field.id]}</p>
            )}
          </div>
        ))}

        {perPersonAddons.length > 0 && (
          <AddonSelector
            addons={perPersonAddons}
            selectedAddons={participant.addons || {}}
            onChange={handleAddonsChange}
          />
        )}
      </div>
    </div>
  );
}
