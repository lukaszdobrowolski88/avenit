import React, { useState } from 'react';
import { Mail, Share2, Users, Baby } from 'lucide-react';
import { callAi } from '../lib/aiApi';
import ResultPanel from '../components/ResultPanel';

// Warianty generowania z tekstu kazania.
const ACTIONS = [
  { task: 'sermon_newsletter', label: 'Newsletter', icon: Mail, resultTitle: 'Treść newslettera' },
  { task: 'sermon_social', label: 'Posty social', icon: Share2, resultTitle: '3 posty do social media' },
  { task: 'sermon_discussion', label: 'Konspekt grupy', icon: Users, resultTitle: 'Konspekt grupy domowej' },
  { task: 'sermon_kids', label: 'Lekcja dla dzieci', icon: Baby, resultTitle: 'Zarys lekcji dla dzieci' },
];

export default function SermonAssistantTab() {
  const [sermon, setSermon] = useState('');
  const [loadingTask, setLoadingTask] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState('');
  const [resultTitle, setResultTitle] = useState('Wynik');

  const run = async (action) => {
    if (!sermon.trim()) {
      setError('Wklej najpierw tekst lub notatki kazania.');
      setResult('');
      return;
    }
    setLoadingTask(action.task);
    setError(null);
    setResult('');
    setResultTitle(action.resultTitle);
    try {
      const text = await callAi(action.task, sermon);
      setResult(text);
    } catch (err) {
      setError(err.message || 'Wystąpił błąd.');
    } finally {
      setLoadingTask(null);
    }
  };

  const busy = loadingTask !== null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">
            Tekst lub notatki kazania
          </label>
          <textarea
            value={sermon}
            onChange={(e) => setSermon(e.target.value)}
            rows={10}
            placeholder="Wklej tutaj tekst kazania albo swoje notatki, a asystent przygotuje z nich materiały…"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-y focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.task}
                onClick={() => run(a)}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition disabled:opacity-60"
              >
                <Icon size={16} />
                {loadingTask === a.task ? 'Generowanie…' : a.label}
              </button>
            );
          })}
        </div>
      </div>

      <ResultPanel
        loading={busy}
        error={error}
        result={result}
        title={resultTitle}
        emptyHint="Wklej kazanie i wybierz, co przygotować."
      />
    </div>
  );
}
