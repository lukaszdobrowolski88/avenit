import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, Loader2, User } from 'lucide-react';
import { askBoard } from '../lib/aiBoards';

const SUGGESTIONS = [
  'Ile elementów jest w każdym statusie?',
  'Kto ma najwięcej przypisanych zadań?',
  'Które elementy są po terminie?',
  'Podsumuj krótko stan tablicy',
];

// AI Sidekick — zadaj pytanie o dane tablicy (Q&A w języku naturalnym).
export default function AiSidekick({ data, onClose }) {
  const [messages, setMessages] = useState([]); // {role:'user'|'ai', text}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }); }, [messages, busy]);

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
      setMessages(m => [...m, { role: 'ai', text: `⚠️ ${e.message || 'Błąd asystenta AI.'}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[460px] h-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white"><Sparkles size={17} /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 leading-tight">AI Sidekick</h2>
            <p className="text-[11px] text-gray-400">Zapytaj o dane tablicy „{data.board?.name}"</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Zadaj pytanie o swoją tablicę:</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => ask(s)} className="text-sm text-left px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-accent-primary/50 hover:bg-accent-primary/5 text-gray-700 dark:text-gray-200">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200' : 'bg-gradient-to-br from-accent-primary to-accent-secondary text-white'}`}>
                {m.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
              </div>
              <div className={`max-w-[80%] text-sm rounded-2xl px-3 py-2 whitespace-pre-wrap ${m.role === 'user' ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200'}`}>{m.text}</div>
            </div>
          ))}
          {busy && <div className="flex gap-2"><div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary text-white flex items-center justify-center"><Sparkles size={14} /></div><div className="bg-gray-100 dark:bg-gray-700/60 rounded-2xl px-3 py-2"><Loader2 size={15} className="animate-spin text-gray-400" /></div></div>}
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-end gap-2 bg-gray-100 dark:bg-gray-700/50 rounded-xl px-3 py-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              placeholder="Zapytaj o tablicę..." className="flex-1 bg-transparent text-sm outline-none resize-none text-gray-800 dark:text-gray-100 max-h-24" />
            <button onClick={() => ask()} disabled={busy || !input.trim()} className="text-accent-primary disabled:opacity-40 p-1"><Send size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
