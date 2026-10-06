import React from 'react';

// Wspólna tabela danych — kanon z Tablic (Projekty, PR #203), zaakceptowany przez właściciela:
// styl Linear/Notion, nie Monday.
//   • kontener: zaokrąglony (rounded-2xl), cienka ramka, poziome przewijanie;
//   • nagłówki: 11 px, wersaliki, rozstrzelone, wyciszone;
//   • BEZ pionowej siatki i bez kolorowych belek wierszy — kolumny rozdziela światło, wiersz hover;
//   • status = miękka pigułka (kropka + tekst na tle koloru 22% — StatusPill);
//   • puste = puste (nie „—”); liczby/daty: tabular-nums.
// Użycie:
//   <DataTable><THead><tr><TH>Imię</TH><TH align="right">Kwota</TH></tr></THead>
//     <tbody>{rows.map(r => <TR key={r.id} onClick={...}><TD>{r.name}</TD><TD align="right" numeric>{r.amount}</TD></TR>)}</tbody>
//   </DataTable>

const alignClass = (align) => (align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left');

export function DataTable({ children, className = '', tableClassName = '', minWidth, flush = false }) {
  return (
    <div
      // flush = tabela w istniejącej karcie: bez własnej ramki i tła (przejmuje tło karty).
      className={`overflow-x-auto custom-scrollbar ${flush ? '' : 'rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'} ${className}`}
    >
      <table className={`w-full border-collapse ${tableClassName}`} style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children, sticky = false, className = '' }) {
  return (
    <thead
      // Przyklejony nagłówek musi mieć pełne tło — inaczej przewijane wiersze prześwitują.
      className={`${sticky ? 'sticky top-0 z-10 bg-gray-50 dark:bg-gray-800' : 'bg-gray-50/70 dark:bg-gray-800/40'} border-b border-gray-200 dark:border-gray-700 ${className}`}
    >
      {children}
    </thead>
  );
}

export function TH({ children, align, className = '', ...props }) {
  return (
    <th
      className={`h-10 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap ${alignClass(align)} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TR({ children, className = '', onClick, selected = false, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={`group/row border-b border-gray-100 dark:border-gray-700/60 last:border-b-0 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-700/30 ${selected ? 'bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/20' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

// Kolor tekstu z className komórki ma pierwszeństwo przed domyślnym — dwie klasy koloru naraz
// rozstrzyga kolejność w CSS Tailwinda, nie w atrybucie, więc domyślnej wtedy nie dokładamy.
const HAS_TEXT_COLOR = /(^|\s)text-(white|black|gray|slate|zinc|red|rose|orange|amber|yellow|green|emerald|teal|blue|indigo|violet|purple|pink|accent)/;
const HAS_DARK_TEXT_COLOR = /(^|\s)dark:text-(white|black|gray|slate|zinc|red|rose|orange|amber|yellow|green|emerald|teal|blue|indigo|violet|purple|pink|accent)/;

export function TD({ children, align, numeric = false, muted = false, className = '', ...props }) {
  const light = HAS_TEXT_COLOR.test(className) ? '' : muted ? 'text-gray-500' : 'text-gray-700';
  const dark = HAS_DARK_TEXT_COLOR.test(className) ? '' : muted ? 'dark:text-gray-400' : 'dark:text-gray-200';
  return (
    <td
      className={`px-3 py-2.5 text-sm align-middle ${light} ${dark} ${numeric ? 'tabular-nums' : ''} ${alignClass(align)} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

// Wiersz pustego stanu („Brak danych…”) rozpięty na całą szerokość.
export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
        {children}
      </td>
    </tr>
  );
}

// Status jako miękka pigułka: kropka + tekst na tle koloru (22% krycia). Kolor w hex.
export function StatusPill({ color = '#6b7280', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${className}`}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

// Typowe kolory statusów (zgodne z paletą Tablic).
export const STATUS_COLORS = {
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
  neutral: '#6b7280',
  accent: '#8A6606', // musztarda marki — bez „tęczy” kolorów (decyzja właściciela)
};
