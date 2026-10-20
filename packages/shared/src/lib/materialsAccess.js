// Pliki (Materiały) przestrzeni wrażliwych — jedna reguła dla api i weba (audyt uprawnień 2026-10, r5).
//
// Pliki modułu leżą w materials_files.team_type = klucz modułu, a w storage pod ścieżką
// materials/<team_type>/… (useMaterials, EventMaterialsTab, mobilka). Bucket „materials” jest
// czytany zwykłym adresem (<img src>, podgląd PDF), ale przestrzenie Finansów, Członków, Opieki
// i Dawania trzymają dokumenty osobowe i finansowe — tam:
//   • wiersze widzi tylko osoba z dostępem do modułu (module:<team_type>) albo autor pliku,
//     bez wyjątków „udostępnione mi” / „materiał wydarzenia” (dataapi/materialsScope.js),
//   • plik czyta się wyłącznie podpisanym, krótko ważnym linkiem (storage/routes.js), który
//     serwer wydaje tylko z tym samym dostępem do modułu.
export const SENSITIVE_MATERIAL_TEAMS = ['finance', 'members', 'care', 'giving'];

export const isSensitiveMaterialTeam = (team) => SENSITIVE_MATERIAL_TEAMS.includes(String(team ?? ''));

// Przestrzeń (team_type) z ścieżki w buckecie materials: pierwszy segment ścieżki.
export function materialsPathTeam(storagePath) {
  return String(storagePath ?? '').replace(/^\/+/, '').split('/')[0] || null;
}

// Czy plik z bucketu materials czyta się tylko podpisanym linkiem.
export const isSignedMaterialsPath = (storagePath) => isSensitiveMaterialTeam(materialsPathTeam(storagePath));
