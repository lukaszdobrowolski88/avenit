// Które moduły z app_modules są SŁUŻBAMI (zespołami ludzi z własnym składem i budżetem).
// Wspólne dla pola „Służby” w formularzu osoby (Członkowie) i listy „Służba / obszar”
// w Finansach — wcześniej obie listy brały wszystkie moduły minus czarna lista, więc
// pokazywały też Komunikator, Ustawienia, Kampanie, Formularze, Asystenta AI itd.
//
// Biała lista: wbudowane zespoły + WŁASNE moduły z Kreatora. Własny moduł = bez
// component_name i spoza katalogu wbudowanych modułów (ta sama definicja co serwerowe
// financeScope.js) — wbudowane moduły bez komponentu (Skrzynka pocztowa, Kampanie push/SMS)
// są w katalogu, więc nie trafią na listę.
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';

// Wbudowane moduły zespołów (klucze app_modules). 'mc' bywa modułem własnym („Scena / MC”).
export const BUILTIN_MINISTRY_KEYS = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'mlodziezowka', 'tlumaczenia', 'mc'];

const BUILTIN_MODULE_KEYS = new Set(MODULES.map((m) => m.key));
const BUILTIN_MINISTRY_SET = new Set(BUILTIN_MINISTRY_KEYS);

// Moduł własny z Kreatora modułów (nie wbudowany).
export function isCustomModule(m) {
  return !!(m && m.key && !m.component_name && !BUILTIN_MODULE_KEYS.has(m.key) && !BUILTIN_MINISTRY_SET.has(m.key));
}

// Moduł jest służbą: wbudowany zespół albo moduł własny.
export function isMinistryModule(m) {
  return !!(m && m.key && (BUILTIN_MINISTRY_SET.has(m.key) || isCustomModule(m)));
}
