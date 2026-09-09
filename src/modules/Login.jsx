import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTwoFactor } from '../hooks/useTwoFactor';
import { Shield, ArrowLeft } from 'lucide-react';
import { tr, useT } from '../i18n';
import { LOGIN_BG_OPTIONS } from '../lib/appearance';

export default function Login() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem('app_logo_cache') || null);
  const [loginBg, setLoginBg] = useState(null);
  const [loginBgUrl, setLoginBgUrl] = useState(null);
  const [loginTitle, setLoginTitle] = useState('');
  const [loginSubtitle, setLoginSubtitle] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [regMode, setRegMode] = useState('closed'); // 'closed' | 'approval' | 'open'
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [info, setInfo] = useState('');
  const [regCaptcha, setRegCaptcha] = useState(true);
  const [captcha, setCaptcha] = useState(null); // { token, question }
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [consentCfg, setConsentCfg] = useState({ required: false, url: '', text: '' });
  const [consentChecked, setConsentChecked] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Stan dla 2FA
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const { verifyLoginCode, checkTwoFactorStatus, loading: verifyLoading } = useTwoFactor();

  // Pobierz branding logowania przy starcie (logo, tło, teksty powitalne). Publiczny odczyt.
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['org_logo_url', 'login_bg', 'login_bg_url', 'login_title', 'login_subtitle']);
        const m = {};
        (data || []).forEach((s) => { m[s.key] = s.value; });
        if (m.org_logo_url) { setLogoUrl(m.org_logo_url); localStorage.setItem('app_logo_cache', m.org_logo_url); }
        if (m.login_bg) setLoginBg(m.login_bg);
        if (m.login_bg_url) setLoginBgUrl(m.login_bg_url);
        if (m.login_title) setLoginTitle(m.login_title);
        if (m.login_subtitle) setLoginSubtitle(m.login_subtitle);
      } catch (err) {
        console.error('Błąd pobierania brandingu:', err);
      }
    };
    fetchBranding();
    // Tryb rejestracji (czy pokazać „Zarejestruj się") + komunikat po potwierdzeniu e-mail.
    supabase.auth.getRegistrationConfig?.().then((c) => {
      setRegMode(c?.mode || 'closed');
      setRegCaptcha(c?.captcha !== false);
      setConsentCfg(c?.consent || { required: false, url: '', text: '' });
    }).catch(() => {});
    const v = new URLSearchParams(window.location.search).get('verify');
    if (v === 'ok') setInfo(tr('E-mail potwierdzony — możesz się zalogować.'));
    else if (v === 'expired') setInfo(tr('Link weryfikacyjny wygasł lub został już użyty.'));
  }, []);

  // Pobierz świeże wyzwanie captcha (nowe przy każdym wejściu/nieudanej próbie).
  const loadCaptcha = () => { supabase.auth.getCaptcha?.().then((c) => setCaptcha(c)).catch(() => {}); };

  const openRegister = () => {
    setShowRegister(true); setError(''); setInfo('');
    if (regCaptcha) loadCaptcha();
  };

  // Rejestracja konta (serwer decyduje wg trybu tenanta).
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setInfo('');
    if (consentCfg.required && !consentChecked) {
      setLoading(false);
      setError(tr('Zaakceptuj regulamin / politykę prywatności'));
      return;
    }
    const { data, error: regErr } = await supabase.auth.signUp({
      email, password, full_name: regName,
      captcha_token: captcha?.token, captcha_answer: captchaAnswer, website: honeypot,
      consent: consentChecked,
    });
    setLoading(false);
    if (regErr) {
      setError(regErr.message || tr('Nie udało się utworzyć konta'));
      if (regCaptcha) { loadCaptcha(); setCaptchaAnswer(''); }
      return;
    }
    setInfo(data?.status === 'active'
      ? tr('Konto utworzone i aktywne — możesz się zalogować.')
      : data?.reason === 'email'
        ? tr('Konto utworzone. Sprawdź e-mail, aby je potwierdzić.')
        : tr('Konto utworzone. Oczekuje na zatwierdzenie przez administratora.'));
    setShowRegister(false);
    setPassword(''); setCaptchaAnswer(''); setConsentChecked(false);
  };

  // Styl tła ekranu logowania (własny obraz / gradient presetu / domyślne).
  const loginBgStyle = (() => {
    if (loginBg === 'custom' && loginBgUrl) return { backgroundImage: `url("${loginBgUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    const css = LOGIN_BG_OPTIONS[loginBg]?.css;
    return css ? { background: css } : undefined;
  })();

  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Weryfikacja hasła i statusu 2FA po stronie API (jedno wywołanie).
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message || tr('Błędny e-mail lub hasło.'));
        setLoading(false);
        return;
      }

      if (data?.requires2fa) {
        // Hasło poprawne + 2FA włączone - przechodzimy do weryfikacji kodu
        setPendingEmail(email);
        setRequires2FA(true);
        setLoading(false);
      }
      // Sukces bez 2FA - App.jsx wykryje sesję (onAuthStateChange)
    } catch (err) {
      setError(tr('Wystąpił błąd podczas logowania'));
      setLoading(false);
    }
  };

  const handleVerify2FA = async e => {
    e.preventDefault();
    if (totpCode.length < 6) {
      setError(tr('Wprowadź 6-cyfrowy kod'));
      return;
    }

    setLoading(true);
    setError('');

    // Kod TOTP weryfikuje serwer razem z hasłem (kody zapasowe też).
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: pendingEmail,
      password,
      totpCode
    });

    if (authError || data?.requires2fa) {
      setError(authError?.message || tr('Nieprawidłowy kod weryfikacyjny'));
      setLoading(false);
      return;
    }
    // Sukces - sesja zostanie wykryta przez App.jsx
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
      setError(tr('Wprowadź adres e-mail'));
      return;
    }
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message || tr('Błąd wysyłania emaila'));
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
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 relative z-10 animate-in fade-in zoom-in duration-300"
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
            {tr('Wprowadź kod z aplikacji Authenticator')}
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
            {tr('Powrót do logowania')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative overflow-hidden" style={loginBgStyle}>
      {/* Tło ozdobne (widoczne przy domyślnym tle) */}
      {!loginBgStyle && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-accent-primary-light/20 dark:bg-accent-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-accent-secondary-light/20 dark:bg-accent-secondary/10 rounded-full blur-3xl"></div>
        </div>
      )}

      <form
        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 relative z-10 animate-in fade-in zoom-in duration-300"
        onSubmit={showRegister ? handleRegister : handleLogin}
      >
        <div className="flex justify-center mb-6">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo organizacji"
              className="max-h-24 object-contain"
            />
          ) : (
            <div className="h-16 w-16 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
              S
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2 text-center">
          {showRegister ? tr('Załóż konto') : showForgotPassword ? tr('Resetuj hasło') : (loginTitle || 'Witaj ponownie')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-center text-sm mb-8">
          {showRegister
            ? tr('Wypełnij dane, aby utworzyć konto')
            : showForgotPassword
              ? tr('Podaj adres e-mail, a wyślemy Ci link do zresetowania hasła')
              : (loginSubtitle || tr('Zaloguj się do Avenit'))}
        </p>

        {info && (
          <div className="mb-6 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm text-center">
            {info}
          </div>
        )}

        {showRegister && (
          <div className="mb-5">
            <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">{tr('Imię i nazwisko')}</label>
            <input
              type="text"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light outline-none transition"
              value={regName}
              onChange={e => setRegName(e.target.value)}
              placeholder="Jan Kowalski"
            />
          </div>
        )}

        <div className="mb-5">
          <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">E-mail</label>
          <input
            type="email"
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light outline-none transition"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="jan@example.com"
          />
        </div>

        {!showForgotPassword && (
          <div className="mb-6">
            <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">{t('Hasło')}</label>
            <input
              type="password"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light outline-none transition"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
        )}

        {showRegister && regCaptcha && captcha && (
          <div className="mb-6">
            <label className="block mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">
              {tr('Weryfikacja')}: {captcha.question} = ?
            </label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light outline-none transition"
              value={captchaAnswer}
              onChange={e => setCaptchaAnswer(e.target.value)}
              required
              placeholder={tr('Wynik działania')}
            />
          </div>
        )}

        {showRegister && (
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />
        )}

        {showRegister && consentCfg.required && (
          <div className="mb-6">
            <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
              <input type="checkbox" className="mt-0.5 w-4 h-4" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
              <span>
                {consentCfg.text || tr('Akceptuję regulamin i politykę prywatności')}
                {consentCfg.url && <> — <a href={consentCfg.url} target="_blank" rel="noreferrer" className="text-accent-primary dark:text-accent-primary-light hover:underline">{tr('czytaj')}</a></>}
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {showRegister ? (
          <>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-accent-primary-light/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  {tr('Rejestracja...')}
                </span>
              ) : tr('Zarejestruj się')}
            </button>
            <button
              type="button"
              onClick={() => { setShowRegister(false); setError(''); setInfo(''); }}
              className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light transition"
            >
              {tr('← Powrót do logowania')}
            </button>
          </>
        ) : !showForgotPassword ? (
          <>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-accent-primary to-accent-secondary hover:from-accent-primary hover:to-accent-secondary text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-accent-primary-light/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Logowanie...
                </span>
              ) : tr('Zaloguj się')}
            </button>

            <button
              type="button"
              onClick={() => { setShowForgotPassword(true); setError(''); setResetEmailSent(false); }}
              className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light transition"
            >
              {tr('Nie pamiętam hasła')}
            </button>

            {regMode !== 'closed' && (
              <button
                type="button"
                onClick={openRegister}
                className="w-full mt-2 text-sm font-medium text-accent-primary dark:text-accent-primary-light hover:underline transition"
              >
                {tr('Nie masz konta? Zarejestruj się')}
              </button>
            )}
          </>
        ) : (
          <>
            {resetEmailSent ? (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-center">
                <p className="font-bold mb-1">{t('Email został wysłany!')}</p>
                <p className="text-sm">{t('Sprawdź swoją skrzynkę i kliknij link, aby zresetować hasło.')}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full bg-gradient-to-r from-accent-primary to-accent-secondary hover:from-accent-primary hover:to-accent-secondary text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-accent-primary-light/25 transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {tr('Wysyłanie...')}
                  </span>
                ) : tr('Wyślij link do resetu hasła')}
              </button>
            )}

            <button
              type="button"
              onClick={() => { setShowForgotPassword(false); setError(''); setResetEmailSent(false); }}
              className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light transition"
            >
              {tr('← Powrót do logowania')}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
