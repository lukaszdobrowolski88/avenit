import React, { useState, useEffect } from 'react';
import {
  Shield,
  Smartphone,
  Key,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  Download,
  RefreshCw,
  X,
  QrCode
} from 'lucide-react';
import { useTwoFactor } from '../hooks/useTwoFactor';

// Komponent do generowania QR code (używa zewnętrznego API)
function QRCodeDisplay({ url, size = 200 }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;

  return (
    <div className="bg-white p-4 rounded-xl inline-block">
      <img
        src={qrUrl}
        alt="QR Code dla Google Authenticator"
        width={size}
        height={size}
        className="rounded-lg"
      />
    </div>
  );
}

export default function TwoFactorSetup({ userEmail, onClose, onEnabled, isRequired = false }) {
  const [step, setStep] = useState(1); // 1: intro, 2: scan QR, 3: verify, 4: backup codes, 5: done
  const [setupData, setSetupData] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const {
    loading,
    error,
    setupTwoFactor,
    verifyAndEnableTwoFactor
  } = useTwoFactor(userEmail);

  // Rozpocznij konfiguracje
  const handleStartSetup = async () => {
    const result = await setupTwoFactor('Church Manager');
    if (result.success) {
      setSetupData(result);
      setStep(2);
    }
  };

  // Weryfikuj kod i aktywuj
  const handleVerify = async () => {
    if (verificationCode.length !== 6) return;

    const result = await verifyAndEnableTwoFactor(verificationCode);
    if (result.success) {
      setStep(4); // Pokaż kody zapasowe
    }
  };

  // Kopiuj secret do schowka
  const copySecret = () => {
    navigator.clipboard.writeText(setupData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  // Kopiuj kody zapasowe
  const copyBackupCodes = () => {
    const codesText = setupData.backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  // Pobierz kody jako plik
  const downloadBackupCodes = () => {
    const codesText = `Kody zapasowe dla Church Manager (${userEmail})\n\nUżyj jednego z tych kodów, jeśli nie masz dostępu do aplikacji Authenticator:\n\n${setupData.backupCodes.join('\n')}\n\nUwaga: Każdy kod można użyć tylko raz.\nWygenerowano: ${new Date().toLocaleString('pl-PL')}`;
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `church-manager-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Zakończ konfigurację
  const handleFinish = () => {
    onEnabled?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white relative">
          {!isRequired && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          )}
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl">
              <Shield size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Weryfikacja dwuetapowa</h2>
              <p className="text-emerald-100 text-sm">
                {isRequired ? 'Wymagana konfiguracja' : 'Zabezpiecz swoje konto'}
              </p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-all ${
                  s === step
                    ? 'w-6 bg-white'
                    : s < step
                    ? 'bg-white'
                    : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Step 1: Intro */}
          {step === 1 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <Smartphone size={40} className="text-emerald-600 dark:text-emerald-400" />
              </div>

              {isRequired && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                    Administrator wymaga skonfigurowania weryfikacji dwuetapowej dla Twojego konta.
                    Musisz ją włączyć, aby kontynuować korzystanie z aplikacji.
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {isRequired ? 'Skonfiguruj weryfikację dwuetapową' : 'Dodaj dodatkową ochronę'}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Weryfikacja dwuetapowa dodaje dodatkową warstwę bezpieczeństwa.
                  Przy każdym logowaniu będziesz potrzebować kodu z aplikacji.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-left">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">
                  Będziesz potrzebować:
                </h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-emerald-100 dark:bg-emerald-900/30 rounded flex items-center justify-center">
                      <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    Telefon z aplikacją Authenticator
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-emerald-100 dark:bg-emerald-900/30 rounded flex items-center justify-center">
                      <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    Google Authenticator lub Microsoft Authenticator
                  </li>
                </ul>
              </div>

              <button
                onClick={handleStartSetup}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    Rozpocznij konfigurację
                    <ChevronRight size={20} />
                  </>
                )}
              </button>

              {isRequired && (
                <button
                  onClick={onClose}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition"
                >
                  Wyloguj się
                </button>
              )}
            </div>
          )}

          {/* Step 2: Scan QR Code */}
          {step === 2 && setupData && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Zeskanuj kod QR
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Otwórz aplikację Authenticator i zeskanuj poniższy kod
                </p>
              </div>

              <div className="flex justify-center">
                <QRCodeDisplay url={setupData.otpauthUrl} size={180} />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Lub wprowadź klucz ręcznie:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white break-all">
                    {setupData.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                    title="Kopiuj"
                  >
                    {copiedSecret ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
              >
                Dalej
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Step 3: Verify Code */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Wprowadź kod weryfikacyjny
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Wpisz 6-cyfrowy kod z aplikacji Authenticator
                </p>
              </div>

              <div className="flex justify-center">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-4xl font-mono tracking-[0.5em] text-center w-64 py-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-emerald-500 dark:focus:border-emerald-400 outline-none transition"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Wstecz
                </button>
                <button
                  onClick={handleVerify}
                  disabled={loading || verificationCode.length !== 6}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      Weryfikuj
                      <ChevronRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Backup Codes */}
          {step === 4 && setupData && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                  <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  2FA zostało włączone!
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Zapisz kody zapasowe na wypadek utraty dostępu do aplikacji
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-300">
                    <p className="font-semibold mb-1">Ważne!</p>
                    <p>Te kody pozwolą Ci zalogować się, jeśli stracisz dostęp do telefonu. Każdy kod można użyć tylko raz.</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Kody zapasowe
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={copyBackupCodes}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      {copiedCodes ? <Check size={14} /> : <Copy size={14} />}
                      {copiedCodes ? 'Skopiowano' : 'Kopiuj'}
                    </button>
                    <button
                      onClick={downloadBackupCodes}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      <Download size={14} />
                      Pobierz
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {setupData.backupCodes.map((code, index) => (
                    <code
                      key={index}
                      className="text-center font-mono text-sm bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white"
                    >
                      {code}
                    </code>
                  ))}
                </div>
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
              >
                Gotowe
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
