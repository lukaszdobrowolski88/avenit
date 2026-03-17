import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Settings, User, Server, Filter, FileText, Plus,
  Trash2, Edit2, Check, AlertCircle, Loader2, Eye, EyeOff, Star, RefreshCw
} from 'lucide-react';

const TABS = [
  { id: 'accounts', label: 'Konta zewnętrzne', icon: Server },
  { id: 'filters', label: 'Filtry', icon: Filter }
];

export default function MailSettingsModal({
  isOpen,
  onClose,
  accounts,
  onCreateExternalAccount,
  onUpdateAccount,
  onDeleteAccount,
  onTestConnection,
  onSetSystemDefault,
  onSyncMail
}) {
  const [activeTab, setActiveTab] = useState('accounts');
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [syncingAccount, setSyncingAccount] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  // External account form (create/edit)
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountForm, setAccountForm] = useState({
    external_email: '',
    imap_host: '',
    imap_port: 993,
    smtp_host: '',
    smtp_port: 465,
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  // Filters
  const [filters, setFilters] = useState([]);

  // Reset form
  const resetForm = () => {
    setAccountForm({
      external_email: '',
      imap_host: '',
      imap_port: 993,
      smtp_host: '',
      smtp_port: 465,
      password: ''
    });
    setEditingAccountId(null);
    setShowAccountForm(false);
    setShowPassword(false);
  };

  // Start editing account
  const handleEditAccount = (account) => {
    setAccountForm({
      external_email: account.external_email || '',
      imap_host: account.imap_host || '',
      imap_port: account.imap_port || 993,
      smtp_host: account.smtp_host || '',
      smtp_port: account.smtp_port || 465,
      password: '' // Don't pre-fill password for security
    });
    setEditingAccountId(account.id);
    setShowAccountForm(true);
  };

  // Create or update external account
  const handleSaveAccount = async () => {
    setSaving(true);
    try {
      if (editingAccountId) {
        // Update existing account
        await onUpdateAccount(editingAccountId, accountForm);
      } else {
        // Create new account
        await onCreateExternalAccount(accountForm);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  // Test connection
  const handleTestConnection = async (account) => {
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      const result = await onTestConnection(account.id);
      setConnectionStatus({ accountId: account.id, success: result?.success, message: result?.message });
    } catch (err) {
      setConnectionStatus({ accountId: account.id, success: false, message: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  // Sync mail from IMAP
  const handleSyncMail = async (account) => {
    if (!onSyncMail) return;

    setSyncingAccount(account.id);
    setSyncStatus(null);
    try {
      const result = await onSyncMail(account.id);
      setSyncStatus({
        accountId: account.id,
        success: result?.success,
        message: result?.message || (result?.success ? `Pobrano ${result?.saved || 0} nowych wiadomości` : 'Błąd synchronizacji')
      });
    } catch (err) {
      setSyncStatus({ accountId: account.id, success: false, message: err.message });
    } finally {
      setSyncingAccount(null);
    }
  };

  // Auto-fill common providers
  const handleEmailChange = (email) => {
    setAccountForm(prev => ({ ...prev, external_email: email }));

    // Auto-fill based on domain
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain === 'gmail.com') {
      setAccountForm(prev => ({
        ...prev,
        imap_host: 'imap.gmail.com',
        imap_port: 993,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 465
      }));
    } else if (domain === 'outlook.com' || domain === 'hotmail.com') {
      setAccountForm(prev => ({
        ...prev,
        imap_host: 'outlook.office365.com',
        imap_port: 993,
        smtp_host: 'smtp.office365.com',
        smtp_port: 587
      }));
    } else if (domain === 'yahoo.com') {
      setAccountForm(prev => ({
        ...prev,
        imap_host: 'imap.mail.yahoo.com',
        imap_port: 993,
        smtp_host: 'smtp.mail.yahoo.com',
        smtp_port: 465
      }));
    }
  };

  if (!isOpen) return null;

  const externalAccounts = accounts.filter(a => a.account_type === 'external');

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-xl">
              <Settings size={20} className="text-pink-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
              Ustawienia poczty
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${activeTab === tab.id
                    ? 'border-pink-500 text-pink-500'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }
                `}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          {/* External Accounts Tab */}
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">Informacja o kontach zewnętrznych</p>
                    <p>
                      Możesz połączyć zewnętrzne konta email (Gmail, Outlook, inne) aby odbierać
                      i wysyłać wiadomości bezpośrednio z tej aplikacji. Wymaga to podania
                      danych IMAP/SMTP twojego dostawcy poczty.
                    </p>
                    <p className="mt-2 flex items-center gap-1">
                      <Star size={14} className="text-amber-500" />
                      <span>
                        Konto oznaczone jako <strong>systemowe</strong> będzie używane do wysyłania
                        wiadomości z kont wewnętrznych do odbiorców zewnętrznych.
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Existing accounts */}
              {externalAccounts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Połączone konta
                  </h3>
                  {externalAccounts.map(account => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold">
                          {account.external_email?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white">
                            {account.external_email}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {account.imap_host}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.system_default && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full">
                            <Star size={12} className="fill-current" />
                            Systemowe
                          </span>
                        )}
                        {connectionStatus?.accountId === account.id && (
                          <span className={`text-xs ${connectionStatus.success ? 'text-green-500' : 'text-red-500'}`}>
                            {connectionStatus.success ? 'Połączono' : 'Błąd połączenia'}
                          </span>
                        )}
                        {!account.system_default && (
                          <button
                            onClick={() => onSetSystemDefault(account.id)}
                            title="Ustaw jako konto systemowe"
                            className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                          >
                            <Star size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleEditAccount(account)}
                          title="Edytuj ustawienia"
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleSyncMail(account)}
                          disabled={syncingAccount === account.id}
                          title="Synchronizuj pocztę"
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {syncingAccount === account.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          {syncingAccount === account.id ? 'Synchronizuję...' : 'Synchronizuj'}
                        </button>
                        <button
                          onClick={() => handleTestConnection(account)}
                          disabled={testingConnection}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          {testingConnection && connectionStatus?.accountId === account.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            'Testuj'
                          )}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Czy na pewno usunąć to konto?')) {
                              onDeleteAccount(account.id);
                            }
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {/* Sync status message */}
                      {syncStatus?.accountId === account.id && (
                        <div className={`mt-2 text-xs ${syncStatus.success ? 'text-green-600' : 'text-red-500'}`}>
                          {syncStatus.message}
                        </div>
                      )}
                      {/* Connection status message */}
                      {connectionStatus?.accountId === account.id && (
                        <div className={`mt-2 text-xs ${connectionStatus.success ? 'text-green-600' : 'text-red-500'}`}>
                          {connectionStatus.message || (connectionStatus.success ? 'Połączenie OK' : 'Błąd połączenia')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add/Edit account form */}
              {showAccountForm ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-4">
                  <h3 className="font-medium text-gray-800 dark:text-white">
                    {editingAccountId ? 'Edytuj konto' : 'Dodaj konto zewnętrzne'}
                  </h3>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Adres email
                    </label>
                    <input
                      type="email"
                      value={accountForm.external_email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      placeholder="twoj.email@gmail.com"
                      disabled={!!editingAccountId}
                      className={`w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-pink-500 ${editingAccountId ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                    {editingAccountId && (
                      <p className="text-xs text-gray-500 mt-1">
                        Adres email nie może być zmieniony
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Serwer IMAP
                      </label>
                      <input
                        type="text"
                        value={accountForm.imap_host}
                        onChange={(e) => setAccountForm(prev => ({ ...prev, imap_host: e.target.value }))}
                        placeholder="imap.gmail.com"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Port IMAP
                      </label>
                      <input
                        type="number"
                        value={accountForm.imap_port}
                        onChange={(e) => setAccountForm(prev => ({ ...prev, imap_port: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Serwer SMTP
                      </label>
                      <input
                        type="text"
                        value={accountForm.smtp_host}
                        onChange={(e) => setAccountForm(prev => ({ ...prev, smtp_host: e.target.value }))}
                        placeholder="smtp.gmail.com"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Port SMTP
                      </label>
                      <input
                        type="number"
                        value={accountForm.smtp_port}
                        onChange={(e) => setAccountForm(prev => ({ ...prev, smtp_port: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {editingAccountId ? 'Nowe hasło (pozostaw puste aby nie zmieniać)' : 'Hasło aplikacji'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={accountForm.password}
                        onChange={(e) => setAccountForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder={editingAccountId ? 'Wpisz nowe hasło lub pozostaw puste' : 'Hasło lub hasło aplikacji'}
                        className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-pink-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {editingAccountId
                        ? 'Hasło jest wymagane tylko jeśli chcesz je zmienić'
                        : 'Dla Gmail użyj "hasła aplikacji" z ustawień konta Google'
                      }
                    </p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Anuluj
                    </button>
                    <button
                      onClick={handleSaveAccount}
                      disabled={saving || !accountForm.external_email || !accountForm.imap_host || (!editingAccountId && !accountForm.password)}
                      className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {saving ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : editingAccountId ? (
                        <Check size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      {editingAccountId ? 'Zapisz zmiany' : 'Dodaj konto'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAccountForm(true)}
                  className="flex items-center gap-2 px-4 py-3 w-full border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-500 hover:text-pink-500 rounded-xl transition-colors"
                >
                  <Plus size={18} />
                  Dodaj konto zewnętrzne
                </button>
              )}
            </div>
          )}

          {/* Filters Tab */}
          {activeTab === 'filters' && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Reguły filtrowania pozwalają automatycznie sortować przychodzące wiadomości
                  do odpowiednich folderów na podstawie nadawcy, tematu lub treści.
                </p>
              </div>

              {filters.length === 0 ? (
                <div className="text-center py-8">
                  <Filter size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Brak skonfigurowanych filtrów
                  </p>
                  <button className="flex items-center gap-2 mx-auto px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg transition-colors">
                    <Plus size={16} />
                    Utwórz filtr
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Filter list would go here */}
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Zaawansowane filtry będą dostępne wkrótce
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
