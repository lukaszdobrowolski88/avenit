import React, { createContext, useContext, useState, useCallback } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { tr } from '../i18n';
import Modal from '../components/Modal';
import Button from '../components/Button';

// Kontekst do śledzenia niezapisanych zmian w całej aplikacji
const UnsavedChangesContext = createContext({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  checkBeforeNavigate: () => true,
  showWarningModal: false,
  setShowWarningModal: () => {},
  onSaveCallback: null,
  setOnSaveCallback: () => {},
  pendingNavigation: null,
  setPendingNavigation: () => {},
});

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

// Modal ostrzeżenia o niezapisanych zmianach
const UnsavedChangesWarningModal = ({ isOpen, onClose, onSave, onDiscard }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    closeOnBackdrop={false}
    zIndex={9999}
    size="sm"
    icon={AlertTriangle}
    title={tr('Niezapisane zmiany')}
    footer={<>
      <Button variant="secondary" onClick={onDiscard}>{tr('Opuść bez zapisu')}</Button>
      <Button icon={Save} onClick={onSave}>{tr('Zapisz')}</Button>
    </>}
  >
    <div className="p-6">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {tr('Masz niezapisane zmiany. Co chcesz zrobić?')}
      </p>
    </div>
  </Modal>
);

export function UnsavedChangesProvider({ children }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [onSaveCallback, setOnSaveCallback] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // Funkcja sprawdzająca przed nawigacją
  const checkBeforeNavigate = useCallback((navigationCallback) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => navigationCallback);
      setShowWarningModal(true);
      return false;
    }
    return true;
  }, [hasUnsavedChanges]);

  // Obsługa zapisu i nawigacji
  const handleSaveAndNavigate = async () => {
    if (onSaveCallback) {
      // Nieudany zapis (callback zwraca false) — zostajemy na stronie, zmiany nie przepadają.
      if ((await onSaveCallback()) === false) return;
    }
    setShowWarningModal(false);
    setHasUnsavedChanges(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  // Obsługa odrzucenia zmian i nawigacji
  const handleDiscardAndNavigate = () => {
    setShowWarningModal(false);
    setHasUnsavedChanges(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const value = {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    checkBeforeNavigate,
    showWarningModal,
    setShowWarningModal,
    onSaveCallback,
    setOnSaveCallback,
    pendingNavigation,
    setPendingNavigation,
  };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <UnsavedChangesWarningModal
        isOpen={showWarningModal}
        onClose={() => setShowWarningModal(false)}
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscardAndNavigate}
      />
    </UnsavedChangesContext.Provider>
  );
}
