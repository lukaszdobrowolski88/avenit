import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TRANSLATIONS, LANGUAGES } from './translations';

const STORAGE_KEY = 'avenit_lang';
const SUPPORTED = LANGUAGES.map((l) => l.code);
const DEFAULT_LANG = 'pl';

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch { /* ignore */ }
  return DEFAULT_LANG;
}

const I18nContext = createContext({ lang: DEFAULT_LANG, setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* ignore */ }
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!SUPPORTED.includes(code)) return;
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  }, []);

  // t(key, vars?) — zwraca tłumaczenie lub polski klucz (fallback). Obsługuje {zmienne}.
  const t = useCallback((key, vars) => {
    const dict = TRANSLATIONS[lang] || {};
    let out = (lang === 'pl' ? key : (dict[key] ?? key));
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{${k}}`, String(v));
      }
    }
    return out;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Hook zwracający { t, lang, setLang, languages }.
export function useI18n() {
  return useContext(I18nContext);
}

// Skrót — samo t().
export function useT() {
  return useContext(I18nContext).t;
}
