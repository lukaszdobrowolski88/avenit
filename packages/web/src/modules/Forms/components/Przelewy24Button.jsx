import { useState } from 'react';
import { Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export default function Przelewy24Button({
  merchantId,
  crcKey,
  apiKey,
  amount,
  currency = 'PLN',
  description = 'Płatność za formularz',
  sandbox = true,
  formId,
  sessionId,
  email,
  onSuccess,
  onError,
  disabled = false
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentUrl, setPaymentUrl] = useState(null);
  const [transactionRegistered, setTransactionRegistered] = useState(false);

  // Przelewy24 wymaga kwoty w groszach
  const amountInGrosze = Math.round(amount * 100);

  // Generuj unikalny session ID jeśli nie podano
  const generateSessionId = () => {
    return `${formId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const currentSessionId = sessionId || generateSessionId();

  // URL zwrotny po płatności
  const returnUrl = `${window.location.origin}/form/${formId}?payment=success&session=${currentSessionId}`;
  const statusUrl = `${window.location.origin}/api/przelewy24/status`;

  // Rejestracja transakcji w Przelewy24
  const registerTransaction = async () => {
    if (!merchantId || !crcKey) {
      setError('Brak konfiguracji Przelewy24. Skontaktuj się z administratorem.');
      return;
    }

    if (!email) {
      setError('Podaj adres email przed dokonaniem płatności.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Wywołaj edge function do rejestracji transakcji
      const { data, error: fnError } = await supabase.functions.invoke('przelewy24-register', {
        body: {
          merchantId,
          crcKey,
          apiKey,
          amount: amountInGrosze,
          currency,
          description,
          email,
          sessionId: currentSessionId,
          urlReturn: returnUrl,
          urlStatus: statusUrl,
          sandbox
        }
      });

      if (fnError) throw fnError;

      if (data.error) {
        throw new Error(data.error);
      }

      // Ustaw URL do przekierowania
      const p24Url = sandbox
        ? `https://sandbox.przelewy24.pl/trnRequest/${data.token}`
        : `https://secure.przelewy24.pl/trnRequest/${data.token}`;

      setPaymentUrl(p24Url);
      setTransactionRegistered(true);

    } catch (err) {
      console.error('Przelewy24 registration error:', err);
      setError(err.message || 'Błąd podczas rejestracji płatności.');
      if (onError) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Przekieruj do Przelewy24
  const redirectToPayment = () => {
    if (paymentUrl) {
      // Zapisz session ID w localStorage do weryfikacji po powrocie
      localStorage.setItem(`p24_session_${formId}`, JSON.stringify({
        sessionId: currentSessionId,
        amount,
        currency,
        timestamp: Date.now()
      }));

      window.location.href = paymentUrl;
    }
  };

  if (!merchantId) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">
            Przelewy24 nie jest skonfigurowany. Skontaktuj się z administratorem.
          </span>
        </div>
      </div>
    );
  }

  if (disabled) {
    return null;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
        <button
          onClick={() => {
            setError(null);
            setTransactionRegistered(false);
            setPaymentUrl(null);
          }}
          className="w-full py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span className="text-sm font-medium text-red-700 dark:text-red-400">
            Przelewy24
          </span>
        </div>
        <span className="text-lg font-bold text-red-700 dark:text-red-400">
          {new Intl.NumberFormat('pl-PL', {
            style: 'currency',
            currency: currency
          }).format(amount)}
        </span>
      </div>

      {!transactionRegistered ? (
        <button
          onClick={registerTransaction}
          disabled={loading || !email}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium rounded-xl
            hover:from-red-600 hover:to-red-700 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Przygotowuję płatność...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
              Zapłać przez Przelewy24
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check size={18} />
              <span className="text-sm font-medium">
                Transakcja zarejestrowana! Kliknij poniżej, aby przejść do płatności.
              </span>
            </div>
          </div>

          <button
            onClick={redirectToPayment}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium rounded-xl
              hover:from-red-600 hover:to-red-700 transition-all"
          >
            <ExternalLink size={18} />
            Przejdź do płatności Przelewy24
          </button>

          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Zostaniesz przekierowany na stronę Przelewy24
          </p>
        </div>
      )}

      {sandbox && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Tryb testowy - płatności nie będą prawdziwe
        </p>
      )}

      {!email && (
        <p className="text-xs text-center text-yellow-600 dark:text-yellow-400">
          Wypełnij pole email w formularzu, aby móc dokonać płatności.
        </p>
      )}
    </div>
  );
}
