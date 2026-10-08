import React from 'react';
import { usePermissions } from '../contexts/PermissionsContext';
import { boardModuleKey, isModuleScopedTable } from '@avenit/shared/src/permissions/moduleScope.js';

const RES_CAP = /^res:([a-z0-9_]+):(read|create|update|delete)$/;

// Hook: czy bieżący użytkownik ma dane uprawnienie (capability).
// scope (opcjonalnie) — dane konkretnej służby we wspólnej tabeli (events, grafik, board_*):
//   useCan('res:events:create', { module: 'media' })   — wydarzenia kalendarza Mediów
//   useCan('res:board_columns:create', { board })       — tablica (moduł z board.module_key/source_kind)
// Wtedy wystarcza prawo globalne ALBO prawo w zakresie tej służby (jak na serwerze — moduleScope.js).
export function useCan(capability, scope) {
  const { can, canModule } = usePermissions();
  const m = scope && RES_CAP.exec(capability);
  if (m && isModuleScopedTable(m[1])) {
    const moduleKey = scope.board !== undefined ? boardModuleKey(scope.board) : scope.module;
    return canModule(moduleKey || null, m[1], m[2]);
  }
  return can(capability);
}

// Hook: reguła „globalnie albo w zakresie służby” jako funkcja (moduleKey, table, op).
export function useModuleCan() {
  const { canModule } = usePermissions();
  return canModule;
}

// Hook: dostęp do zakładki modułu — zwraca funkcję hasTabAccess(mod, tab)
// (zgodna sygnaturowo ze starym hasTabAccess bez argumentu roli).
export function useTabAccess() {
  const { can } = usePermissions();
  return (mod, tab) => can(`tab:${mod}:${tab}`);
}

// Bramka uprawnień. Przykłady:
//   <Can cap="res:members:create"><button>Dodaj</button></Can>       — ukrywa gdy brak
//   <Can cap="res:members:update" mode="disable"><button/></Can>     — wyszarza gdy brak
//   <Can cap="action:mail:send" fallback={<Info/>}>…</Can>           — pokazuje fallback
export default function Can({ cap, mode = 'hide', fallback = null, children }) {
  const { can } = usePermissions();
  if (can(cap)) return children;
  if (mode === 'disable' && React.isValidElement(children)) {
    return React.cloneElement(children, { disabled: true });
  }
  return fallback;
}
