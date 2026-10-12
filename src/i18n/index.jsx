import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES } from './languages';

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

// Słowniki EN/UK (~700 KB) ładowane leniwie — polscy użytkownicy (polski = klucze) ich nie pobierają.
let DICTS = {};
let dictsPromise = null;
function loadDicts() {
  if (!dictsPromise) dictsPromise = import('./translations').then((m) => { DICTS = m.TRANSLATIONS; });
  return dictsPromise;
}

// Wywoływane w main.jsx PRZED załadowaniem aplikacji: gdy zapisany język nie jest polski,
// słownik jest gotowy, zanim moduły policzą swoje etykiety (tr() na poziomie modułu).
export function preloadI18n() {
  return readInitialLang() === 'pl' ? Promise.resolve() : loadDicts().catch(() => {});
}

// Rdzeń tłumaczenia — wspólny dla hooka t() i globalnej funkcji tr().
function translate(lang, key, vars) {
  const dict = DICTS[lang] || {};
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

// Locale do formatowania dat, liczb i kwot (toLocaleDateString / Intl) w bieżącym języku —
// zamiast sztywnego 'pl-PL' (po angielsku nazwy miesięcy i dni zostawały polskie).
const LOCALES = { pl: 'pl-PL', en: 'en-GB', uk: 'uk-UA' };
export function appLocale() {
  return LOCALES[_lang] || 'pl-PL';
}

// Liczebnik z odmianą według reguł BIEŻĄCEGO języka: trPlural(n, '{n} dziecko', '{n} dzieci', '{n} dzieci').
// Formy to polskie klucze (one = 1, few = 2–4, many = 5+). Kategorię wybiera Intl.PluralRules,
// więc po ukraińsku 21 to „one”, a po angielsku wszystko poza 1 to forma „many”.
// Gdy polska forma few i many jest ta sama (np. „{n} dzieci”), słownik może mieć osobny
// wpis „<klucz few>|few” — po ukraińsku 2–4 to inna forma niż 5+ (дитини / дітей).
export function pluralKey(lang, n, one, few, many, dict = {}) {
  let cat = 'many';
  try { cat = new Intl.PluralRules(LOCALES[lang] || 'pl-PL').select(n); } catch { /* stare przeglądarki */ }
  if (cat === 'one') return one;
  if (cat === 'few') return lang !== 'pl' && dict[`${few}|few`] != null ? `${few}|few` : few;
  return many;
}

export function trPlural(n, one, few, many, vars) {
  return tr(pluralKey(_lang, n, one, few, many, DICTS[_lang]), { n, ...vars });
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);
  // Słownik gotowy? Polski nie potrzebuje słownika (klucze są polskie).
  const [ready, setReady] = useState(() => lang === 'pl' || !!DICTS[lang]);
  _lang = lang; // synchronizuj zmienną modułową dla tr()

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* ignore */ }
  }, [lang]);

  // Start w języku innym niż polski: dociągnij słownik przed pierwszym renderem aplikacji
  // (krótka pusta chwila zamiast mignięcia polskich tekstów).
  useEffect(() => {
    if (ready) return undefined;
    let alive = true;
    loadDicts().then(() => { if (alive) setReady(true); }, () => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [ready]);

  // Zmiana języka czeka na słownik, potem przełącza całe drzewo naraz.
  const setLang = useCallback((code) => {
    if (!SUPPORTED.includes(code)) return;
    const apply = () => {
      setLangState(code);
      setReady(true);
      try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    };
    if (code === 'pl') apply();
    else loadDicts().then(apply, apply);
  }, []);

  // t(key, vars?) — zwraca tłumaczenie lub polski klucz (fallback). Obsługuje {zmienne}.
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang, ready]);

  const value = useMemo(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);

  if (!ready) return null;
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
