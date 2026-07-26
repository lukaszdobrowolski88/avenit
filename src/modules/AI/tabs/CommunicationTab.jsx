import React, { useState } from 'react';
import { PenLine } from 'lucide-react';
import { callAi } from '../lib/aiApi';
import ResultPanel from '../components/ResultPanel';

// Pomoc w komunikacji: prompt -> gotowy szkic komunikatu (email/sms).
export default function CommunicationTab() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState('');

  const run = async () => {
    if (!prompt.trim()) {
      setError('Opisz, jaki komunikat chcesz przygotować.');
      setResult('');
      return;
    }
    setLoading(true);
    setError(null);
    setResult('');
    try {
      const text = await callAi('draft_message', prompt);
      setResult(text);
    } catch (err) {
      setError(err.message || 'Wystąpił błąd.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">
            Czego dotyczy komunikat?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Np. „Napisz e-mail z zaproszeniem na wieczór uwielbienia w piątek o 19:00 w sali głównej” albo „Krótki SMS z przypomnieniem o spotkaniu liderów jutro o 18:00”."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-y focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition disabled:opacity-60"
        >
          <PenLine size={16} />
          {loading ? 'Generowanie…' : 'Wygeneruj szkic'}
        </button>
      </div>

      <ResultPanel
        loading={loading}
        error={error}
        result={result}
        title="Szkic komunikatu"
        emptyHint="Opisz komunikat, a asystent przygotuje gotowy szkic."
      />
    </div>
  );
}
