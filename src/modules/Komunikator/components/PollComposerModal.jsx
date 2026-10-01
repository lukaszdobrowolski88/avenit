import React, { useState, useRef } from 'react';
import { X, Plus, Trash2, BarChart3 } from 'lucide-react';
import { useT, tr } from '../../../i18n';

// Modal tworzenia ankiety w czacie.
export default function PollComposerModal({ isOpen, onClose, onSubmit }) {
  const t = useT();
  const idCounter = useRef(2);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([
    { id: 'o1', text: '' },
    { id: 'o2', text: '' }
  ]);
  const [multiple, setMultiple] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    idCounter.current = 2;
    setQuestion('');
    setOptions([{ id: 'o1', text: '' }, { id: 'o2', text: '' }]);
    setMultiple(false);
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
  const canSubmit = question.trim() && validOptions.length >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({
      question: question.trim(),
      options: validOptions.map(o => ({ id: o.id, text: o.text.trim() })),
      multiple,
      closes_at: null
    });
    reset();
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <BarChart3 size={20} className="text-accent-primary" />
            {tr('Nowa ankieta')}
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{tr('Pytanie')}</label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('np. Kto przyjdzie na spotkanie?')}
              className="mt-1 w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{tr('Opcje')}</label>
            <div className="mt-1 space-y-2">
              {options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    value={opt.text}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                    placeholder={`${t('Opcja')} ${idx + 1}`}
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
                  />
                  {options.length > 2 && (
                    <button onClick={() => removeOption(opt.id)} className="p-2 text-gray-400 hover:text-red-500 transition">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-accent-primary dark:text-accent-primary-light hover:underline"
              >
                <Plus size={16} /> {tr('Dodaj opcję')}
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={multiple}
              onChange={(e) => setMultiple(e.target.checked)}
              className="w-4 h-4 rounded accent-accent-primary"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{tr('Pozwól wybrać wiele opcji')}</span>
          </label>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <BarChart3 size={18} />
            {tr('Utwórz ankietę')}
          </button>
        </div>
      </div>
    </div>
  );
}
