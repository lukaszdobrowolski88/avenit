// Kolejka synchronizacji kalendarzy (migracja 119) — lekki moduł bez zależności, żeby mogły go
// wołać miejsca zapisu wydarzeń (dataapi/routes.js, fn, meetings/service.js) bez cykli importów.
//
// Zapis wydarzenia / grafiku / zapisu na wydarzenie → id wydarzenia do calendar_sync_queue.
// Worker co minutę (calendarSync.runCalendarSync) zbiera kolejkę (debounce: wiele zapisów = jedno
// uzgodnienie) i wysyła zmiany do kalendarzy osób i kościoła. Bez żadnego kalendarza docelowego
// (albo przed migracją 119) — nic nie robi.

const TABLE_EVENT_ID = {
  events: (r) => r?.id,
  schedule_assignments: (r) => r?.event_id,
  event_registrations: (r) => r?.event_id,
};

export async function enqueueCalendarSync(db, eventIds, reason = null) {
  const ids = [...new Set((eventIds || []).filter((v) => v != null && v !== '').map(String))];
  if (!ids.length) return 0;
  try {
    const { rows } = await db.query(`SELECT 1 FROM calendar_sync_targets WHERE enabled LIMIT 1`);
    if (!rows.length) return 0;
    await db.query(
      `INSERT INTO calendar_sync_queue (event_id, reason) SELECT unnest($1::text[]), $2`, [ids, reason ? String(reason).slice(0, 40) : null]);
    return ids.length;
  } catch {
    return 0; // tenant przed migracją 119
  }
}

// Pełne uzgodnienie jednego kalendarza (np. zmiana preferencji).
export async function enqueueTargetFull(db, targetId, reason = 'full') {
  try {
    await db.query(`UPDATE calendar_sync_targets SET needs_full = true, updated_at = now() WHERE id = $1`, [targetId]);
    await db.query(`INSERT INTO calendar_sync_queue (target_id, reason) VALUES ($1, $2)`, [targetId, reason]);
  } catch { /* przed migracją 119 */ }
}

// Hook po zapisie przez /api/db — w tle, nigdy nie rzuca.
export function enqueueCalendarAfterWrite(db, table, op, rows, log) {
  const pick = TABLE_EVENT_ID[table];
  if (!pick || op === 'select') return;
  const ids = (rows || []).map(pick).filter((v) => v != null);
  if (!ids.length) return;
  enqueueCalendarSync(db, ids, `${table}:${op}`).catch((err) => log?.warn?.({ err }, 'calendar queue failed'));
}
