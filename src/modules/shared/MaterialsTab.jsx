import React from 'react';
import MaterialsModule from '../Materials/MaterialsModule';

/**
 * MaterialsTab - Zakładka materiałów dla modułów służb
 *
 * Używana jako component_type='materials' w zakładkach modułów.
 * Renderuje pełny moduł materiałów z filtrowaniem po ministry_key.
 */
export default function MaterialsTab({ moduleKey, canEdit = false }) {
  return (
    <div className="h-full">
      <MaterialsModule
        ministryKey={moduleKey}
        canEdit={canEdit}
      />
    </div>
  );
}
