import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { LANGUAGES, TRANSLATIONS, type LangCode } from './translations';

const STORAGE_KEY = 'avenit_lang';
const DEFAULT_LANG: LangCode = 'pl';
const SUPPORTED = LANGUAGES.map((l) => l.code);

type Vars = Record<string, string | number>;

// Rdzeń tłumaczenia — pl = źródło (identyczność); inne języki z TRANSLATIONS, fallback do pl.
// Obsługuje interpolację {zmiennych}.
function translate(lang: LangCode, key: string, vars?: Vars): string {
  let out = lang === 'pl' ? key : (TRANSLATIONS[lang]?.[key] ?? key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

// Bieżący język w zmiennej modułowej — synchronizowany przez I18nProvider. Pozwala używać
// tr('tekst') poza komponentem; reaktywność w komponentach daje useT()/useLang (kontekst).
let _lang: LangCode = DEFAULT_LANG;
export function tr(key: string, vars?: Vars): string {
  return translate(_lang, key, vars);
}

interface I18nValue {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: (key: string, vars?: Vars) => string;
  languages: typeof LANGUAGES;
}

const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (k) => k,
  languages: LANGUAGES,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(DEFAULT_LANG);
  _lang = lang;

  // Hydracja z SecureStore (async) — zanim się wczyta, działamy po polsku (źródło).
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (active && saved && (SUPPORTED as string[]).includes(saved)) {
          setLangState(saved as LangCode);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setLang = useCallback((code: LangCode) => {
    if (!(SUPPORTED as string[]).includes(code)) return;
    setLangState(code);
    SecureStore.setItemAsync(STORAGE_KEY, code).catch(() => undefined);
  }, []);

  const t = useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang]);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Hook z funkcją tłumaczącą (reaktywny na zmianę języka).
export function useT(): (key: string, vars?: Vars) => string {
  return useContext(I18nContext).t;
}

// Hook do przełącznika języka.
export function useLang() {
  const { lang, setLang, languages } = useContext(I18nContext);
  return { lang, setLang, languages };
}
