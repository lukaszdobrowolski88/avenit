// Pliki z chmury (Faza 3 integracji) — czysta logika interfejsu (testy Vitest): które przyciski
// wyboru pokazać, komunikaty o dostępie, etykiety. Dane z fn cloud-files (bez tokenów).
import { tr } from '../../i18n';
import {
  isCloudAttachment, cloudFromMaterialRow, cloudOpenUrl, CLOUD_PROVIDER_LABEL, CLOUD_OPEN_LABEL,
} from '@avenit/shared/src/lib/cloudFiles.js';

export const PICK_PROVIDERS = ['google', 'microsoft'];

export const pickerLabel = (p) => (p === 'google' ? tr('Dysk Google') : tr('OneDrive / SharePoint'));
export const connectLabel = (p) => (p === 'google' ? tr('Połącz z Dyskiem Google') : tr('Połącz z OneDrive'));
export const cloudProviderName = (p) => tr(CLOUD_PROVIDER_LABEL[p] || 'Chmura');
export const cloudOpenText = (p) => tr(CLOUD_OPEN_LABEL[p] || 'Otwórz');

// Przyciski wyboru: dostawcy wyłączeni przez kościół — ukryci; reszta ze stanem:
//   'ready' (połączone), 'connect' (trzeba połączyć konto), 'reconnect' (zgoda cofnięta / błąd),
//   'unavailable' (kościół nie skonfigurował integracji).
export function providerChoices(status) {
  return PICK_PROVIDERS
    .filter((p) => status?.[p] && status[p].enabled !== false)
    .map((p) => {
      const s = status[p];
      let state = 'ready';
      if (!s.available && !s.connected) state = 'unavailable';
      else if (!s.connected) state = 'connect';
      else if (s.status && s.status !== 'active') state = 'reconnect';
      return { provider: p, label: pickerLabel(p), state, account: s.account_email || null, canShareDomain: !!s.can_share_domain, domain: s.domain || null };
    });
}

export const anyCloudEnabled = (status) => providerChoices(status).length > 0;

// Komunikat przy dodawaniu: wybór pliku nie zmienia uprawnień u dostawcy.
export function accessNotice(provider) {
  return tr('Odbiorcy muszą mieć dostęp do pliku w {target}.', { target: provider === 'google' ? tr('Dysku Google') : tr('OneDrive / SharePoint') });
}
export function shareHint(provider, { canShareDomain = false } = {}) {
  if (provider === 'google') {
    return canShareDomain
      ? null
      : tr('To konto Google nie należy do organizacji — udostępnij plik w Dysku Google osobom, które mają go zobaczyć.');
  }
  return tr('Jeśli odbiorcy nie widzą pliku, udostępnij go w OneDrive / SharePoint (Udostępnij → osoby w organizacji).');
}

// Odnośnik do wyświetlenia z dowolnego kształtu (załącznik wiadomości albo wiersz materials_files).
export function cloudItemOf(x) {
  if (!x) return null;
  if (isCloudAttachment(x)) return { ...x, web_url: cloudOpenUrl(x) };
  if (x.external_provider) {
    const c = cloudFromMaterialRow(x);
    return c ? { ...c, web_url: cloudOpenUrl(c) } : { provider: x.external_provider, name: x.name, web_url: null, size: x.file_size ?? null };
  }
  return null;
}
export const isCloudRow = (row) => !!row?.external_provider;

// Komunikat po powrocie z ekranu zgody (?files=…&files_result=…&files_reason=…).
export function filesCallbackMessage(provider, result, reason) {
  const name = pickerLabel(provider);
  if (result === 'connected') return { ok: true, text: tr('Połączono z {name}. Możesz dodawać pliki bez kopiowania.', { name }) };
  const map = {
    state: tr('Sesja łączenia wygasła albo została otwarta w innej przeglądarce. Spróbuj ponownie.'),
    denied: tr('Nie udzielono zgody.'),
    scopes: tr('Nie udzielono dostępu do plików — zaznacz wszystkie uprawnienia.'),
    no_refresh: tr('Dostawca nie zwrócił tokenu odświeżania — rozłącz i połącz ponownie.'),
    not_configured: tr('Integracja nie jest skonfigurowana.'),
  };
  return { ok: false, text: tr('Nie udało się połączyć z {name}: {why}', { name, why: map[reason] || tr('błąd po stronie dostawcy.') }) };
}

export function fmtCloudSize(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}
