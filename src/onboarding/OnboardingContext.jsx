import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePermissions } from '../contexts/PermissionsContext';
import { useUserRole } from '../hooks/useUserRole';

// Stan onboardingu (per-użytkownik) — źródło prawdy w bazie (app_users.onboarding),
// z lekkim mirrorem w localStorage dla natychmiastowego startu bez migotania.
//
// Kształt stanu (JSONB):
//  { welcomedAt, wizardCompletedAt, tourCompletedAt, toursSeen:{id:true},
//    checklist:{id:true}, hintsSeen:[id], checklistDismissed, dismissed }

const CACHE_KEY = 'avenit_onboarding_cache';
const nowIso = () => new Date().toISOString();

const readCache = () => {
  try { const v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
};

const noop = () => {};
const DEFAULT_CTX = {
  state: {}, loaded: false, isAdmin: false, signals: { hasLogo: false, tourDone: false },
  activeTour: null, checklistOpen: false, welcomeOpen: false, wizardOpen: false,
  startTour: noop, stopTour: noop, finishTour: noop,
  completeStep: noop, uncompleteStep: noop, isStepDone: () => false,
  dismissHint: noop, setWelcomed: noop, markWizardDone: noop,
  dismissChecklist: noop, dismissAll: noop, resetOnboarding: noop,
  openChecklist: noop, closeChecklist: noop, toggleChecklist: noop,
  openWizard: noop, closeWizard: noop, closeWelcome: noop,
};

const OnboardingContext = createContext(DEFAULT_CTX);

export function OnboardingProvider({ user, children }) {
  const email = user?.email || null;
  const { logoUrl, subject } = usePermissions();
  const { userRole } = useUserRole();
  const isAdmin = subject?.isAdmin ?? (userRole === 'superadmin' || userRole === 'rada_starszych');

  // Sesja z /me lub /login niesie już `onboarding` (patrz publicUser w API).
  // 'onboarding' in user === true => wartość autorytatywna (nawet puste {}).
  const initial = user && 'onboarding' in user ? (user.onboarding || {}) : null;
  const [state, setState] = useState(() => initial ?? readCache() ?? {});
  const [loaded, setLoaded] = useState(initial != null);

  const [activeTour, setActiveTour] = useState(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const saveTimer = useRef(null);

  // Fallback dla starszych sesji (zapisanych przed wdrożeniem kolumny): dociągnij z bazy.
  useEffect(() => {
    if (initial != null || !email) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('app_users').select('onboarding').eq('email', email).maybeSingle();
        if (!cancelled && data?.onboarding && typeof data.onboarding === 'object') {
          setState(data.onboarding);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [email, initial]);

  const persist = useCallback((next) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    if (!email) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('app_users').update({ onboarding: next }).eq('email', email)
        .then(({ error }) => { if (error) console.warn('[onboarding] zapis nieudany:', error.message); });
    }, 600);
  }, [email]);

  // patch przyjmuje obiekt lub funkcję (prev)=>obiekt-do-scalenia.
  const patch = useCallback((p) => {
    setState(prev => {
      const delta = typeof p === 'function' ? p(prev) : p;
      const next = { ...prev, ...delta };
      persist(next);
      return next;
    });
  }, [persist]);

  const completeStep = useCallback((id) => patch(prev => ({ checklist: { ...(prev.checklist || {}), [id]: true } })), [patch]);
  const uncompleteStep = useCallback((id) => patch(prev => {
    const c = { ...(prev.checklist || {}) }; delete c[id]; return { checklist: c };
  }), [patch]);
  const dismissHint = useCallback((id) => patch(prev => ({ hintsSeen: Array.from(new Set([...(prev.hintsSeen || []), id])) })), [patch]);
  const setWelcomed = useCallback(() => patch(prev => (prev.welcomedAt ? {} : { welcomedAt: nowIso() })), [patch]);
  const markWizardDone = useCallback(() => patch({ wizardCompletedAt: nowIso() }), [patch]);
  const dismissChecklist = useCallback(() => patch({ checklistDismissed: true }), [patch]);
  const dismissAll = useCallback(() => patch({ dismissed: true, welcomedAt: nowIso(), checklistDismissed: true }), [patch]);

  const startTour = useCallback((id = 'welcome') => setActiveTour(id), []);
  const stopTour = useCallback(() => setActiveTour(null), []);
  const finishTour = useCallback((id = 'welcome') => {
    patch(prev => ({ toursSeen: { ...(prev.toursSeen || {}), [id]: true }, tourCompletedAt: prev.tourCompletedAt || nowIso() }));
    setActiveTour(null);
  }, [patch]);

  const resetOnboarding = useCallback(() => {
    setState({}); persist({}); setActiveTour(null); setWizardOpen(false); setWelcomeOpen(true);
  }, [persist]);

  const openChecklist = useCallback(() => setChecklistOpen(true), []);
  const closeChecklist = useCallback(() => setChecklistOpen(false), []);
  const toggleChecklist = useCallback(() => setChecklistOpen(v => !v), []);
  const openWizard = useCallback(() => setWizardOpen(true), []);
  const closeWizard = useCallback(() => setWizardOpen(false), []);
  const closeWelcome = useCallback(() => { setWelcomeOpen(false); setWelcomed(); }, [setWelcomed]);

  // Powitanie pokazuje się raz — przy pierwszym logowaniu (pusty stan, brak rezygnacji).
  useEffect(() => {
    if (loaded && !state.dismissed && !state.welcomedAt) setWelcomeOpen(true);
  }, [loaded, state.dismissed, state.welcomedAt]);

  const signals = useMemo(() => ({
    hasLogo: !!logoUrl,
    tourDone: !!state.tourCompletedAt,
  }), [logoUrl, state.tourCompletedAt]);

  const isStepDone = useCallback((step, extraSignals = {}) => {
    if (state.checklist?.[step.id]) return true;
    if (step.autoSignal) return !!(signals[step.autoSignal] ?? extraSignals[step.autoSignal]);
    return false;
  }, [state.checklist, signals]);

  const value = useMemo(() => ({
    state, loaded, isAdmin, signals,
    activeTour, checklistOpen, welcomeOpen, wizardOpen,
    startTour, stopTour, finishTour,
    completeStep, uncompleteStep, isStepDone,
    dismissHint, setWelcomed, markWizardDone, dismissChecklist, dismissAll, resetOnboarding,
    openChecklist, closeChecklist, toggleChecklist, openWizard, closeWizard, closeWelcome,
  }), [state, loaded, isAdmin, signals, activeTour, checklistOpen, welcomeOpen, wizardOpen,
    startTour, stopTour, finishTour, completeStep, uncompleteStep, isStepDone,
    dismissHint, setWelcomed, markWizardDone, dismissChecklist, dismissAll, resetOnboarding,
    openChecklist, closeChecklist, toggleChecklist, openWizard, closeWizard, closeWelcome]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
