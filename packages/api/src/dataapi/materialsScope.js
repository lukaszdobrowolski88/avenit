// Materiały (Pliki) — zakres wierszy per czytający (audyt uprawnień 2026-10, runda 5).
//
// materials_files / materials_folders to tabele WSPÓLNE wielu modułów (zakładka „Pliki” w Uwielbieniu,
// Mediach, Grupach domowych, ale też w Finansach i Członkach), rozróżniane kolumną team_type = klucz
// modułu. Do rundy 5 każdy zalogowany czytał przez /api/db wszystkie wiersze — także pliki Finansów
// i Członków. Teraz nie-administrator widzi wiersz, gdy:
//   • team_type IS NULL (pliki ogólne — jak dotąd dla wszystkich), albo
//   • ma dostęp do modułu przestrzeni (module:<team_type>), albo
//   • to jego plik / folder (uploaded_by / created_by), albo
//   • przestrzeń NIE jest wrażliwa (SENSITIVE_MATERIAL_TEAMS) i plik/folder jest mu udostępniony
//     (materials_shares: osoba, jego grupa domowa, jego grupa — jak fn my-shared-materials) albo
//     plik jest materiałem wydarzenia (event_materials — karta wydarzenia w kalendarzu).
// Ten sam predykat zawęża zmiany i usuwanie (nie zmienisz pliku, którego nie widzisz), złączenia
// (np. event_materials → materials_files:file_id) i realtime (bez wyjątków udostępnień — lista
// i tak odświeża się zapytaniem). Administrator i tryb legacy (resolver null) — bez zmian.
import { ApiError } from './querybuilder.js';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';
import { SENSITIVE_MATERIAL_TEAMS, isSensitiveMaterialTeam } from '@avenit/shared/src/lib/materialsAccess.js';

export const MATERIALS_OWNER_COLUMN = { materials_files: 'uploaded_by', materials_folders: 'created_by' };
export const isMaterialsTable = (table) => Object.prototype.hasOwnProperty.call(MATERIALS_OWNER_COLUMN, table);

const lower = (v) => String(v ?? '').trim().toLowerCase();
// Klucz, którego żaden moduł nie ma — can('module:<ten klucz>') = true tylko przy wildcardzie (module:* / '*').
const WILDCARD_PROBE = '__any_team__';

// Dostęp do przestrzeni plików: { mode: 'allow', teams } (tylko te) albo { mode: 'deny', teams }
// (wildcard — wszystkie poza jawnie zabronionymi). moduleKeys: klucze z app_modules (moduły własne).
export function materialsTeamAccess(resolver, moduleKeys = []) {
  const candidates = [...new Set([...MODULES.map((m) => m.key), ...SENSITIVE_MATERIAL_TEAMS, ...(moduleKeys || [])])];
  if (resolver.can(`module:${WILDCARD_PROBE}`)) {
    return { mode: 'deny', teams: candidates.filter((k) => !resolver.can(`module:${k}`)) };
  }
  return { mode: 'allow', teams: candidates.filter((k) => resolver.can(`module:${k}`)) };
}

export function materialsViewer({ resolver, email, moduleKeys }) {
  if (!resolver) return null; // admin / legacy
  return { access: materialsTeamAccess(resolver, moduleKeys), me: lower(email) };
}

// Czy przestrzeń jest dostępna (dla realtime i sprawdzeń w JS).
export function teamVisible(viewer, team) {
  if (!viewer || team == null) return true;
  const t = String(team);
  return viewer.access.mode === 'allow' ? viewer.access.teams.includes(t) : !viewer.access.teams.includes(t);
}

// Predykat SQL widoczności wiersza (alias, push) => klauzula. withShares=false — bez podzapytań
// (udostępnienia, wydarzenia): strażnik nadpisania przy upsert (ON CONFLICT … WHERE).
export function materialsPredicate(table, viewer, { withShares = true } = {}) {
  const owner = MATERIALS_OWNER_COLUMN[table];
  return (a, push) => {
    const pTeams = push(viewer.access.teams.map(String));
    const teamClause = viewer.access.mode === 'allow'
      ? `${a}."team_type" = ANY($${pTeams}::text[])`
      : `NOT (${a}."team_type" = ANY($${pTeams}::text[]))`;
    const pMe = push(viewer.me);
    const base = `${a}."team_type" IS NULL OR ${teamClause}
      OR ($${pMe} <> '' AND lower(${a}."${owner}") = $${pMe})`;
    if (!withShares) return `(${base})`;
    const pSensitive = push(SENSITIVE_MATERIAL_TEAMS);
    const shareMatch = table === 'materials_files'
      ? `(s_."file_id"::text = ${a}."id"::text OR (${a}."folder_id" IS NOT NULL AND s_."folder_id"::text = ${a}."folder_id"::text))`
      : `s_."folder_id"::text = ${a}."id"::text`;
    const shared = `EXISTS (SELECT 1 FROM materials_shares s_ WHERE ${shareMatch} AND (
        (s_."target_type" = 'user' AND lower(s_."target_id") = $${pMe})
        OR (s_."target_type" = 'home_group' AND s_."target_id" IN (
              SELECT hgm_."group_id"::text FROM home_group_members hgm_ WHERE lower(hgm_."email") = $${pMe}))
        OR (s_."target_type" = 'group' AND s_."target_id" IN (
              SELECT gm_."group_id"::text FROM group_members gm_ JOIN members m_ ON m_."id"::text = gm_."member_id"::text
               WHERE lower(m_."email") = $${pMe}))))`;
    const eventLinked = table === 'materials_files'
      ? ` OR EXISTS (SELECT 1 FROM event_materials em_ WHERE em_."file_id"::text = ${a}."id"::text)`
      : '';
    return `(${base}
      OR (NOT (${a}."team_type" = ANY($${pSensitive}::text[])) AND (${shared}${eventLinked})))`;
  };
}

// Zakres q.__ownerScope (odczyt, zmiana, usunięcie, nadpisanie przy upsert) albo null.
export function materialsScope(table, viewer) {
  if (!viewer || !isMaterialsTable(table)) return null;
  const pred = materialsPredicate(table, viewer);
  return { select: pred, update: pred, delete: pred, upsertGuard: materialsPredicate(table, viewer, { withShares: false }) };
}

// Zapis: pliku/folderu w przestrzeni wrażliwej (Finanse, Członkowie…) nie doda ani do niej nie
// przeniesie osoba bez dostępu do tego modułu. Rzuca ApiError(403).
export function enforceMaterialsTeamWrite(q, viewer) {
  if (!viewer || !isMaterialsTable(q.table) || !['insert', 'upsert', 'update'].includes(q.op)) return;
  const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
  for (const r of rows) {
    if ('team_type' in r && isSensitiveMaterialTeam(r.team_type) && !teamVisible(viewer, r.team_type)) {
      throw new ApiError(403, 'Pliki tej przestrzeni dodaje osoba z dostępem do jej modułu');
    }
  }
}

// Realtime: wiersze, które czytający widzi bez sprawdzania udostępnień (własne, ogólne, jego moduły).
export function materialsRealtimeFilter(table, viewer) {
  if (!viewer || !isMaterialsTable(table)) return null;
  const owner = MATERIALS_OWNER_COLUMN[table];
  return (rows) => (rows || []).filter((r) => r && (teamVisible(viewer, r.team_type)
    || (viewer.me && lower(r[owner]) === viewer.me)));
}
