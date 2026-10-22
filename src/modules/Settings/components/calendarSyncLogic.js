// Logika kart „Kalendarz Google / Outlook” (Mój profil) i „Kalendarz kościoła” (Integracje) —
// czyste funkcje (testy Vitest). Dane z fn calendar-sync / workspace-integration (bez tokenów).
import { tr, appLocale } from '../../../i18n';

export const CAL_PROVIDERS = ['google', 'microsoft'];
export const calProviderLabel = (p) => (p === 'google' ? 'Google Calendar' : 'Outlook (Microsoft 365)');

// Stan kalendarza osoby → { tone: 'none' | 'ok' | 'warn' | 'error', label }.
export function calendarSyncState(st) {
  const c = st?.connection;
  const t = st?.target;
  if (!c) return { tone: 'none', label: tr('Niepołączone') };
  if (c.status === 'revoked') return { tone: 'error', label: tr('Zgoda cofnięta — połącz ponownie') };
  if (t?.status === 'error' || c.status === 'error') return { tone: 'error', label: tr('Błąd synchronizacji') };
  if (t && !t.enabled) return { tone: 'warn', label: tr('Wstrzymane') };
  return { tone: 'ok', label: c.account_email ? tr('Połączone jako {who}', { who: c.account_email }) : tr('Połączone') };
}

// Komunikat po powrocie z ekranu zgody (?cal=…&cal_result=…&cal_reason=…).
export function calCallbackMessage(provider, result, reason) {
  const name = calProviderLabel(provider);
  if (result === 'connected') return { ok: true, text: tr('Połączono z {name}. Pierwsza synchronizacja w ciągu minuty.', { name }) };
  const map = {
    state: tr('Sesja łączenia wygasła albo została otwarta w innej przeglądarce. Spróbuj ponownie.'),
    denied: tr('Nie udzielono zgody.'),
    scopes: tr('Nie udzielono dostępu do kalendarza — zaznacz wszystkie uprawnienia.'),
    no_refresh: tr('Dostawca nie zwrócił tokenu odświeżania — rozłącz i połącz ponownie.'),
    not_configured: tr('Integracja nie jest skonfigurowana.'),
  };
  return { ok: false, text: tr('Nie udało się połączyć z {name}: {why}', { name, why: map[reason] || tr('błąd po stronie dostawcy.') }) };
}

// Co trafia do kalendarza osobistego (tryb „moje”).
export const USER_PREF_OPTIONS = () => [
  { key: 'my_services', label: tr('Moje służby'), hint: tr('Z grafiku — oczekujące oznaczone „(do potwierdzenia)”') },
  { key: 'registered', label: tr('Wydarzenia, na które się zapisałem') },
  { key: 'my_groups', label: tr('Moja grupa domowa i służby'), hint: tr('Wydarzenia skierowane do moich grup i zespołów') },
  { key: 'my_meetings', label: tr('Moje spotkania online') },
  { key: 'organized', label: tr('Wydarzenia, które organizuję') },
];

export function formatWhen(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' }); } catch { return '—'; }
}

// Jednoliniowe podsumowanie kalendarza docelowego.
export function syncSummary(t) {
  if (!t) return '';
  const parts = [tr('{n} wydarzeń w kalendarzu', { n: t.synced ?? 0 })];
  if (t.hidden) parts.push(tr('ukryte przez Ciebie: {n}', { n: t.hidden }));
  parts.push(t.last_push_at ? tr('ostatnio: {when}', { when: formatWhen(t.last_push_at) }) : tr('czeka na pierwszą synchronizację'));
  return parts.join(' · ');
}

// Lista tekstowa (np. typy wydarzeń) ↔ tablica.
export const listToText = (arr) => (Array.isArray(arr) ? arr.join(', ') : '');
export const textToList = (s) => [...new Set(String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
