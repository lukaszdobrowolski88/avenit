import { Users, GripVertical } from 'lucide-react';
import { tr } from '../../../i18n';

export default function GroupRegistrationSettings({ settings, fields, onChange }) {
  const groupReg = settings?.groupRegistration || {};

  const handleChange = (key, value) => {
    onChange({
      ...(settings?.groupRegistration || {}),
      [key]: value
    });
  };

  const toggleFieldAssignment = (fieldId, target) => {
    const contactIds = [...(groupReg.contactPersonFieldIds || [])];
    const participantIds = [...(groupReg.participantFieldIds || [])];

    // Usuń z obu list
    const cIdx = contactIds.indexOf(fieldId);
    if (cIdx > -1) contactIds.splice(cIdx, 1);
    const pIdx = participantIds.indexOf(fieldId);
    if (pIdx > -1) participantIds.splice(pIdx, 1);

    // Dodaj do wybranej
    if (target === 'contact') {
      contactIds.push(fieldId);
    } else if (target === 'participant') {
      participantIds.push(fieldId);
    }
    // 'both' — dodaj do obu
    if (target === 'both') {
      contactIds.push(fieldId);
      participantIds.push(fieldId);
    }

    onChange({
      ...(settings?.groupRegistration || {}),
      contactPersonFieldIds: contactIds,
      participantFieldIds: participantIds
    });
  };

  // Filtruj pola — tylko te, które mają sens do przypisania (nie specjalne)
  const assignableFields = (fields || []).filter(
    f => !['price', 'seat_limit', 'quantity', 'location', 'date_start', 'date_end', 'time_start', 'time_end'].includes(f.type)
  );

  const getFieldAssignment = (fieldId) => {
    const inContact = (groupReg.contactPersonFieldIds || []).includes(fieldId);
    const inParticipant = (groupReg.participantFieldIds || []).includes(fieldId);
    if (inContact && inParticipant) return 'both';
    if (inContact) return 'contact';
    if (inParticipant) return 'participant';
    return 'none';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {tr('Włącz rejestrację grupową')}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tr('Pozwól na rejestrację wielu osób jednocześnie')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={groupReg.enabled || false}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
        </label>
      </div>

      {groupReg.enabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {tr('Min. uczestników')}
              </label>
              <input
                type="number"
                min="1"
                max={groupReg.maxParticipants || 10}
                value={groupReg.minParticipants || 1}
                onChange={(e) => handleChange('minParticipants', parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {tr('Max. uczestników')}
              </label>
              <input
                type="number"
                min={groupReg.minParticipants || 1}
                max="100"
                value={groupReg.maxParticipants || 10}
                onChange={(e) => handleChange('maxParticipants', parseInt(e.target.value) || 10)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Etykieta uczestnika
            </label>
            <input
              type="text"
              value={groupReg.participantLabel || tr('Członek zespołu')}
              onChange={(e) => handleChange('participantLabel', e.target.value)}
              placeholder={tr('Członek zespołu')}
              className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Wymagaj osoby kontaktowej
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {tr('Osoba zgłaszająca wypełnia osobną sekcję')}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={groupReg.requireContactPerson !== false}
                onChange={(e) => handleChange('requireContactPerson', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
            </label>
          </div>

          {/* Przypisanie pól */}
          {assignableFields.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {tr('Przypisanie pól formularza')}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {tr('Określ, które pola są wypełniane przez osobę zgłaszającą, a które przez każdego uczestnika.')}
              </p>
              <div className="space-y-2">
                {assignableFields.map((field) => {
                  const assignment = getFieldAssignment(field.id);
                  return (
                    <div
                      key={field.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                    >
                      <GripVertical size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 truncate">
                        {field.label}
                      </span>
                      <select
                        value={assignment}
                        onChange={(e) => toggleFieldAssignment(field.id, e.target.value)}
                        className="text-xs px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
                      >
                        <option value="contact">{tr('Osoba zgłaszająca')}</option>
                        <option value="participant">Per uczestnik</option>
                        <option value="both">Oba</option>
                        <option value="none">Nie przypisane</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
