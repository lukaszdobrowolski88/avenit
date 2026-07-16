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

// Rdzeń tłumaczenia — wspólny dla hooka t() i globalnej funkcji tr().
function translate(lang, key, vars) {
  const dict = TRANSLATIONS[lang] || {};
  let out = (lang === 'pl' ? key : (dict[key] ?? key));
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

// Bieżący język w zmiennej modułowej — synchronizowany przez I18nProvider.
// Pozwala używać tr('klucz') bez hooka; reaktywność zapewnia AppInner,
// który konsumuje kontekst i przerenderowuje drzewo przy zmianie języka.
let _lang = DEFAULT_LANG;
try { _lang = readInitialLang(); } catch { /* ignore */ }

// Globalna funkcja tłumacząca (bez hooka) — do użycia w dowolnym komponencie.
export function tr(key, vars) {
  return translate(_lang, key, vars);
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);
  _lang = lang; // synchronizuj zmienną modułową dla tr()

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* ignore */ }
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!SUPPORTED.includes(code)) return;
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  }, []);

  // t(key, vars?) — zwraca tłumaczenie lub polski klucz (fallback). Obsługuje {zmienne}.
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

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
