import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, User } from 'lucide-react';
import Modal from '../../../components/Modal';
import Spinner from '../../../components/Spinner';
import { ChoiceList, ChoiceRow } from '../../../components/ChoiceList';
import { askBoard } from '../lib/aiBoards';
import { tr } from '../../../i18n';

const SUGGESTIONS = [
  'Ile zadań jest w każdym statusie?',
  'Kto ma najwięcej przypisanych zadań?',
  'Które zadania są po terminie?',
  'Podsumuj krótko stan zadań',
];

// Asystent AI tablicy — pytanie o dane w języku naturalnym. Okno jak wszystkie w aplikacji (Modal:
// Esc, fokus w oknie, ten sam nagłówek); nazwa jak moduł „Asystent AI” w menu.
export default function AiSidekick({ data, onClose }) {
  const [messages, setMessages] = useState([]); // {role:'user'|'ai', text, error?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages, busy]);

  const ask = async (q) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const answer = await askBoard(question, { board: data.board, columns: data.columns, items: data.items });
      setMessages(m => [...m, { role: 'ai', text: answer }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'ai', error: true, text: e.message || tr('Asystent nie odpowiedział. Spróbuj ponownie za chwilę.') }]);
    } finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={tr('Asystent AI')} subtitle={tr('Zapytaj o „{name}”', { name: data.board?.name ?? '' })}
      icon={Sparkles} size="lg"
      footer={(
        <div className="flex items-end gap-2 w-full">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} aria-label={tr('Pytanie do asystenta')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder={tr('Zapytaj o zadania…')}
            className="flex-1 min-h-[42px] max-h-28 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent-primary-light/40" />
          <button type="button" onClick={() => ask()} disabled={busy || !input.trim()} aria-label={tr('Wyślij pytanie')}
            className="tool-btn tool-btn--primary tool-btn--icon !h-[42px] !w-[42px] disabled:opacity-40">
            <Send size={17} aria-hidden="true" />
          </button>
        </div>
      )}>
      <div className="p-6 space-y-3 min-h-[280px]" aria-live="polite">
        {messages.length === 0 && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Przykładowe pytania:')}</p>
            <ChoiceList>
              {SUGGESTIONS.map(s => <ChoiceRow key={s} icon={Sparkles} title={tr(s)} onClick={() => ask(tr(s))} />)}
            </ChoiceList>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${m.role === 'user' ? 'bg-[rgba(42,35,18,0.08)] text-gray-700 dark:bg-white/10 dark:text-gray-200' : 'bg-[rgb(var(--accent-primary-lighter))] text-[rgb(var(--accent-primary-darkest))]'}`} aria-hidden="true">
              {m.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
            </div>
            <div className={`max-w-[80%] text-sm rounded-2xl px-3.5 py-2 whitespace-pre-wrap ${m.role === 'user'
              ? 'bg-[#2A2312] text-white dark:bg-[rgb(var(--accent-primary-light))] dark:text-[#1a160c]'
              : m.error ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-[rgba(42,35,18,0.05)] text-gray-800 dark:bg-white/[0.07] dark:text-gray-100'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <Spinner size={18} label={tr('Asystent myśli…')} />}
        <div ref={scrollRef} />
      </div>
    </Modal>
  );
}
