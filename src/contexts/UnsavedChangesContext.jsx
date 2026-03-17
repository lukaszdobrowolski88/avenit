import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Save, AlertTriangle } from 'lucide-react';

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
const UnsavedChangesWarningModal = ({ isOpen, onClose, onSave, onDiscard }) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-white/20 dark:border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Niezapisane zmiany</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Masz niezapisane zmiany. Co chcesz zrobić?
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Opuść bez zapisu
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-pink-500/30 transition flex items-center justify-center gap-2"
          >
            <Save size={16} /> Zapisz
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

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
      await onSaveCallback();
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
