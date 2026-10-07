import React, { useState, useRef } from 'react';
import { Plus, Trash2, BarChart3 } from 'lucide-react';
import { useT, tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import CustomDatePicker from '../../../components/CustomDatePicker';
import TimeInput from '../../../components/TimeInput';
import { Toggle } from '../../Settings/components/SettingsUI';
import { buildPollMetadata } from '../utils/chatLogic';

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Termin zamknięcia z pól daty i godziny (czas lokalny) → ISO albo null.
export function closesAtFrom(dateYmd, timeHm) {
  if (!dateYmd) return null;
  const [y, m, d] = String(dateYmd).split('-').map(Number);
  const [hh, mm] = String(timeHm || '20:00').split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, Number.isFinite(hh) ? hh : 20, Number.isFinite(mm) ? mm : 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

// Modal tworzenia ankiety w czacie (K7): opcje, „Wiele odpowiedzi”, „Anonimowa”, „Zamknij o…”.
export default function PollComposerModal({ isOpen, onClose, onSubmit }) {
  const t = useT();
  const idCounter = useRef(2);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([
    { id: 'o1', text: '' },
    { id: 'o2', text: '' }
  ]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closeEnabled, setCloseEnabled] = useState(false);
  const [closeDate, setCloseDate] = useState('');
  const [closeTime, setCloseTime] = useState('20:00');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    idCounter.current = 2;
    setQuestion('');
    setOptions([{ id: 'o1', text: '' }, { id: 'o2', text: '' }]);
    setMultiple(false);
    setAnonymous(false);
    setCloseEnabled(false);
    setCloseDate('');
    setCloseTime('20:00');
  };

  const addOption = () => {
    if (options.length >= 10) return;
    idCounter.current += 1;
    setOptions(prev => [...prev, { id: `o${idCounter.current}`, text: '' }]);
  };

  const removeOption = (id) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter(o => o.id !== id));
  };

  const updateOption = (id, text) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  };

  const validOptions = options.filter(o => o.text.trim());
  const closesAt = closeEnabled ? closesAtFrom(closeDate, closeTime) : null;
  const closeInPast = closeEnabled && (!closesAt || new Date(closesAt).getTime() <= Date.now());
  const canSubmit = question.trim() && validOptions.length >= 2 && !closeInPast;

  const toggleClose = (on) => {
    setCloseEnabled(on);
    if (on && !closeDate) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      setCloseDate(toYmd(d));
    }
  };

  // Zamknij dopiero po udanym wysłaniu; błąd pokazuje wątek (MessageThread), ankieta zostaje w oknie.
  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit?.(buildPollMetadata({
        question,
        options: validOptions,
        multiple,
        anonymous,
        closes_at: closesAt,
      }));
      reset();
      onClose();
    } catch {
      /* komunikat już pokazany */
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => { if (submitting) return; reset(); onClose(); };
  const labelCls = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnBackdrop={false}
      title={tr('Nowa ankieta')}
      icon={BarChart3}
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={handleClose}>{tr('Anuluj')}</Button>
        <Button icon={BarChart3} onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
          {tr('Utwórz ankietę')}
        </Button>
      </>}
    >
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="poll-question" className={labelCls}>{tr('Pytanie')}</label>
          <input
            id="poll-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('np. Kto przyjdzie na spotkanie?')}
            className="mt-1 w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
            autoFocus
          />
        </div>

        <div>
          <span className={labelCls}>{tr('Opcje')}</span>
          <div className="mt-1 space-y-2">
            {options.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  value={opt.text}
                  onChange={(e) => updateOption(opt.id, e.target.value)}
                  placeholder={`${t('Opcja')} ${idx + 1}`}
                  aria-label={`${t('Opcja')} ${idx + 1}`}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(opt.id)} className="p-2 text-gray-400 hover:text-red-500 transition" aria-label={tr('Usuń opcję {n}', { n: idx + 1 })} title={tr('Usuń opcję')}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-accent-primary dark:text-accent-primary-light hover:underline"
            >
              <Plus size={16} /> {tr('Dodaj opcję')}
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl bg-gray-50 dark:bg-gray-800/40 px-4">
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tr('Wiele odpowiedzi')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Można zaznaczyć kilka opcji.')}</p>
            </div>
            <Toggle label={tr('Wiele odpowiedzi')} checked={multiple} onChange={setMultiple} />
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tr('Anonimowa')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Widać tylko liczbę głosów, bez nazwisk.')}</p>
            </div>
            <Toggle label={tr('Anonimowa')} checked={anonymous} onChange={setAnonymous} />
          </div>
          <div className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tr('Zamknij o…')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Po tym czasie nie da się już głosować.')}</p>
              </div>
              <Toggle label={tr('Zamknij o…')} checked={closeEnabled} onChange={toggleClose} />
            </div>
            {closeEnabled && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[160px]">
                  <CustomDatePicker value={closeDate} onChange={setCloseDate} min={toYmd(new Date())} clearable={false} aria-label={tr('Data zamknięcia')} />
                </div>
                <TimeInput value={closeTime} onChange={setCloseTime} aria-label={tr('Godzina zamknięcia')} />
              </div>
            )}
            {closeInPast && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{tr('Wybierz termin w przyszłości.')}</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
