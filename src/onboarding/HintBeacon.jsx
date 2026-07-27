import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '../i18n';

// Pojedyncza kontekstowa podpowiedź: pulsujący „beacon" zakotwiczony do elementu.
// Klik → mały dymek z opisem i przyciskiem „Rozumiem" (zamyka i zapamiętuje).

function findVisible(selector) {
  let els;
  try { els = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none') return el;
  }
  return null;
}

export default function HintBeacon({ hint, onDismiss }) {
  const t = useT();
  const [pos, setPos] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let raf;
    const update = () => {
      const el = findVisible(hint.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setPos({ x: r.right - 8, y: r.top + Math.min(14, r.height / 2), bottom: r.bottom, left: r.left, width: r.width });
      } else {
        setPos(null);
      }
    };
    update();
    const id = setInterval(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { clearInterval(id); cancelAnimationFrame(raf); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [hint.selector]);

  if (!pos) return null;

  const dismiss = () => { setOpen(false); onDismiss?.(hint.id); };

  return createPortal(
    <>
      {/* Pulsujący beacon */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 55, transform: 'translate(-50%, -50%)' }}
          className="w-4 h-4 flex items-center justify-center"
          aria-label={t('Podpowiedź')}
        >
          <span className="absolute inline-flex w-4 h-4 rounded-full bg-accent-primary opacity-60 animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-accent-primary ring-2 ring-white dark:ring-gray-900" />
        </button>
      )}

      {/* Dymek podpowiedzi */}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 56 }} onClick={dismiss} />
          <div
            style={{ position: 'fixed', top: Math.min(pos.bottom + 10, window.innerHeight - 12), left: Math.max(12, Math.min(pos.left, window.innerWidth - 292)), width: 280, zIndex: 57 }}
            className="animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="bg-gray-900 dark:bg-gray-700 text-white rounded-xl shadow-2xl p-3.5 border border-gray-700 dark:border-gray-600">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-semibold">{t(hint.title)}</h4>
                <button onClick={dismiss} className="p-0.5 -m-0.5 text-gray-400 hover:text-white transition"><X size={14} /></button>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{t(hint.body)}</p>
              <button onClick={dismiss} className="mt-2.5 text-xs font-semibold text-accent-primary-light hover:text-white transition">
                {t('Rozumiem')}
              </button>
            </div>
          </div>
        </>
      )}
    </>,
    document.body
  );
}
