// /api/db: odnośniki do plików w chmurze (Faza 3 integracji, migracja 120) — materials_files
// (kolumny external_*) i załączniki wiadomości (messages.attachments, kind 'cloud'). Biała lista
// dostawców i hostów https, autor z sesji, wyłączenie dostawcy przez kościół; zwykłe załączniki
// wiadomości — tylko ścieżka /storage/… albo http(s) (nigdy javascript:/data:). Dla każdego, także
// administratora (src/integrations/cloudFiles.js → enforceCloudLinks).
import { ApiError } from './querybuilder.js';
import { enforceCloudLinks } from '../integrations/cloudFiles.js';

export const CLOUD_LINK_TABLES = new Set(['materials_files', 'messages']);

export async function enforceCloudLinkWrite(q, req, opts) {
  if (!CLOUD_LINK_TABLES.has(q.table)) return;
  try {
    await enforceCloudLinks(q, req, opts);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e.status || 400, e.message, e.code || null);
  }
}
