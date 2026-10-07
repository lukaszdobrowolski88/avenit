import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTwoFactor } from '../hooks/useTwoFactor';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Clock } from 'lucide-react';
import { tr, useI18n } from '../i18n';
import { LOGIN_BG_OPTIONS, applyFont, applyHeadingFont, applyBackground, applyRadius, injectCustomFont } from '../lib/appearance';
import { applyColorPreset, applyCustomColors } from '../lib/colorPresets';
import '../styles/login.css';

const LOGO_INK = '/brand/avenit-logo-slod.png';
const LOGO_PAPER = '/brand/avenit-logo-papier.png';
const MARK = '/brand/avenit-znak-kurkuma.png';
const PRIVACY_URL = 'https://avenit.pl/polityka-prywatnosci/';

// Nagłówek w dwóch grubościach (sygnatura marki): gruba linia + cienka z kropką w kurkumie.
function TwoWeight({ strong, light, className, as: Tag = 'h2' }) {
  return (
    <Tag className={className}>
      <span className="lg-strong">{strong}</span>
      {light && <span className="lg-light">{light}<span className="lg-dot">.</span></span>}
    </Tag>
  );
}

function Spinner() {
  return <span className="lg-spin animate-spin" aria-hidden="true" />;
}

// Kod 2FA jako komórki; pod spodem jedno prawdziwe pole (wklejanie i autouzupełnianie kodu działają).
function CodeCells({ value, length, onChange, label }) {
  const [focused, setFocused] = useState(false);
  const chars = Array.from({ length }, (_, i) => value[i] || '');
  const active = Math.min(value.length, length - 1);
  const cell = (ch, i) => (
    <span
      key={i}
      className={`lg-otp-cell${focused && i === active ? ' is-active' : ''}${ch ? '' : ' is-empty'}`}
      aria-hidden="true"
    >
      {ch}
    </span>
  );
  const half = length / 2;
  return (
    <div className={`lg-otp${length > 6 ? ' lg-otp--long' : ''}`}>
      <div className="lg-otp-group">{chars.slice(0, half).map((ch, i) => cell(ch, i))}</div>
      <span className="lg-otp-dot" aria-hidden="true" />
      <div className="lg-otp-group">{chars.slice(half).map((ch, i) => cell(ch, i + half))}</div>
      <input
        className="lg-otp-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode={length > 6 ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={length}
        aria-label={label}
        autoFocus
      />
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="lg-pass">
      <input
        id={id}
        className="lg-input"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required
        placeholder="••••••••"
      />
      <button
        type="button"
        className="lg-eye"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? tr('Ukryj hasło') : tr('Pokaż hasło')}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}

export default function Login() {
  const { lang, setLang, languages } = useI18n();
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
  const [useBackupCode, setUseBackupCode] = useState(false);

  const { loading: verifyLoading } = useTwoFactor();

  // Branding logowania przy starcie (logo, tło, teksty powitalne + motyw kościoła) — z publicznej
  // konfiguracji rejestracji; dane API wymagają sesji, a wylogowanie czyści zapamiętany preset.
  useEffect(() => {
    const applyBranding = (m) => {
      if (m.org_logo_url) { setLogoUrl(m.org_logo_url); localStorage.setItem('app_logo_cache', m.org_logo_url); }
      if (m.login_bg) setLoginBg(m.login_bg);
      if (m.login_bg_url) setLoginBgUrl(m.login_bg_url);
      if (m.login_title) setLoginTitle(m.login_title);
      if (m.login_subtitle) setLoginSubtitle(m.login_subtitle);
      if (m.custom_colors) {
        try { const c = JSON.parse(m.custom_colors); applyCustomColors(c.primary, c.secondary); } catch { /* ignore */ }
      } else if (m.color_preset) applyColorPreset(m.color_preset);
      if (m.custom_font_url) injectCustomFont(m.custom_font_url);
      if (m.ui_font) applyFont(m.ui_font);
      if (m.ui_font_heading) applyHeadingFont(m.ui_font_heading);
      if (m.ui_bg) applyBackground(m.ui_bg);
      if (m.ui_radius) applyRadius(m.ui_radius);
    };
    // Tryb rejestracji (czy pokazać „Załóż konto") + komunikat po potwierdzeniu e-mail.
    supabase.auth.getRegistrationConfig?.().then((c) => {
      setRegMode(c?.mode || 'closed');
      setRegCaptcha(c?.captcha !== false);
      setConsentCfg(c?.consent || { required: false, url: '', text: '' });
      setPwPolicy(c?.passwordPolicy || { min: 8, complexity: false });
      if (c?.branding) applyBranding(c.branding);
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

  // Tło ekranu logowania ustawione przez kościół (własny obraz / gradient presetu) — pod hasłem marki.
  const heroBgStyle = (() => {
    if (loginBg === 'custom' && loginBgUrl) return { backgroundImage: `url("${loginBgUrl}")` };
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

  const codeLength = useBackupCode ? 8 : 6;
  // Kod z aplikacji = 6 cyfr; kod zapasowy = 8 znaków szesnastkowych (serwer porównuje wielkimi literami).
  const changeCode = (raw) => setTotpCode(useBackupCode
    ? raw.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8)
    : raw.replace(/\D/g, '').slice(0, 6));

  const toggleBackupCode = () => {
    setUseBackupCode(b => !b);
    setTotpCode('');
    setError('');
  };

  const handleVerify2FA = async e => {
    e.preventDefault();
    if (totpCode.length < codeLength) {
      setError(useBackupCode ? tr('Wprowadź 8-znakowy kod zapasowy') : tr('Wprowadź 6-cyfrowy kod'));
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
    setUseBackupCode(false);
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

  const backToLogin = () => {
    setShowForgotPassword(false);
    setShowRegister(false);
    setResetEmailSent(false);
    setError('');
    setInfo('');
  };

  const errorBox = error && <p className="lg-msg lg-msg--error" role="alert">{error}</p>;
  const backButton = (onClick) => (
    <button type="button" className="lg-back" onClick={onClick}>
      <ArrowLeft size={16} strokeWidth={2.4} />
      {tr('Powrót do logowania')}
    </button>
  );
  const cta = (busy, busyLabel, label, arrow) => (
    <button type="submit" className="lg-cta" disabled={busy}>
      {busy ? <><Spinner />{busyLabel}</> : <>{label}{arrow && <ArrowRight size={18} strokeWidth={2.4} />}</>}
    </button>
  );

  let content;
  if (requires2FA) {
    content = (
      <>
        <div className="lg-head">
          <span className="lg-eyebrow">{tr('Weryfikacja dwuetapowa')}</span>
          {useBackupCode
            ? <TwoWeight className="lg-title" strong={tr('Kod zapasowy')} light={tr('8 znaków')} />
            : <TwoWeight className="lg-title" strong={tr('Wpisz kod')} light={tr('z aplikacji')} />}
          <p className="lg-sub">
            {useBackupCode
              ? tr('Każdy kod zapasowy działa tylko raz.')
              : tr('Otwórz aplikację uwierzytelniającą (np. Google Authenticator) i przepisz 6 cyfr dla konta Avenit.')}
          </p>
        </div>
        <form className="lg-form" onSubmit={handleVerify2FA}>
          <CodeCells
            key={codeLength}
            value={totpCode}
            length={codeLength}
            onChange={changeCode}
            label={useBackupCode ? tr('Kod zapasowy') : tr('Kod weryfikacyjny')}
          />
          {!useBackupCode && (
            <p className="lg-hint"><Clock size={15} aria-hidden="true" />{tr('Kod zmienia się co 30 sekund.')}</p>
          )}
          {errorBox}
          {cta(loading || verifyLoading, tr('Weryfikacja...'), tr('Potwierdź'))}
          <button type="button" className="lg-textlink" style={{ alignSelf: 'center' }} onClick={toggleBackupCode}>
            {useBackupCode ? tr('Użyj kodu z aplikacji') : tr('Użyj kodu zapasowego')}
          </button>
        </form>
        {backButton(handleBack2FA)}
      </>
    );
  } else if (showRegister) {
    content = (
      <>
        <div className="lg-head">
          <span className="lg-eyebrow">{tr('Rejestracja')}</span>
          <TwoWeight className="lg-title" strong={tr('Załóż konto')} light={tr('w Avenit')} />
          <p className="lg-sub">{tr('Wypełnij dane, aby utworzyć konto')}</p>
        </div>
        <form className="lg-form" onSubmit={handleRegister}>
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-name">{tr('Imię i nazwisko')}</label>
            <input id="lg-name" className="lg-input" type="text" autoComplete="name" value={regName} onChange={e => setRegName(e.target.value)} placeholder={tr('Jan Kowalski')} />
          </div>
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-reg-email">{tr('E-mail')}</label>
            <input id="lg-reg-email" className="lg-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="jan@example.com" />
          </div>
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-reg-pass">{tr('Hasło')}</label>
            <PasswordInput id="lg-reg-pass" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            <p className="lg-hint">{tr('Min.')} {pwPolicy.min} {tr('znaków')}{pwPolicy.complexity ? tr(', w tym mała i wielka litera oraz cyfra') : ''}</p>
          </div>
          {regCaptcha && captcha && (
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-captcha">{tr('Weryfikacja')}: {captcha.question} = ?</label>
              <input id="lg-captcha" className="lg-input" type="text" inputMode="numeric" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} required placeholder={tr('Wynik działania')} />
            </div>
          )}
          <input
            type="text"
            className="lg-honeypot"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
          />
          {consentCfg.required && (
            <label className="lg-check">
              <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
              <span>
                {consentCfg.text || tr('Akceptuję regulamin i politykę prywatności')}
                {consentCfg.url && <> — <a href={consentCfg.url} target="_blank" rel="noreferrer">{tr('czytaj')}</a></>}
              </span>
            </label>
          )}
          {errorBox}
          {cta(loading, tr('Rejestracja...'), tr('Zarejestruj się'))}
        </form>
        {backButton(backToLogin)}
      </>
    );
  } else if (showForgotPassword && resetEmailSent) {
    content = (
      <>
        <div className="lg-head">
          <TwoWeight className="lg-title" strong={tr('Sprawdź')} light={tr('skrzynkę')} />
          <p className="lg-sub">{tr('Sprawdź swoją skrzynkę i kliknij link, aby zresetować hasło.')}</p>
        </div>
        {backButton(backToLogin)}
      </>
    );
  } else if (showForgotPassword) {
    content = (
      <>
        <div className="lg-head">
          <span className="lg-eyebrow">{tr('Reset hasła')}</span>
          <TwoWeight className="lg-title" strong={tr('Nowe')} light={tr('hasło')} />
          <p className="lg-sub">{tr('Podaj adres e-mail, a wyślemy Ci link do zresetowania hasła')}</p>
        </div>
        <form className="lg-form" onSubmit={handleForgotPassword}>
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-reset-email">{tr('E-mail')}</label>
            <input id="lg-reset-email" className="lg-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="jan@example.com" />
          </div>
          {errorBox}
          {cta(loading, tr('Wysyłanie...'), tr('Wyślij link do resetu hasła'))}
        </form>
        {backButton(backToLogin)}
      </>
    );
  } else {
    content = (
      <>
        <div className="lg-head">
          <span className="lg-eyebrow">{tr('Logowanie')}</span>
          <TwoWeight className="lg-title" strong={loginTitle || tr('Dobrze Cię widzieć.')} light={tr('Zaloguj się')} />
          {loginSubtitle && <p className="lg-sub">{loginSubtitle}</p>}
        </div>
        {info && <p className="lg-msg lg-msg--info" role="status">{info}</p>}
        <form className="lg-form" onSubmit={handleLogin}>
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-email">{tr('E-mail')}</label>
            <input id="lg-email" className="lg-input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="jan@example.com" />
          </div>
          <div className="lg-field">
            <div className="lg-label-row">
              <label className="lg-label" htmlFor="lg-pass">{tr('Hasło')}</label>
              <button
                type="button"
                className="lg-textlink"
                onClick={() => { setShowForgotPassword(true); setError(''); setInfo(''); setResetEmailSent(false); }}
              >
                {tr('Nie pamiętam hasła')}
              </button>
            </div>
            <PasswordInput id="lg-pass" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {errorBox}
          {cta(loading, tr('Logowanie...'), tr('Zaloguj się'), true)}
        </form>

        {(ssoProviders.google || ssoProviders.microsoft) && (
          <div className="lg-sso">
            <div className="lg-or">{tr('lub')}</div>
            {ssoProviders.google && (
              <a href="/api/auth/oauth/google/start">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {tr('Zaloguj przez Google')}
              </a>
            )}
            {ssoProviders.microsoft && (
              <a href="/api/auth/oauth/microsoft/start">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>
                {tr('Zaloguj przez Microsoft')}
              </a>
            )}
          </div>
        )}

        {regMode !== 'closed' && (
          <div className="lg-alt">
            {tr('Nie masz konta?')}{' '}
            <button type="button" className="lg-strong-link" onClick={openRegister}>
              {regMode === 'approval' ? tr('Poproś o dostęp') : tr('Załóż konto')}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="lg-root">
      <section className={`lg-hero${heroBgStyle ? ' lg-hero--image' : ''}`} style={heroBgStyle}>
        <header className="lg-brand">
          {heroBgStyle ? (
            <img src={LOGO_PAPER} alt="Avenit" />
          ) : (
            <>
              <img src={LOGO_INK} alt="Avenit" className="lg-only-light" />
              <img src={LOGO_PAPER} alt="Avenit" className="lg-only-dark" />
            </>
          )}
          <span className="lg-brand-sep" aria-hidden="true" />
          <span className="lg-brand-claim">Church Manager</span>
        </header>
        <div>
          <TwoWeight as="p" className="lg-display" strong={tr('Cały kościół.')} light={tr('Jedna aplikacja')} />
          <p className="lg-lead">{tr('Programy nabożeństw, grafiki służb, grupy domowe, kazania, pieśni, modlitwy, komunikacja, finanse i check-in dzieci.')}</p>
        </div>
        <footer className="lg-foot">
          <span>© {new Date().getFullYear()} Avenit</span>
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer">{tr('Polityka prywatności')}</a>
          <a href="https://avenit.pl" target="_blank" rel="noreferrer">avenit.pl</a>
        </footer>
      </section>

      <main className="lg-side">
        <div className="lg-card">
          <div className="lg-card-top">
            {logoUrl
              ? <img src={logoUrl} alt={tr('Logo organizacji')} className="lg-org-logo" />
              : <img src={MARK} alt="" className="lg-mark" />}
            <div className="lg-lang" role="group" aria-label={tr('Język')}>
              {languages.map(l => (
                <button
                  key={l.code}
                  type="button"
                  lang={l.code}
                  aria-pressed={lang === l.code}
                  aria-label={l.label}
                  onClick={() => setLang(l.code)}
                >
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {content}
        </div>
        <p className="lg-secure"><Lock size={15} aria-hidden="true" />{tr('Połączenie szyfrowane')}</p>
      </main>
    </div>
  );
}
