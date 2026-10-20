// Wersja wiersza realtime dla odbiorcy — te same ograniczenia co odczyt przez /api/db
// (audyt 2026-10, runda 4): realtime wysyłał całe wiersze, więc zakazy pól (field:…:read=false),
// prośby „tylko dla liderów”, dane autorów próśb anonimowych, cudze telefony z kont i sekrety
// z app_settings docierały do każdego subskrybenta tabeli.
import { fieldColumns } from '@avenit/shared/src/permissions/catalog.js';
import { isPrayerTable, prayerViewer, redactPrayerRows } from '../dataapi/prayerScope.js';
import { redactAccounts } from '../dataapi/accountFields.js';
import { isSecretSetting } from '../dataapi/settingsScope.js';
import { seesAllHomeGroupContacts, isHomeGroupContactTable, redactHomeGroupRows } from '../dataapi/homeGroupContacts.js';
import { materialsViewer, materialsRealtimeFilter } from '../dataapi/materialsScope.js';

// Zwraca (rows) => rows albo null (bez zmian). resolver null przy adminie / trybie legacy.
// moduleKeys: klucze app_modules (przestrzenie plików modułów własnych — materialsScope.js).
export function realtimeRedactor({ table, isAdmin, resolver, user, moduleKeys = [] }) {
  if (isAdmin) return null;
  const steps = [];
  if (table === 'app_settings') steps.push((rows) => rows.filter((r) => !isSecretSetting(r?.key)));
  if (isPrayerTable(table)) {
    const viewer = prayerViewer({ isAdmin, resolver, email: user?.email });
    steps.push((rows) => redactPrayerRows(rows, viewer, { dropHidden: true }));
  }
  if (table === 'app_users' && resolver) {
    steps.push((rows) => redactAccounts(rows.map((r) => (r ? { ...r } : r)), resolver, user));
  }
  // Grupy domowe (członkowie, kontakty grupy, liderzy): w realtime bez sprawdzania moich grup —
  // kontakty tylko we własnym wierszu (lista i tak odświeża się zapytaniem, które zna moje grupy).
  if (isHomeGroupContactTable(table) && !seesAllHomeGroupContacts(resolver)) {
    steps.push((rows) => redactHomeGroupRows(table, rows.map((r) => (r ? { ...r } : r)), { email: user?.email }));
  }
  // Pliki przestrzeni modułu bez dostępu do niego (runda 5) — jak zakres /api/db, bez udostępnień.
  const materials = materialsRealtimeFilter(table, materialsViewer({ resolver, email: user?.email, moduleKeys }));
  if (materials) steps.push(materials);
  if (resolver) {
    const denied = fieldColumns(table).filter((c) => !resolver.fieldReadable(table, c));
    if (denied.length) {
      steps.push((rows) => rows.map((r) => {
        if (!r) return r;
        const copy = { ...r };
        for (const c of denied) delete copy[c];
        return copy;
      }));
    }
  }
  if (!steps.length) return null;
  return (rows) => steps.reduce((acc, step) => step(acc), (rows || []).filter(Boolean));
}
