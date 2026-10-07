import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Check, MousePointerClick } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { useSidebar } from '../components/Sidebar';
import { TOURS } from './config';
import { useT, tr } from '../i18n';

// Własny silnik product tour (spotlight + coach-marks). Bez zależności zewnętrznych.
// Renderowany jako portal ponad całą aplikacją; podświetla element z data-tour i pokazuje
// dymek z opisem oraz nawigacją krok-po-kroku.

const Z_BACKDROP = 100040;
const Z_HOLE = 100045;
const Z_POPOVER = 100050;
const PAD = 8; // padding wokół podświetlanego elementu

function isVisible(el) {
  const r = el.getBoundingClientRect();
  const s = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
}

// Zwróć pierwszy WIDOCZNY element pasujący do selektora (sidebar renderuje się 2×:
// desktop + drawer mobilny — bierzemy ten faktycznie widoczny).
function getVisibleTarget(selector) {
  let els;
  try { els = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  return els.find(isVisible) || null;
}

// Zapasowe wyszukanie celu po tekście lub placeholderze (moduł bez data-tour).
// Porównujemy z napisem w bieżącym języku (tr) i z polskim oryginałem.
function findByMatch(match) {
  if (!match?.selector) return null;
  let els;
  try { els = Array.from(document.querySelectorAll(match.selector)); } catch { return null; }
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const variants = (s) => Array.from(new Set([norm(tr(s)), norm(s)]));
  const wantText = match.text ? variants(match.text) : null;
  const wantPh = match.placeholder ? variants(match.placeholder) : null;
  for (const el of els) {
    if (!isVisible(el)) continue;
    if (wantText && !wantText.some((w) => norm(el.textContent).includes(w))) continue;
    if (wantPh && !wantPh.includes(norm(el.getAttribute('placeholder')))) continue;
    return el;
  }
  return null;
}

export function findTourTarget(step) {
  if (!step) return null;
  return (step.selector && getVisibleTarget(step.selector)) || (step.match && findByMatch(step.match)) || null;
}

// Trasa kroku może mieć ?tab= — porównujemy ścieżkę i wymagane parametry.
function routeMatches(location, route) {
  const [path, query] = route.split('?');
  if (location.pathname !== path) return false;
  if (!query) return true;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(location.search);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  return true;
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

const isTypingTarget = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

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
  // Kroki pominięte (brak elementu) — nie liczymy ich w „Krok n z m” (UXE-09).
  const [skipped, setSkipped] = useState(() => new Set());
  const dirRef = useRef(1); // kierunek ostatniego ruchu: +1 dalej, -1 wstecz
  const popRef = useRef(null);
  const [popSize, setPopSize] = useState({ w: 320, h: 180 });

  const active = !!activeTour && steps.length > 0;
  const step = steps[stepIndex] || null;
  const isLast = stepIndex >= steps.length - 1;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Reset przy (re)starcie tury.
  useEffect(() => {
    if (activeTour) { setStepIndex(0); setRect(null); setTargetEl(null); setSkipped(new Set()); dirRef.current = 1; }
  }, [activeTour]);

  const goNext = useCallback(() => {
    dirRef.current = 1;
    if (isLast) { finishTour(activeTour); return; }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length, isLast, finishTour, activeTour]);
  const goPrev = useCallback(() => {
    dirRef.current = -1;
    // Cofnij do najbliższego kroku, który był dostępny (pominiętych nie pokazujemy ponownie).
    setStepIndex((i) => {
      let j = i - 1;
      while (j > 0 && skipped.has(j)) j -= 1;
      return Math.max(0, j);
    });
  }, [skipped]);
  const close = useCallback(() => stopTour(), [stopTour]);

  // Lokalizuj element bieżącego kroku (z obsługą trasy, drawera mobilnego i retry).
  useEffect(() => {
    if (!active || !step) return undefined;
    let cancelled = false, tries = 0, timer;
    // Nowy krok: bez starej pozycji — inaczej dymek nowego kroku wskazywałby poprzedni element.
    setRect(null);
    setTargetEl(null);
    // Kroki procesowe czekają dłużej na element pojawiający się po akcji usera (modal, trasa);
    // opcjonalne (moduł może być wyłączony) pomijamy szybciej.
    const maxTries = step.waitMs ? Math.max(40, Math.ceil(step.waitMs / 60)) : (step.optional ? 15 : 40);

    if (step.route && !routeMatches(location, step.route)) navigate(step.route);
    if (window.innerWidth < 1024 && sidebar) {
      if (step.sidebar && !sidebar.isOpen) sidebar.toggle();
      else if (!step.sidebar && sidebar.isOpen) sidebar.close();
    }

    const locate = () => {
      if (cancelled) return;
      const el = findTourTarget(step);
      if (el) {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch { /* ignore */ }
        setTargetEl(el);
        setSkipped((prev) => { if (!prev.has(stepIndex)) return prev; const n = new Set(prev); n.delete(stepIndex); return n; });
        timer = setTimeout(() => { if (!cancelled) setRect(measure(el)); }, 140);
      } else if (tries < maxTries) {
        tries++; timer = setTimeout(locate, 60);
      } else {
        // Elementu brak (moduł wyłączony / brak dostępu) — pomiń w kierunku ruchu.
        setSkipped((prev) => new Set(prev).add(stepIndex));
        const next = stepIndex + dirRef.current;
        if (next >= 0 && next < steps.length) setStepIndex(next);
        else if (dirRef.current > 0) finishTour(activeTour);
        else { dirRef.current = 1; if (steps.length > 1) setStepIndex(1); else finishTour(activeTour); }
      }
    };
    locate();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, activeTour]);

  // Utrzymuj pozycję zgodną z układem (scroll / resize / animacje).
  useEffect(() => {
    if (!active || !targetEl) return undefined;
    const update = () => { if (document.contains(targetEl)) setRect(measure(targetEl)); };
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

  // Klawiatura: Esc = zamknij, ←/→ = nawigacja (nie podczas pisania w polu aplikacji).
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === 'ArrowRight') goNext();
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
    if (!active || !targetEl || step?.advanceOn !== 'click') return undefined;
    const onClick = () => { setTimeout(() => goNextRef.current(), 400); };
    targetEl.addEventListener('click', onClick, { capture: true, once: true });
    return () => targetEl.removeEventListener('click', onClick, { capture: true });
  }, [active, targetEl, step]);

  // Szukamy elementu kroku — nic nie pokazujemy (żadnego „fantomowego” dymka).
  if (!active || !step || !rect) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const pos = !isMobile ? placePopover(rect, step.placement, popSize, vw, vh) : null;
  // Krok interaktywny: pozwól klikać podświetlony element (nie blokuj aplikacji).
  const interactive = !!step.interactive;
  const advanceClick = step.advanceOn === 'click';

  // Numeracja tylko po dostępnych krokach.
  const visibleSteps = steps.map((_, i) => i).filter((i) => !skipped.has(i) || i === stepIndex);
  const shownIndex = visibleSteps.indexOf(stepIndex);
  const shownTotal = visibleSteps.length;

  const holeStyle = {
    position: 'fixed',
    top: rect.top - PAD, left: rect.left - PAD,
    width: rect.width + PAD * 2, height: rect.height + PAD * 2,
    borderRadius: 14,
    boxShadow: '0 0 0 3px rgb(var(--accent-primary-light) / 0.9), 0 0 0 9999px rgba(15, 23, 42, 0.6)',
    pointerEvents: 'none',
    transition: 'top .2s ease, left .2s ease, width .2s ease, height .2s ease',
    zIndex: Z_HOLE,
  };

  const popStyle = isMobile
    ? { position: 'fixed', left: 12, right: 12, bottom: 16, zIndex: Z_POPOVER }
    : { position: 'fixed', top: pos.top, left: pos.left, width: 340, maxWidth: 'calc(100vw - 24px)', zIndex: Z_POPOVER };

  return createPortal(
    <div>
      {/* Tło. Krok pasywny: blokuje kliknięcia (klik = zamknij). Krok interaktywny:
          przepuszcza kliknięcia do aplikacji, żeby user mógł wykonać akcję. Dim rysuje box-shadow „dziury". */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: Z_BACKDROP,
          background: 'transparent',
          cursor: 'default', pointerEvents: interactive ? 'none' : 'auto',
        }}
        onClick={interactive ? undefined : close}
      />
      <div style={holeStyle} />

      {/* Dymek */}
      <div
        ref={popRef}
        style={popStyle}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        className="animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5" aria-live="polite">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-primary dark:text-accent-primary-light">
              {t('Krok {n} z {total}', { n: shownIndex + 1, total: shownTotal })}
            </span>
            <button type="button" onClick={close} className="w-8 h-8 -m-1.5 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition" aria-label={t('Zamknij samouczek')}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <h3 id="tour-step-title" className="font-bold text-gray-900 dark:text-white text-base mb-1">{t(step.title)}</h3>
          <p id="tour-step-body" className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{t(step.body)}</p>

          {advanceClick && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-accent-primary dark:text-accent-primary-light">
              <MousePointerClick size={15} aria-hidden="true" /> {t('Kliknij podświetlony element, aby przejść dalej')}
            </p>
          )}

          <div className="flex items-center justify-between mt-4">
            {/* Kropki postępu (tylko dostępne kroki) */}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {visibleSteps.map((i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-5 bg-accent-primary' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {shownIndex > 0 && (
                <button type="button" onClick={goPrev} className="px-3 py-1.5 min-h-[36px] rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-1">
                  <ChevronLeft size={16} aria-hidden="true" /> {t('Wstecz')}
                </button>
              )}
              {advanceClick && !isLast ? (
                <button type="button" onClick={goNext} className="px-3 py-1.5 min-h-[36px] rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-1">
                  {t('Pomiń krok')} <ChevronRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <button type="button" onClick={goNext} className="px-4 py-1.5 min-h-[36px] rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition flex items-center gap-1">
                  {isLast ? (<>{t('Zakończ')} <Check size={16} aria-hidden="true" /></>) : (<>{t('Dalej')} <ChevronRight size={16} aria-hidden="true" /></>)}
                </button>
              )}
            </div>
          </div>

          {!isLast && (
            <button type="button" onClick={close} className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition w-full text-center">
              {t('Pomiń samouczek')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
