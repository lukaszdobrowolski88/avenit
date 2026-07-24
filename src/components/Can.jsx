import React from 'react';
import { usePermissions } from '../contexts/PermissionsContext';

// Hook: czy bieżący użytkownik ma dane uprawnienie (capability).
export function useCan(capability) {
  const { can } = usePermissions();
  return can(capability);
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
