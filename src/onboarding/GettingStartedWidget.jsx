import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, X, Check, ChevronRight, ChevronDown, PartyPopper } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { getChecklist } from './config';
import { supabase } from '../lib/supabase';
import { useT } from '../i18n';

// Pływająca checklista „Pierwsze kroki" w rogu ekranu — pasek postępu, auto-detekcja
// ukończenia i szybkie akcje (samouczek / kreator / przejście do modułu).

export default function GettingStartedWidget() {
  const t = useT();
  const navigate = useNavigate();
  const {
    loaded, state, isAdmin, checklistOpen, openChecklist, closeChecklist,
    completeStep, uncompleteStep, isStepDone, startTour, openWizard, openTutorials, dismissChecklist,
  } = useOnboarding();

  const tasks = useMemo(() => getChecklist({ isAdmin }), [isAdmin]);
  const [counts, setCounts] = useState({});

  // Lekka auto-detekcja treści (tylko admin ma te kroki) — liczniki dociągane przy otwarciu.
  useEffect(() => {
    if (!checklistOpen || !isAdmin) return;
    let cancelled = false;
    (async () => {
      const out = {};
      try { const { count } = await supabase.from('members').select('id', { count: 'exact', head: true }); out.hasMembers = (count || 0) > 0; } catch { /* moduł może być wyłączony */ }
      try { const { count } = await supabase.from('programs').select('id', { count: 'exact', head: true }); out.hasPrograms = (count || 0) > 0; } catch { /* ignore */ }
      if (!cancelled) setCounts(out);
    })();
    return () => { cancelled = true; };
  }, [checklistOpen, isAdmin]);

  const doneCount = tasks.filter(tk => isStepDone(tk, counts)).length;
  const total = tasks.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount >= total;

  // Nie pokazuj: rezygnacja globalna, brak danych, albo ukryto (dopóki nie otwarto ponownie).
  if (!loaded || state.dismissed || total === 0) return null;
  if (state.checklistDismissed && !checklistOpen) return null;

  const handleAction = (task) => {
    const a = task.action;
    if (a.type === 'tour') { closeChecklist(); startTour(a.tourId); }
    else if (a.type === 'wizard') { closeChecklist(); openWizard(); }
    else if (a.type === 'tutorials') { completeStep(task.id); closeChecklist(); openTutorials(); }
    else if (a.type === 'navigate') {
      if (!task.autoSignal) completeStep(task.id);
      closeChecklist();
      navigate(a.to);
    }
  };

  const toggleManual = (task, done, e) => {
    e.stopPropagation();
    if (task.autoSignal) return; // auto-kroki wynikają z danych — nie przełączamy ręcznie
    done ? uncompleteStep(task.id) : completeStep(task.id);
  };

  // ── Zwinięty przycisk (FAB) ──
  if (!checklistOpen) {
    return (
      <button
        data-tour="getting-started"
        onClick={openChecklist}
        className="fixed bottom-4 right-4 z-[60] group flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 hover:shadow-accent-primary-light/20 hover:-translate-y-0.5 transition-all"
        title={t('Pierwsze kroki')}
      >
        <span className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(rgb(var(--accent-primary)) ${pct * 3.6}deg, rgb(var(--accent-primary) / 0.15) 0deg)` }}>
          <span className="absolute inset-[3px] rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
            {allDone ? <Check size={16} className="text-accent-primary" /> : <Rocket size={16} className="text-accent-primary" />}
          </span>
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('Pierwsze kroki')}</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{t('{done} z {total} gotowe', { done: doneCount, total })}</span>
        </span>
      </button>
    );
  }

  // ── Rozwinięty panel ──
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[360px] z-[60] animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Nagłówek */}
        <div className="p-4 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Rocket size={18} />
              <h3 className="font-bold text-sm">{t('Pierwsze kroki')}</h3>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={closeChecklist} className="p-1 rounded-lg hover:bg-white/20 transition" title={t('Zwiń')}>
                <ChevronDown size={18} />
              </button>
              <button onClick={dismissChecklist} className="p-1 rounded-lg hover:bg-white/20 transition" title={t('Ukryj checklistę')}>
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="text-xs text-white/90 mt-1">{t('{done} z {total} kroków ukończonych', { done: doneCount, total })}</p>
          <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Lista kroków */}
        <div className="max-h-[52vh] overflow-y-auto custom-scrollbar p-2">
          {tasks.map(task => {
            const done = isStepDone(task, counts);
            const Icon = task.icon;
            return (
              <button
                key={task.id}
                onClick={() => handleAction(task)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition text-left group"
              >
                <span
                  onClick={(e) => toggleManual(task, done, e)}
                  className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition ${done ? 'bg-accent-primary border-accent-primary text-white' : 'border-gray-300 dark:border-gray-600 text-transparent group-hover:border-accent-primary-light'}`}
                >
                  <Check size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${done ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                    {t(task.title)}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{t(task.desc)}</span>
                </span>
                {!done && (
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-accent-primary-lightest dark:bg-gray-700 flex items-center justify-center text-accent-primary dark:text-accent-primary-light">
                    {Icon ? <Icon size={15} /> : <ChevronRight size={15} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stopka */}
        {allDone ? (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 text-center">
            <PartyPopper size={22} className="mx-auto text-accent-primary mb-1" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('Wszystko gotowe — świetna robota!')}</p>
            <button onClick={dismissChecklist} className="mt-3 w-full px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition">
              {t('Zamknij')}
            </button>
          </div>
        ) : (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700">
            <button onClick={dismissChecklist} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
              {t('Nie pokazuj tej listy')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
