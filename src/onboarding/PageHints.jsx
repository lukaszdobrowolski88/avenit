import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from './OnboardingContext';
import { HINTS } from './config';
import HintBeacon from './HintBeacon';

// Warstwa kontekstowych podpowiedzi sterowana trasą: dla bieżącej ścieżki pokazuje
// beacony zdefiniowane w HINTS, pomijając te już zamknięte przez użytkownika.
// Wstrzymana, gdy trwa samouczek / powitanie / kreator (żeby nie nakładać warstw).

const MAX_VISIBLE = 2;

export default function PageHints() {
  const location = useLocation();
  const { loaded, state, dismissHint, activeTour, welcomeOpen, wizardOpen } = useOnboarding();
  const [ready, setReady] = useState(false);

  // Poczekaj aż strona się ustabilizuje po zmianie trasy.
  useEffect(() => {
    setReady(false);
    const id = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(id);
  }, [location.pathname]);

  if (!loaded || !ready || state.dismissed) return null;
  if (activeTour || welcomeOpen || wizardOpen) return null;

  const seen = new Set(state.hintsSeen || []);
  const hints = (HINTS[location.pathname] || []).filter(h => !seen.has(h.id)).slice(0, MAX_VISIBLE);
  if (hints.length === 0) return null;

  return (
    <>
      {hints.map(h => <HintBeacon key={h.id} hint={h} onDismiss={dismissHint} />)}
    </>
  );
}
