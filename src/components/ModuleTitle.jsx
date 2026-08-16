import React from 'react';
import { useModuleLabel } from '../hooks/useModuleLabel';

// Tytuł modułu (h1) z DYNAMICZNĄ nazwą z bazy (app_modules.label) — dla modułów,
// które mają własny nagłówek inline zamiast <PageHeader>. `fallback` = twarda nazwa.
export default function ModuleTitle({ moduleKey, fallback, className = '' }) {
  const label = useModuleLabel(moduleKey, fallback);
  return <h1 className={className}>{label}</h1>;
}
