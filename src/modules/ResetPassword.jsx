import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);

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

  const handleSetPassword = async e => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Hasło musi mieć minimum 6 znaków');
      return;
    }

    if (password !== confirmPassword) {
      setError('Hasła nie są identyczne');
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    if (updateError) {
      setError(updateError.message || 'Błąd ustawiania hasła');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      // Wymuś pełne przeładowanie strony, żeby wyczyścić hash z URL i sprawdzić sesję
      window.location.href = '/';
    }, 2000);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
      {/* Tło ozdobne */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-pink-400/20 dark:bg-pink-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-orange-400/20 dark:bg-orange-600/10 rounded-full blur-3xl"></div>
      </div>

      <form
        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl rounded-2xl max-w-md w-full border border-white/20 dark:border-gray-700/50 relative z-10 animate-in fade-in zoom-in duration-300"
        onSubmit={handleSetPassword}
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
          Ustaw hasło
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-center text-sm mb-8">
          Twoje konto zostało utworzone. Ustaw hasło, aby się zalogować.
        </p>

        {success ? (
          <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-center">
            <p className="font-bold mb-1">Hasło zostało ustawione!</p>
            <p className="text-sm">Za chwilę zostaniesz przekierowany...</p>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">Nowe hasło</label>
              <input
                type="password"
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="Minimum 6 znaków"
              />
            </div>

            <div className="mb-6">
              <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">Powtórz hasło</label>
              <input
                type="password"
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-700 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-pink-500/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Zapisywanie...
                </span>
              ) : 'Ustaw hasło'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
