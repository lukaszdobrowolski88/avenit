import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '../hooks/useUserRole';
import { usePermissions } from '../contexts/PermissionsContext';

export default function ProtectedRoute({ children, resource }) {
  const { userRole, loading: roleLoading } = useUserRole();
  const { permissions, loading: permissionsLoading } = usePermissions();

  // Pokaż loader podczas ładowania
  if (roleLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  // Superadmin ma dostęp do wszystkiego
  if (userRole === 'superadmin') {
    return children;
  }

  // Rada starszych zawsze ma dostęp do ustawień
  if (userRole === 'rada_starszych' && resource === 'module:settings') {
    return children;
  }

  // Sprawdź uprawnienia
  const perm = permissions.find(p => p.role === userRole && p.resource === resource);
  const hasAccess = perm?.can_read === true;

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return children;
}
