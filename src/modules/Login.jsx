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
  const [ssoProviders, setSsoProviders] = useState({ google: false, microsoft: false });
  const [pwPolicy, setPwPolicy] = useState({ min: 8, complexity: false });
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
      setPwPolicy(c?.passwordPolicy || { min: 8, complexity: false });
    }).catch(() => {});
    supabase.auth.getSSOConfig?.().then((s) => setSsoProviders(s || { google: false, microsoft: false })).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const v = params.get('verify');
    if (v === 'ok') setInfo(tr('E-mail potwierdzony — możesz się zalogować.'));
    else if (v === 'expired') setInfo(tr('Link weryfikacyjny wygasł lub został już użyty.'));
    const sso = params.get('sso');
    if (sso === 'nouser') setError(tr('Brak konta dla tego adresu. Skontaktuj się z administratorem.'));
    else if (sso === 'pending') setError(tr('Konto utworzone — czeka na zatwierdzenie przez administratora.'));
    else if (sso === 'inactive') setError(tr('Konto nieaktywne lub oczekuje na zatwierdzenie.'));
    else if (sso === 'disabled') setError(tr('Logowanie przez tego dostawcę jest wyłączone.'));
    else if (sso === 'error') setError(tr('Logowanie zewnętrzne nie powiodło się. Spróbuj ponownie.'));
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
            {showRegister && (
              <p className="text-xs text-gray-400 mt-1.5">{tr('Min.')} {pwPolicy.min} {tr('znaków')}{pwPolicy.complexity ? tr(', w tym mała i wielka litera oraz cyfra') : ''}</p>
            )}
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

            {(ssoProviders.google || ssoProviders.microsoft) && (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs text-gray-400">{tr('lub')}</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                {ssoProviders.google && (
                  <a href="/api/auth/oauth/google/start" className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium mb-2">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    {tr('Zaloguj przez Google')}
                  </a>
                )}
                {ssoProviders.microsoft && (
                  <a href="/api/auth/oauth/microsoft/start" className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>
                    {tr('Zaloguj przez Microsoft')}
                  </a>
                )}
              </div>
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
