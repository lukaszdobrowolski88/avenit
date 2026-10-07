import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, LogOut, UserCheck, ShieldCheck, Calendar, ArrowLeft } from 'lucide-react';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import VirtualKeypad from './VirtualKeypad';
import { supabase } from '../../../../lib/supabase';
import { tr } from '../../../../i18n';
import {
  KIOSK_PIN_LENGTH,
  isValidPin,
  hashPin,
  randomSalt,
  verifyPin,
  clearKioskState,
  lockoutRemaining,
} from '../utils/kiosk';

// ─────────────────────────────────────────────────────────────────────────────
// Tryb kiosku: pełnoekranowa nakładka nad całą aplikacją — tylko meldowanie i odbiór.
// Bez menu, zakładek modułu, ustawień i listy obecności. Wyjście tylko PIN-em ustawionym
// przy włączeniu (w localStorage leży wyłącznie skrót PIN-u) albo przez wylogowanie
// (ponowne wejście wymaga hasła). Stan przetrwa odświeżenie strony.
// ─────────────────────────────────────────────────────────────────────────────

export function requestKioskFullscreen() {
  try {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !document.fullscreenElement && !document.webkitFullscreenElement) {
      const p = fn.call(el);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* przeglądarka nie pozwala — kiosk działa i bez pełnego ekranu */ }
}

export function exitKioskFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      const p = document.exitFullscreen();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch { /* ignore */ }
}

// Okno włączenia kiosku: PIN dwukrotnie, potem „Włącz” (pełny ekran wymaga kliknięcia).
export function KioskStartDialog({ isOpen, onClose, onStart }) {
  const [step, setStep] = useState('pin1');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) { setStep('pin1'); setPin1(''); setPin2(''); setError(''); setBusy(false); }
  }, [isOpen]);

  const onPin1 = (v) => {
    setPin1(v);
    setError('');
    if (v.length === KIOSK_PIN_LENGTH) setStep('pin2');
  };

  const onPin2 = (v) => {
    setPin2(v);
    if (v.length === KIOSK_PIN_LENGTH) {
      if (v !== pin1) {
        setError(tr('PIN-y się różnią. Wpisz PIN jeszcze raz.'));
        setPin1('');
        setPin2('');
        setStep('pin1');
      } else {
        setStep('ready');
      }
    }
  };

  const handleStart = async () => {
    if (!isValidPin(pin1) || pin1 !== pin2) return;
    // Pełny ekran od razu w obsłudze kliknięcia (przeglądarki wymagają gestu użytkownika).
    requestKioskFullscreen();
    setBusy(true);
    try {
      const salt = randomSalt();
      const pinHash = await hashPin(pin1, salt);
      onStart({ active: true, salt, pinHash, startedAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      size="sm"
      icon={ShieldCheck}
      title={tr('Tryb kiosku dla rodziców')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Lock} onClick={handleStart} disabled={step !== 'ready'} loading={busy}>
          {tr('Włącz tryb kiosku')}
        </Button>
      </>}
    >
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {tr('Na ekranie zostanie tylko meldowanie i odbiór dzieci — bez menu, danych członków i ustawień. Wyjście z trybu kiosku wymaga PIN-u, który teraz ustawisz.')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr('Na tablecie włącz też blokadę aplikacji: Dostęp z przewodnikiem (iPad) albo przypinanie ekranu (Android).')}
        </p>
        {step === 'ready' ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <ShieldCheck size={36} className="text-accent-primary" />
            <div className="font-semibold text-gray-900 dark:text-white">{tr('PIN ustawiony')}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{tr('Zapamiętaj go — będzie potrzebny, aby wyjść z trybu kiosku.')}</div>
            <button type="button" onClick={() => { setStep('pin1'); setPin1(''); setPin2(''); }} className="text-sm text-accent-primary hover:underline mt-1">
              {tr('Zmień PIN')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              {step === 'pin1' ? tr('Ustaw 4-cyfrowy PIN wyjścia') : tr('Powtórz PIN')}
            </div>
            {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</div>}
            <VirtualKeypad
              key={step}
              value={step === 'pin1' ? pin1 : pin2}
              onChange={step === 'pin1' ? onPin1 : onPin2}
              maxLength={KIOSK_PIN_LENGTH}
              masked
              label={step === 'pin1' ? tr('PIN wyjścia') : tr('Powtórz PIN')}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// Ekran wyjścia z kiosku — PIN z blokadą po kilku błędach; awaryjnie wylogowanie.
function KioskExitScreen({ kioskState, onExit, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [failures, setFailures] = useState({ count: 0, at: 0 });
  const [now, setNow] = useState(Date.now());
  const lockMs = lockoutRemaining(failures.count, failures.at, now);

  useEffect(() => {
    if (!lockMs) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockMs]);

  const onChange = async (v) => {
    setPin(v);
    setError('');
    if (v.length !== KIOSK_PIN_LENGTH) return;
    if (await verifyPin(v, kioskState)) {
      onExit();
      return;
    }
    setPin('');
    setFailures((f) => ({ count: f.count + 1, at: Date.now() }));
    setNow(Date.now());
    setError(tr('Nieprawidłowy PIN.'));
  };

  const handleLogout = async () => {
    clearKioskState();
    exitKioskFullscreen();
    try { await supabase.auth.signOut(); } catch { /* i tak przechodzimy do logowania */ }
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col items-center px-5 py-8 text-center">
      <Lock size={32} className="text-gray-400 mb-3" />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{tr('Zakończ tryb kiosku')}</h1>
      <p className="text-base text-gray-600 dark:text-gray-400 mb-5">{tr('Wpisz PIN ustawiony przy włączaniu kiosku')}</p>
      {lockMs > 0 ? (
        <div role="alert" className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 max-w-sm">
          {tr('Za dużo błędnych prób. Spróbuj ponownie za {n} s.', { n: Math.ceil(lockMs / 1000) })}
        </div>
      ) : (
        <>
          <div className="h-6 mb-1" aria-live="polite">
            {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          </div>
          <VirtualKeypad value={pin} onChange={onChange} maxLength={KIOSK_PIN_LENGTH} masked label={tr('PIN wyjścia')} />
        </>
      )}
      <div className="flex flex-col items-center gap-3 mt-8">
        <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={onCancel}>{tr('Wróć do meldowania')}</Button>
        <button type="button" onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">
          <LogOut size={14} />
          {tr('Nie pamiętasz PIN-u? Wyloguj się (potrzebne będzie hasło)')}
        </button>
      </div>
    </div>
  );
}

const IDLE_MS = 90 * 1000;

// Nakładka kiosku. `screen` = 'checkin' | 'checkout'; `onIdle` — powrót do ekranu startowego
// po bezczynności (rodzic odszedł w połowie — nie zostawiamy danych rodziny na ekranie).
export function KioskShell({ kioskState, screen, onScreenChange, onExit, onIdle, sessionLabel, banner, children }) {
  const [exiting, setExiting] = useState(false);
  const idleTimer = useRef(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  // Przycisk „wstecz” przeglądarki nie wyprowadza z kiosku.
  useEffect(() => {
    const trap = () => {
      try { window.history.pushState({ kidsKiosk: true }, '', window.location.href); } catch { /* ignore */ }
    };
    trap();
    window.addEventListener('popstate', trap);
    return () => window.removeEventListener('popstate', trap);
  }, []);

  // Skróty aplikacji (np. paleta poleceń Ctrl/⌘+K) nie działają w kiosku.
  useEffect(() => {
    const block = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) e.stopPropagation();
    };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  }, []);

  // Bezczynność → ekran startowy.
  useEffect(() => {
    const arm = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setExiting(false);
        onIdleRef.current?.();
      }, IDLE_MS);
    };
    arm();
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, arm, true));
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, arm, true));
    };
  }, []);

  // Blokada przewijania strony pod nakładką.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (typeof document === 'undefined' || !document.body) return null;

  const tabClass = (active) => `flex items-center gap-2 px-5 py-3 text-base font-semibold rounded-xl transition
    ${active
      ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md'
      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:border-accent-primary'}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white"
      role="application"
      aria-label={tr('Kiosk meldowania dzieci')}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80">
        <div className="min-w-0">
          <div className="text-lg font-bold">{tr('Meldowanie dzieci')}</div>
          {sessionLabel && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 truncate">
              <Calendar size={14} />
              <span className="truncate">{sessionLabel}</span>
            </div>
          )}
        </div>
        {!exiting && (
          <nav className="flex gap-2" aria-label={tr('Tryb kiosku')}>
            <button type="button" className={tabClass(screen === 'checkin')} onClick={() => onScreenChange('checkin')} aria-current={screen === 'checkin' ? 'page' : undefined}>
              <UserCheck size={18} />
              <span className="hidden sm:inline">{tr('Zamelduj')}</span>
            </button>
            <button type="button" className={tabClass(screen === 'checkout')} onClick={() => onScreenChange('checkout')} aria-current={screen === 'checkout' ? 'page' : undefined}>
              <LogOut size={18} />
              <span className="hidden sm:inline">{tr('Odbierz')}</span>
            </button>
          </nav>
        )}
        <button
          type="button"
          onClick={() => setExiting(true)}
          className="p-3 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label={tr('Zakończ tryb kiosku')}
          title={tr('Zakończ tryb kiosku')}
        >
          <Lock size={20} />
        </button>
      </header>
      {banner}
      <main className="flex-1 overflow-auto">
        {exiting ? (
          <KioskExitScreen
            kioskState={kioskState}
            onCancel={() => setExiting(false)}
            onExit={() => { setExiting(false); onExit(); }}
          />
        ) : children}
      </main>
    </div>,
    document.body,
  );
}
