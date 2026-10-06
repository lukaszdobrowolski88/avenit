import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Kanoniczny przycisk aplikacji — jedno źródło prawdy zamiast 500+ kopiowanych wariantów.
// Warianty: primary (gradient marki), secondary, ghost, danger, outline. Rozmiary sm/md/lg.
//   <Button icon={Plus} onClick={...}>Dodaj</Button>
//   <Button variant="danger" loading={busy}>Usuń</Button>
// Blokada podwójnego zapisu: gdy onClick zwraca Promise (np. async handler zapisu), przycisk sam
// blokuje się (spinner, aria-busy) do jego rozstrzygnięcia — kolejne kliknięcia są ignorowane.
// Jawnie podany `loading` ma pierwszeństwo (wtedy steruje wywołujący).
const VARIANTS = {
  primary: 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md hover:shadow-lg hover:opacity-95',
  secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
  ghost: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50',
  // red-600: biel na red-500 miała 3,76:1 (poniżej 4,5:1), na red-600 = 4,83:1.
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  outline: 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
};
const SIZES = {
  sm: 'text-xs px-3 py-1.5 gap-1.5 rounded-lg',
  md: 'text-sm px-4 py-2.5 gap-2 rounded-xl',
  lg: 'text-base px-5 py-3 gap-2 rounded-xl',
};

const isThenable = (v) => v != null && typeof v.then === 'function';

export default function Button({ variant = 'primary', size = 'md', icon: Icon, loading, disabled = false, className = '', children, onClick, ...props }) {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  const [autoBusy, setAutoBusy] = useState(false);
  // Ref obok stanu: dwa kliknięcia w tej samej klatce (zanim React przerysuje) też blokujemy.
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const controlled = loading !== undefined && loading !== null;
  const busy = controlled ? Boolean(loading) : autoBusy;

  const handleClick = onClick ? (e) => {
    if (busyRef.current || (controlled && loading)) { e.preventDefault(); return undefined; }
    const result = onClick(e);
    if (!controlled && isThenable(result)) {
      busyRef.current = true;
      setAutoBusy(true);
      const release = () => {
        busyRef.current = false;
        if (mounted.current) setAutoBusy(false);
      };
      // Błąd obsługuje wywołujący (albo globalny nasłuch błędów zapisu) — tu tylko zdejmujemy blokadę.
      Promise.resolve(result).then(release, release);
    }
    return result;
  } : undefined;

  return (
    <button
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {busy ? <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" /> : (Icon && <Icon size={iconSize} aria-hidden="true" />)}
      {children}
    </button>
  );
}
