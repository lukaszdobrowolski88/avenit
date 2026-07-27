import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { useSidebar } from '../components/Sidebar';
import { TOURS } from './config';
import { useT } from '../i18n';

// Własny silnik product tour (spotlight + coach-marks). Bez zależności zewnętrznych.
// Renderowany jako portal ponad całą aplikacją; podświetla element z data-tour i pokazuje
// dymek z opisem oraz nawigacją krok-po-kroku.

const Z_BACKDROP = 100040;
const Z_HOLE = 100045;
const Z_POPOVER = 100050;
const PAD = 8; // padding wokół podświetlanego elementu

// Zwróć pierwszy WIDOCZNY element pasujący do selektora (sidebar renderuje się 2×:
// desktop + drawer mobilny — bierzemy ten faktycznie widoczny).
function getVisibleTarget(selector) {
  let els;
  try { els = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none') return el;
  }
  return null;
}

const measure = (el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
};

function placePopover(rect, placement, size, vw, vh) {
  const gap = 14, m = 12, { w, h } = size;
  let place = placement || 'bottom';
  if (place === 'bottom' && rect.bottom + gap + h > vh - m && rect.top - gap - h > m) place = 'top';
  else if (place === 'top' && rect.top - gap - h < m && rect.bottom + gap + h < vh - m) place = 'bottom';
  if (place === 'right' && rect.right + gap + w > vw - m && rect.left - gap - w > m) place = 'left';
  else if (place === 'left' && rect.left - gap - w < m && rect.right + gap + w < vw - m) place = 'right';

  let top, left;
  if (place === 'bottom') { top = rect.bottom + gap; left = rect.left + rect.width / 2 - w / 2; }
  else if (place === 'top') { top = rect.top - gap - h; left = rect.left + rect.width / 2 - w / 2; }
  else if (place === 'right') { left = rect.right + gap; top = rect.top + rect.height / 2 - h / 2; }
  else { left = rect.left - gap - w; top = rect.top + rect.height / 2 - h / 2; }

  left = Math.max(m, Math.min(left, vw - w - m));
  top = Math.max(m, Math.min(top, vh - h - m));
  return { top, left };
}

export default function TourEngine() {
  const t = useT();
  const { activeTour, stopTour, finishTour } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebar = useSidebar();

  const steps = (activeTour && TOURS[activeTour]) || [];
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [targetEl, setTargetEl] = useState(null);
  const popRef = useRef(null);
  const [popSize, setPopSize] = useState({ w: 320, h: 180 });

  const active = !!activeTour && steps.length > 0;
  const step = steps[stepIndex] || null;
  const isLast = stepIndex >= steps.length - 1;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Reset przy (re)starcie tury.
  useEffect(() => { if (activeTour) { setStepIndex(0); setRect(null); setTargetEl(null); } }, [activeTour]);

  const goNext = useCallback(() => {
    setStepIndex(i => (i < steps.length - 1 ? i + 1 : i));
    if (isLast) finishTour(activeTour);
  }, [steps.length, isLast, finishTour, activeTour]);
  const goPrev = useCallback(() => setStepIndex(i => Math.max(0, i - 1)), []);
  const close = useCallback(() => stopTour(), [stopTour]);

  // Lokalizuj element bieżącego kroku (z obsługą trasy, drawera mobilnego i retry).
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false, tries = 0, timer;
    // Kroki procesowe czekają dłużej na element pojawiający się po akcji usera (modal, trasa).
    const maxTries = step.waitMs ? Math.max(40, Math.ceil(step.waitMs / 60)) : 40;

    if (step.route && location.pathname !== step.route) navigate(step.route);
    if (step.sidebar && window.innerWidth < 1024 && sidebar && !sidebar.isOpen) sidebar.toggle();

    const locate = () => {
      if (cancelled) return;
      const el = getVisibleTarget(step.selector);
      if (el) {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch { /* ignore */ }
        setTargetEl(el);
        timer = setTimeout(() => { if (!cancelled) setRect(measure(el)); }, 140);
      } else if (tries < maxTries) {
        tries++; timer = setTimeout(locate, 60);
      } else {
        // Elementu brak (moduł wyłączony / brak dostępu / krok opcjonalny) — pomiń.
        setTargetEl(null); setRect(null);
        if (stepIndex < steps.length - 1) setStepIndex(i => i + 1); else finishTour(activeTour);
      }
    };
    locate();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, activeTour]);

  // Utrzymuj pozycję zgodną z układem (scroll / resize / animacje).
  useEffect(() => {
    if (!active || !targetEl) return;
    const update = () => setRect(measure(targetEl));
    const id = setInterval(update, 150);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { clearInterval(id); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [active, targetEl]);

  // Zmierz rozmiar dymka do precyzyjnego pozycjonowania.
  useLayoutEffect(() => {
    if (popRef.current) {
      const r = popRef.current.getBoundingClientRect();
      if (Math.abs(r.width - popSize.w) > 2 || Math.abs(r.height - popSize.h) > 2) {
        setPopSize({ w: r.width, h: r.height });
      }
    }
  });

  // Klawiatura: Esc = zamknij, ←/→ = nawigacja.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, goNext, goPrev]);

  // Zawsze aktualne goNext dla nasłuchów (identyczność zmienia się co render).
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // Krok interaktywny z advanceOn:'click' — przejdź dalej, gdy user kliknie podświetlony element
  // (np. „Nowy program", „Dodaj sesję"). Opóźnienie pozwala odpalić skutek kliknięcia (modal/trasa).
  useEffect(() => {
    if (!active || !targetEl || step?.advanceOn !== 'click') return;
    const onClick = () => { setTimeout(() => goNextRef.current(), 400); };
    targetEl.addEventListener('click', onClick, { capture: true, once: true });
    return () => targetEl.removeEventListener('click', onClick, { capture: true });
  }, [active, targetEl, step]);

  if (!active || !step) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const pos = rect && !isMobile ? placePopover(rect, step.placement, popSize, vw, vh) : null;
  // Krok interaktywny: pozwól klikać podświetlony element (nie blokuj aplikacji).
  const interactive = !!step.interactive;
  const advanceClick = step.advanceOn === 'click';

  const holeStyle = rect ? {
    position: 'fixed',
    top: rect.top - PAD, left: rect.left - PAD,
    width: rect.width + PAD * 2, height: rect.height + PAD * 2,
    borderRadius: 14,
    boxShadow: '0 0 0 3px rgb(var(--accent-primary-light) / 0.9), 0 0 0 9999px rgba(15, 23, 42, 0.6)',
    pointerEvents: 'none',
    transition: 'top .2s ease, left .2s ease, width .2s ease, height .2s ease',
    zIndex: Z_HOLE,
  } : null;

  const popStyle = isMobile
    ? { position: 'fixed', left: 12, right: 12, bottom: 16, zIndex: Z_POPOVER }
    : { position: 'fixed', top: pos ? pos.top : vh / 2 - popSize.h / 2, left: pos ? pos.left : vw / 2 - popSize.w / 2, width: 340, maxWidth: 'calc(100vw - 24px)', zIndex: Z_POPOVER };

  return createPortal(
    <div aria-live="polite">
      {/* Tło. Krok pasywny: blokuje kliknięcia (klik = zamknij). Krok interaktywny:
          przepuszcza kliknięcia do aplikacji, żeby user mógł wykonać akcję. Dim rysuje box-shadow „dziury". */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: Z_BACKDROP,
          background: rect ? 'transparent' : (interactive ? 'rgba(15,23,42,0.35)' : 'rgba(15,23,42,0.6)'),
          cursor: 'default', pointerEvents: interactive ? 'none' : 'auto',
        }}
        onClick={interactive ? undefined : close}
      />
      {holeStyle && <div style={holeStyle} />}

      {/* Dymek */}
      <div ref={popRef} style={popStyle} className="animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-primary dark:text-accent-primary-light">
              {t('Krok {n} z {total}', { n: stepIndex + 1, total: steps.length })}
            </span>
            <button onClick={close} className="p-1 -m-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" aria-label={t('Zamknij')}>
              <X size={16} />
            </button>
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1">{t(step.title)}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{t(step.body)}</p>

          {advanceClick && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-accent-primary dark:text-accent-primary-light">
              <span className="text-sm">👆</span> {t('Kliknij podświetlony element, aby przejść dalej')}
            </p>
          )}

          <div className="flex items-center justify-between mt-4">
            {/* Kropki postępu */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-5 bg-accent-primary' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button onClick={goPrev} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-1">
                  <ChevronLeft size={16} /> {t('Wstecz')}
                </button>
              )}
              {advanceClick && !isLast ? (
                <button onClick={goNext} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-1">
                  {t('Pomiń krok')} <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={goNext} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition flex items-center gap-1">
                  {isLast ? (<>{t('Zakończ')} <Check size={16} /></>) : (<>{t('Dalej')} <ChevronRight size={16} /></>)}
                </button>
              )}
            </div>
          </div>

          {!isLast && (
            <button onClick={close} className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition w-full text-center">
              {t('Pomiń samouczek')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
