import React from 'react';
import { Loader2 } from 'lucide-react';

// Kanoniczny przycisk aplikacji — jedno źródło prawdy zamiast 500+ kopiowanych wariantów.
// Warianty: primary (gradient marki), secondary, ghost, danger, outline. Rozmiary sm/md/lg.
//   <Button icon={Plus} onClick={...}>Dodaj</Button>
//   <Button variant="danger" loading={busy}>Usuń</Button>
const VARIANTS = {
  primary: 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md hover:shadow-lg hover:opacity-95',
  secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
  ghost: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50',
  danger: 'bg-red-500 text-white shadow-sm hover:bg-red-600',
  outline: 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
};
const SIZES = {
  sm: 'text-xs px-3 py-1.5 gap-1.5 rounded-lg',
  md: 'text-sm px-4 py-2.5 gap-2 rounded-xl',
  lg: 'text-base px-5 py-3 gap-2 rounded-xl',
};

export default function Button({ variant = 'primary', size = 'md', icon: Icon, loading = false, disabled = false, className = '', children, ...props }) {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : (Icon && <Icon size={iconSize} />)}
      {children}
    </button>
  );
}
