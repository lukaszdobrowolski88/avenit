// „Planowane pieśni" (member-facing, read-only) — nadchodzące programy wraz z listą
// zaproponowanych pieśni. Dla członka służby (worship/media), który nie ma grantu
// res:program_song_suggestions:read; fn czyta serwerowo (bez zmiany uprawnień).
// Tylko podgląd — bez dodawania/zmiany (to zostaje w panelu liderskim / web).
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'program-songs-preview';
export const method = 'POST';

// Pieśni z planu programu (schedule): punkty typu „song” — z selectedSongs (wiele pieśni w punkcie)
// albo songId/songKey. Gdy lider nie dodał osobnych propozycji, to jest setlista nabożeństwa
// (wcześniej ekran „Planowane pieśni” był pusty, choć program miał pieśni).
export function songsFromSchedule(schedule) {
  const out = [];
  for (const item of Array.isArray(schedule) ? schedule : []) {
    if (!item || item.type !== 'song') continue;
    const picked = Array.isArray(item.selectedSongs) && item.selectedSongs.length
      ? item.selectedSongs
      : [{ songId: item.songId ?? null, key: item.songKey ?? null }];
    for (const s of picked) {
      const songId = s?.songId ?? null;
      if (songId == null && !item.title) continue;
      out.push({ songId, key: s?.key ?? item.songKey ?? null, title: picked.length === 1 ? item.title || null : null, note: null });
    }
  }
  return out;
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const empty = { programs: [] };
  if (!req.user?.email) return reply.send(empty);

  try {
    const { rows: progs } = await req.db.query(
      `SELECT id, title, to_char(date,'YYYY-MM-DD') AS date, schedule
         FROM programs
        WHERE date >= CURRENT_DATE
        ORDER BY date ASC
        LIMIT 12`
    );
    if (!progs.length) return reply.send(empty);

    const ids = progs.map((p) => p.id);
    let sugg = [];
    try {
      const { rows } = await req.db.query(
        `SELECT program_id, song_id, song_key, note, sort_order
           FROM program_song_suggestions
          WHERE program_id = ANY($1)
          ORDER BY sort_order ASC NULLS LAST`,
        [ids]
      );
      sugg = rows;
    } catch {
      sugg = [];
    }

    const fromSchedule = new Map(progs.map((p) => [String(p.id), songsFromSchedule(p.schedule)]));
    const songIds = [...new Set([
      ...sugg.map((s) => s.song_id),
      ...[...fromSchedule.values()].flat().map((s) => s.songId),
    ].filter((x) => x != null))];
    const songById = new Map();
    if (songIds.length) {
      try {
        const { rows } = await req.db.query('SELECT id, title, key FROM songs WHERE id = ANY($1)', [songIds]);
        for (const r of rows) songById.set(String(r.id), { title: r.title, key: r.key ?? null });
      } catch { /* bez tytułów */ }
    }

    const byProgram = new Map();
    for (const s of sugg) {
      const pid = String(s.program_id);
      if (!byProgram.has(pid)) byProgram.set(pid, []);
      const sn = songById.get(String(s.song_id));
      byProgram.get(pid).push({
        songId: s.song_id ?? null,
        title: sn?.title ?? 'Pieśń',
        key: s.song_key ?? sn?.key ?? null,
        note: s.note ?? null,
      });
    }

    const programs = progs.map((p) => {
      const suggested = byProgram.get(String(p.id));
      const songs = suggested?.length ? suggested : (fromSchedule.get(String(p.id)) ?? []).map((s) => {
        const sn = s.songId != null ? songById.get(String(s.songId)) : null;
        return { songId: s.songId, title: sn?.title ?? s.title ?? 'Pieśń', key: s.key ?? sn?.key ?? null, note: s.note };
      });
      return { id: p.id, title: p.title, date: p.date, songs };
    });
    return reply.send({ programs });
  } catch (e) {
    req.log?.error?.(e, 'program-songs-preview failed');
    return reply.send(empty);
  }
}
