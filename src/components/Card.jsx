import React from 'react';

// Kanoniczna KARTA design-systemu — jedno źródło prawdy zamiast dziesiątek ręcznych wariantów
// (rounded-xl/2xl/3xl × shadow-sm..2xl × bg-white/50../80 „glass"). Kanon audytu:
//   rounded-2xl + border-gray-200 dark:border-gray-700 + bg-white dark:bg-gray-900 + shadow-sm + p-4
//   <Card>…</Card>              — domyślna
//   <Card as="section" p="6">…  — sekcja/modal
//   <Card interactive>…         — hover:shadow-md (klikalne kafle)
//   <Card className="p-0">…     — nadpisanie paddingu
const PADS = { 0: 'p-0', 3: 'p-3', 4: 'p-4', 5: 'p-5', 6: 'p-6' };

export default function Card({ as: Tag = 'div', p = 4, interactive = false, className = '', children, ...props }) {
  return (
    <Tag
      className={`rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm ${PADS[p] || 'p-4'} ${interactive ? 'transition-shadow hover:shadow-md' : ''} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
