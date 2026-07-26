import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { callAi } from '../lib/aiApi';
import ResultPanel from '../components/ResultPanel';

// Zapytaj o dane: pytanie w języku naturalnym -> odpowiedź na podstawie kontekstu.
// Na tym etapie kontekst danych jest placeholderem (null) — do rozbudowy później.
export default function AskDataTab() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState('');

  const run = async () => {
    if (!question.trim()) {
      setError('Zadaj pytanie dotyczące danych.');
      setResult('');
      return;
    }
    setLoading(true);
    setError(null);
    setResult('');
    try {
      // context: placeholder — docelowo przekażemy tu dane z modułów (np. frekwencja, dawanie).
      const text = await callAi('ask_data', question, null);
      setResult(text);
    } catch (err) {
      setError(err.message || 'Wystąpił błąd.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-900/15 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        Funkcja w budowie — asystent odpowiada na podstawie przekazanych danych. Na razie kontekst danych
        jest pusty, więc odpowiedzi będą ogólne.
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">
            Twoje pytanie
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Np. „Ilu mieliśmy nowych członków w tym kwartale?” albo „Jak wyglądała frekwencja w ostatnim miesiącu?”"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-y focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition disabled:opacity-60"
        >
          <MessageCircle size={16} />
          {loading ? 'Szukam odpowiedzi…' : 'Zapytaj'}
        </button>
      </div>

      <ResultPanel
        loading={loading}
        error={error}
        result={result}
        title="Odpowiedź"
        emptyHint="Zadaj pytanie, a asystent odpowie na podstawie dostępnych danych."
      />
    </div>
  );
}
