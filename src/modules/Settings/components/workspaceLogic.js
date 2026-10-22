// Logika karty „Google Workspace / Microsoft 365” (Ustawienia → Integracje) — czyste funkcje (testy Vitest).
import { tr } from '../../../i18n';

export const WS_PROVIDERS = ['microsoft', 'google'];

export const providerLabel = (p) => (p === 'google' ? 'Google Workspace' : 'Microsoft 365');

// Stan połączenia → { tone, label } (tone: 'none' | 'ok' | 'error').
export function connectionState(st) {
  const c = st?.connection;
  if (!c) return { tone: 'none', label: tr('Niepołączone') };
  if (c.status === 'active') return { tone: 'ok', label: c.account_email ? tr('Połączone jako {who}', { who: c.account_email }) : tr('Połączone') };
  if (c.status === 'revoked') return { tone: 'error', label: tr('Zgoda cofnięta — połącz ponownie') };
  return { tone: 'error', label: tr('Błąd połączenia') };
}

// Komunikat po powrocie z ekranu zgody (?ws_result=…&ws_reason=…).
export function callbackMessage(provider, result, reason) {
  const name = providerLabel(provider);
  if (result === 'connected') return { ok: true, text: tr('Połączono z {name}.', { name }) };
  const map = {
    state: tr('Sesja łączenia wygasła albo została otwarta w innej przeglądarce. Spróbuj ponownie.'),
    denied: tr('Nie udzielono zgody.'),
    not_admin: tr('Połączyć katalog może tylko administrator organizacji u dostawcy.'),
    not_workspace: tr('To konto Google nie należy do Google Workspace.'),
    scopes: tr('Nie udzielono wszystkich wymaganych uprawnień.'),
    tenant: tr('Zgoda dotyczy innego katalogu niż konto, którym się zalogowano.'),
    consent_pending: tr('Zgoda administratora jeszcze się nie rozpropagowała — spróbuj synchronizacji za kilka minut.'),
    not_configured: tr('Integracja nie jest skonfigurowana.'),
    no_refresh: tr('Dostawca nie zwrócił tokenu odświeżania — rozłącz i połącz ponownie.'),
  };
  return { ok: false, text: tr('Nie udało się połączyć z {name}: {why}', { name, why: map[reason] || tr('błąd po stronie dostawcy.') }) };
}

export const TRIGGER_LABEL = () => ({ preview: tr('Podgląd'), manual: tr('Ręcznie'), schedule: tr('Automatycznie') });

// Jednoliniowe podsumowanie przebiegu z historii.
export function runSummary(run) {
  const c = run?.counts || {};
  if (run?.dry_run) {
    return tr('{create} nowych, {link} do powiązania, {block} do zablokowania', { create: c.create ?? 0, link: c.link ?? 0, block: c.block ?? 0 });
  }
  const a = c.applied || {};
  return tr('{created} utworzonych, {linked} powiązanych, {blocked} zablokowanych', { created: a.created ?? 0, linked: a.linked ?? 0, blocked: a.blocked ?? 0 });
}

export const SKIP_REASON = () => ({
  disabled: tr('wyłączone w katalogu'),
  guest: tr('gość'),
  no_mail: tr('bez skrzynki pocztowej'),
  outside_domain: tr('spoza dozwolonych domen'),
  duplicate: tr('powtórzony adres'),
});

export const domainsToText = (arr) => (Array.isArray(arr) ? arr.join(', ') : '');
