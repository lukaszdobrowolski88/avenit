import React from 'react';
import Spinner from './Spinner';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../contexts/PermissionsContext';

// resource: klucz capability modułu, np. 'module:members'.
export default function ProtectedRoute({ children, resource }) {
  const { can, ready } = usePermissions();

  // Poczekaj na granty (unikamy błysku dostępu/braku dostępu).
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  if (!can(resource)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
