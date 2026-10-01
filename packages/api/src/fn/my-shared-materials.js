// „Udostępnione mi" (Materiały, member-facing) — pliki udostępnione zalogowanemu bezpośrednio
// (target user=e-mail) lub przez jego grupy domowe / grupy członkowskie. Przynależności
// i dopasowanie udostępnień liczy SERWER z req.user — klient nie czyta całej tabeli
// materials_shares ani cudzych przynależności. Odwzorowanie web useShares.fetchSharedWithMe.
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'my-shared-materials';
export const method = 'POST';

const lc = (v) => String(v || '').toLowerCase();

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const empty = { files: [] };
  const email = lc(req.user?.email);
  if (!email) return reply.send(empty);

  try {
    // 1) Grupy domowe (po e-mailu).
    let homeGroupIds = [];
    try {
      const { rows } = await req.db.query(
        `SELECT DISTINCT group_id FROM home_group_members WHERE lower(email) = $1 AND group_id IS NOT NULL`,
        [email]
      );
      homeGroupIds = rows.map((r) => String(r.group_id));
    } catch { /* brak tabeli/kolumny */ }

    // 2) Grupy członkowskie (members po e-mailu → group_members).
    let groupIds = [];
    try {
      const { rows: mem } = await req.db.query('SELECT id FROM members WHERE lower(email) = $1', [email]);
      const memberIds = mem.map((m) => m.id).filter((x) => x != null);
      if (memberIds.length) {
        const { rows: gm } = await req.db.query(
          'SELECT DISTINCT group_id FROM group_members WHERE member_id = ANY($1)',
          [memberIds]
        );
        groupIds = gm.map((r) => String(r.group_id)).filter(Boolean);
      }
    } catch { /* brak tabel */ }

    // 3) Udostępnienia pasujące do użytkownika.
    const shareRows = [];
    try {
      const { rows } = await req.db.query(
        `SELECT file_id, folder_id, permission, target_label FROM materials_shares
          WHERE target_type = 'user' AND lower(target_id) = $1`,
        [email]
      );
      shareRows.push(...rows);
    } catch { /* brak tabeli */ }
    if (homeGroupIds.length) {
      try {
        const { rows } = await req.db.query(
          `SELECT file_id, folder_id, permission, target_label FROM materials_shares
            WHERE target_type = 'home_group' AND target_id = ANY($1)`,
          [homeGroupIds]
        );
        shareRows.push(...rows);
      } catch { /* brak */ }
    }
    if (groupIds.length) {
      try {
        const { rows } = await req.db.query(
          `SELECT file_id, folder_id, permission, target_label FROM materials_shares
            WHERE target_type = 'group' AND target_id = ANY($1)`,
          [groupIds]
        );
        shareRows.push(...rows);
      } catch { /* brak */ }
    }
    if (!shareRows.length) return reply.send(empty);

    const labelByFile = new Map();
    const fileIds = [];
    const folderIds = [];
    for (const s of shareRows) {
      if (s.file_id) {
        fileIds.push(s.file_id);
        if (s.target_label && !labelByFile.has(String(s.file_id))) labelByFile.set(String(s.file_id), s.target_label);
      } else if (s.folder_id) {
        folderIds.push(s.folder_id);
      }
    }

    // 4) Pliki: bezpośrednio udostępnione + z udostępnionych folderów.
    const filesById = new Map();
    const addFiles = (rows, labelFromFolder) => {
      for (const f of rows) {
        if (!filesById.has(String(f.id))) {
          filesById.set(String(f.id), {
            id: f.id,
            name: f.name,
            storage_path: f.storage_path,
            mime_type: f.mime_type,
            file_size: f.file_size,
            folder_id: f.folder_id ?? null,
            created_at: f.created_at ?? null,
            shared_label: labelByFile.get(String(f.id)) ?? labelFromFolder ?? null,
          });
        }
      }
    };
    if (fileIds.length) {
      try {
        const { rows } = await req.db.query(
          `SELECT id, name, storage_path, mime_type, file_size, folder_id, created_at
             FROM materials_files WHERE id = ANY($1)`,
          [fileIds]
        );
        addFiles(rows, null);
      } catch { /* brak */ }
    }
    if (folderIds.length) {
      try {
        const { rows } = await req.db.query(
          `SELECT id, name, storage_path, mime_type, file_size, folder_id, created_at
             FROM materials_files WHERE folder_id = ANY($1)`,
          [folderIds]
        );
        addFiles(rows, 'folder');
      } catch { /* brak */ }
    }

    const files = [...filesById.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pl')
    );
    return reply.send({ files });
  } catch (e) {
    req.log?.error?.(e, 'my-shared-materials failed');
    return reply.send(empty);
  }
}
