import React, { useMemo, useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import { toast } from '../../../lib/toast';
import { previewText } from '../utils/chatLogic';
import TimePresetPicker from './TimePresetPicker';
import { reminderPresets, remindersApi, whenLabel } from './scheduleUi';

// „Przypomnij mi” o wiadomości: gotowe terminy albo własny. Ponowne ustawienie zmienia termin.
export default function RemindMeDialog({ message, onClose }) {
  const [busy, setBusy] = useState(false);
  const presets = useMemo(() => (message ? reminderPresets(new Date()) : []), [message]);
  if (!message) return null;

  const pick = async (iso) => {
    setBusy(true);
    try {
      await remindersApi.create(message.id, iso);
      toast.success(tr('Przypomnę Ci: {when}', { when: whenLabel(iso) }));
      onClose?.();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się ustawić przypomnienia. Spróbuj ponownie.') });
    } finally {
      setBusy(false);
    }
  };

  const excerpt = previewText(message, tr);
  return (
    <Modal isOpen onClose={onClose} title={tr('Przypomnij mi')} subtitle={excerpt ? `„${excerpt.length > 80 ? `${excerpt.slice(0, 79)}…` : excerpt}”` : null} icon={AlarmClock} size="sm">
      <div className="p-3">
        <TimePresetPicker presets={presets} onPick={pick} busy={busy} detailKeys={['in1h', 'in3h', 'monday9']} confirmLabel={tr('Przypomnij')} />
      </div>
    </Modal>
  );
}
