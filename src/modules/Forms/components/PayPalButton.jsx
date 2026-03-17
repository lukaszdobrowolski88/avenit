import { useEffect, useRef, useState } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';

export default function PayPalButton({
  clientId,
  amount,
  currency = 'PLN',
  description = 'Płatność za formularz',
  sandbox = true,
  onSuccess,
  onError,
  onCancel,
  disabled = false
}) {
  const paypalRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null); // 'success' | 'cancelled' | 'error' | null

  useEffect(() => {
    if (!clientId || disabled) {
      setLoading(false);
      return;
    }

    // Usuń poprzedni skrypt PayPal jeśli istnieje
    const existingScript = document.querySelector('script[src*="paypal.com/sdk"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Załaduj PayPal SDK
    const script = document.createElement('script');
    const paypalUrl = sandbox
      ? 'https://www.sandbox.paypal.com/sdk/js'
      : 'https://www.paypal.com/sdk/js';

    // Mapowanie walut na kody PayPal
    const currencyMap = {
      'PLN': 'PLN',
      'EUR': 'EUR',
      'USD': 'USD'
    };

    script.src = `${paypalUrl}?client-id=${clientId}&currency=${currencyMap[currency] || 'PLN'}&intent=capture`;
    script.async = true;

    script.onload = () => {
      if (window.paypal && paypalRef.current) {
        setLoading(false);
        renderPayPalButtons();
      }
    };

    script.onerror = () => {
      setLoading(false);
      setError('Nie udało się załadować PayPal. Sprawdź połączenie z internetem.');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup
      const scriptToRemove = document.querySelector('script[src*="paypal.com/sdk"]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [clientId, currency, sandbox, disabled]);

  useEffect(() => {
    if (window.paypal && paypalRef.current && !loading) {
      renderPayPalButtons();
    }
  }, [amount]);

  const renderPayPalButtons = () => {
    if (!window.paypal || !paypalRef.current) return;

    // Wyczyść kontener
    paypalRef.current.innerHTML = '';

    window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'pay',
        height: 45
      },

      createOrder: (data, actions) => {
        return actions.order.create({
          purchase_units: [{
            description: description,
            amount: {
              currency_code: currency,
              value: amount.toFixed(2)
            }
          }]
        });
      },

      onApprove: async (data, actions) => {
        try {
          const details = await actions.order.capture();
          setPaymentStatus('success');

          if (onSuccess) {
            onSuccess({
              orderId: data.orderID,
              payerId: data.payerID,
              paymentId: details.id,
              status: details.status,
              payer: {
                email: details.payer?.email_address,
                name: `${details.payer?.name?.given_name || ''} ${details.payer?.name?.surname || ''}`.trim()
              },
              amount: amount,
              currency: currency,
              capturedAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error('PayPal capture error:', err);
          setPaymentStatus('error');
          setError('Błąd podczas przetwarzania płatności.');
          if (onError) {
            onError(err);
          }
        }
      },

      onCancel: (data) => {
        setPaymentStatus('cancelled');
        if (onCancel) {
          onCancel(data);
        }
      },

      onError: (err) => {
        console.error('PayPal error:', err);
        setPaymentStatus('error');
        setError('Wystąpił błąd podczas płatności.');
        if (onError) {
          onError(err);
        }
      }
    }).render(paypalRef.current);
  };

  if (!clientId) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">
            PayPal nie jest skonfigurowany. Skontaktuj się z administratorem.
          </span>
        </div>
      </div>
    );
  }

  if (disabled) {
    return null;
  }

  if (paymentStatus === 'success') {
    return (
      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
            <Check size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-medium text-green-700 dark:text-green-400">
              Płatność zakończona pomyślnie!
            </p>
            <p className="text-sm text-green-600 dark:text-green-500">
              Twoja płatność została zrealizowana przez PayPal.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (paymentStatus === 'cancelled') {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Płatność została anulowana. Możesz spróbować ponownie.
          </p>
        </div>
        <button
          onClick={() => {
            setPaymentStatus(null);
            setError(null);
            setTimeout(renderPayPalButtons, 100);
          }}
          className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
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
            setPaymentStatus(null);
            setError(null);
            setLoading(true);
            // Przeładuj skrypt
            const existingScript = document.querySelector('script[src*="paypal.com/sdk"]');
            if (existingScript) {
              existingScript.remove();
            }
            window.location.reload();
          }}
          className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Odśwież i spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c1.582 3.185-.072 5.065-3.51 5.065h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106H7.076a.641.641 0 0 1-.633-.74l.142-.9h1.538c.524 0 .968-.382 1.05-.901l1.05-6.66h2.475c4.298 0 7.664-1.747 8.648-6.797.03-.149.054-.294.077-.437-.144-.095-.296-.187-.457-.275l.256.18z"/>
          </svg>
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
            Płatność PayPal
          </span>
        </div>
        <span className="text-lg font-bold text-blue-700 dark:text-blue-400">
          {new Intl.NumberFormat('pl-PL', {
            style: 'currency',
            currency: currency
          }).format(amount)}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">Ładowanie PayPal...</span>
        </div>
      ) : (
        <div ref={paypalRef} className="paypal-button-container" />
      )}

      {sandbox && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Tryb testowy - płatności nie będą prawdziwe
        </p>
      )}
    </div>
  );
}
