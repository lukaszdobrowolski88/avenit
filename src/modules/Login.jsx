import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTwoFactor } from '../hooks/useTwoFactor';
import { Shield, ArrowLeft } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Stan dla 2FA
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const { verifyLoginCode, checkTwoFactorStatus, loading: verifyLoading } = useTwoFactor();

  // Pobierz logo organizacji przy starcie
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'org_logo_url')
          .single();

        if (data?.value) {
          setLogoUrl(data.value);
        }
      } catch (err) {
        console.error("Błąd pobierania logo:", err);
      }
    };
    fetchLogo();
  }, []);

  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Równoległe: sprawdź 2FA i weryfikuj hasło jednocześnie (szybsze logowanie)
      const [twoFactorStatus, authResponse] = await Promise.all([
        checkTwoFactorStatus(email),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email, password })
        })
      ]);

      // Sprawdź czy hasło jest poprawne
      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        setError(errorData.error_description || errorData.msg || 'Błędny e-mail lub hasło.');
        setLoading(false);
        return;
      }

      if (twoFactorStatus.enabled) {
        // Hasło poprawne + 2FA włączone - NIE ustawiamy sesji, tylko przechodzimy do weryfikacji 2FA
        setPendingEmail(email);
        setRequires2FA(true);
        setLoading(false);
      } else {
        // Hasło poprawne + brak 2FA - ustaw sesję z tokenami z odpowiedzi
        const authData = await authResponse.json();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: authData.access_token,
          refresh_token: authData.refresh_token
        });

        if (sessionError) {
          setError(sessionError.message || 'Błąd ustawiania sesji.');
          setLoading(false);
        }
        // Sukces - App.jsx wykryje sesję
      }
    } catch (err) {
      setError('Wystąpił błąd podczas logowania');
      setLoading(false);
    }
  };

  const handleVerify2FA = async e => {
    e.preventDefault();
    if (totpCode.length < 6) {
      setError('Wprowadź 6-cyfrowy kod');
      return;
    }

    setLoading(true);
    setError('');

    const result = await verifyLoginCode(pendingEmail, totpCode);

    if (result.success) {
      // Kod poprawny - zaloguj ponownie
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: pendingEmail,
        password
      });

      if (authError) {
        setError('Błąd logowania. Spróbuj ponownie.');
        setLoading(false);
        return;
      }
      // Sukces - sesja zostanie wykryta przez App.jsx
    } else {
      setError(result.error || 'Nieprawidłowy kod weryfikacyjny');
      setLoading(false);
    }
  };

  const handleBack2FA = () => {
    setRequires2FA(false);
    setTotpCode('');
    setPendingEmail('');
    setPassword('');
    setError('');
  };

  const handleForgotPassword = async e => {
    e.preventDefault();
    if (!email) {
      setError('Wprowadź adres e-mail');
      return;
    }
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message || 'Błąd wysyłania emaila');
    } else {
      setResetEmailSent(true);
    }
  };

  // Ekran weryfikacji 2FA
  if (requires2FA) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
        {/* Tło ozdobne */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-400/20 dark:bg-emerald-600/10 rounded-full blur-3xl"></div>
          <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-teal-400/20 dark:bg-teal-600/10 rounded-full blur-3xl"></div>
        </div>

        <form
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl rounded-2xl max-w-md w-full border border-white/20 dark:border-gray-700/50 relative z-10 animate-in fade-in zoom-in duration-300"
          onSubmit={handleVerify2FA}
        >
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Shield size={32} />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2 text-center">
            Weryfikacja dwuetapowa
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-center text-sm mb-8">
            Wprowadź kod z aplikacji Authenticator
          </p>

          <div className="mb-6">
            <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">
              Kod weryfikacyjny
            </label>
            <input
              type="text"
              className="w-full px-4 py-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-center text-2xl font-mono tracking-[0.3em]"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              required
              autoFocus
              placeholder="000000"
              maxLength={8}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
              Możesz też użyć kodu zapasowego (8 znaków)
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={loading || verifyLoading}
          >
            {loading || verifyLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Weryfikacja...
              </span>
            ) : 'Weryfikuj'}
          </button>

          <button
            type="button"
            onClick={handleBack2FA}
            className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            Powrót do logowania
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
      {/* Tło ozdobne */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-pink-400/20 dark:bg-pink-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-orange-400/20 dark:bg-orange-600/10 rounded-full blur-3xl"></div>
      </div>

      <form
        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl rounded-2xl max-w-md w-full border border-white/20 dark:border-gray-700/50 relative z-10 animate-in fade-in zoom-in duration-300"
        onSubmit={handleLogin}
      >
        <div className="flex justify-center mb-6">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo organizacji"
              className="max-h-24 object-contain"
            />
          ) : (
            <div className="h-16 w-16 bg-gradient-to-br from-pink-600 to-orange-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
              S
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2 text-center">
          {showForgotPassword ? 'Resetuj hasło' : 'Witaj ponownie'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-center text-sm mb-8">
          {showForgotPassword
            ? 'Podaj adres e-mail, a wyślemy Ci link do zresetowania hasła'
            : 'Zaloguj się do Church Manager'}
        </p>

        <div className="mb-5">
          <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">E-mail</label>
          <input
            type="email"
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="jan@example.com"
          />
        </div>

        {!showForgotPassword && (
          <div className="mb-6">
            <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">Hasło</label>
            <input
              type="password"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {!showForgotPassword ? (
          <>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-700 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-pink-500/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Logowanie...
                </span>
              ) : 'Zaloguj się'}
            </button>

            <button
              type="button"
              onClick={() => { setShowForgotPassword(true); setError(''); setResetEmailSent(false); }}
              className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 transition"
            >
              Nie pamiętam hasła
            </button>
          </>
        ) : (
          <>
            {resetEmailSent ? (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-center">
                <p className="font-bold mb-1">Email został wysłany!</p>
                <p className="text-sm">Sprawdź swoją skrzynkę i kliknij link, aby zresetować hasło.</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-700 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-pink-500/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Wysyłanie...
                  </span>
                ) : 'Wyślij link do resetu hasła'}
              </button>
            )}

            <button
              type="button"
              onClick={() => { setShowForgotPassword(false); setError(''); setResetEmailSent(false); }}
              className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 transition"
            >
              ← Powrót do logowania
            </button>
          </>
        )}
      </form>
    </div>
  );
}
