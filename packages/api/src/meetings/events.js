// Wydarzenia online / hybrydowe (migracja 099): wydarzenie ↔ spotkanie (meetings.event_id).
//
// Źródłem prawdy jest wydarzenie (meetings.source = 'event'). Po każdym zapisie wydarzenia przez
// /api/db (web, mobilka, dowolny formularz) serwer uzgadnia spotkanie — syncEventMeeting:
//   • format online/hybrid + godzina → spotkanie istnieje i ma termin/nazwę wydarzenia
//     (zmiana terminu: aktualizacja kalendarza u gości, powiadomienie zaproszonych);
//   • format stacjonarny, archiwizacja albo usunięcie wydarzenia → spotkanie odwołane;
//   • brak godziny → spotkania jeszcze nie ma (strona wydarzenia prosi o godzinę).
// Spotkanie z Komunikatora (source 'meeting') ma swoje odbicie w kalendarzu (service.js) —
// zmiana takiego wydarzenia w kalendarzu też przechodzi tędy.
//
// Kto dołącza: każdy, kto WIDZI wydarzenie (te same zasady co /api/db: moduł, kampus, segmenty
// widoczności) — fn event-meeting { event_id, join: true } dopisuje go do rozmowy spotkania.
// Zapisy (event_registrations): konto → uczestnik spotkania (odpowiedź „wezmę udział”), adres
// bez konta → gość z osobistym linkiem e-mailem.
import { ApiError, eventVisibilityClause } from '../dataapi/querybuilder.js';
import { loadVisibilityContext } from '../dataapi/eventVisibility.js';
import { canAccess } from '../dataapi/registry.js';
import { isAppAdmin } from '../dataapi/komunikatorPlus.js';
import { liveCallOf } from '../calls/service.js';
import * as M from './logic.js';
import {
  withTx, activeAccounts, invitesOf, addParticipants, createGuestInvite, systemMessage, notifyMembers,
  emailGuests, background, emitMeeting, namesOf, cancelMeetingInternal,
} from './service.js';
import { emitRows } from '../calls/service.js';

export const ONLINE_FORMATS = new Set(['online', 'hybrid']);
const lower = (v) => String(v ?? '').trim().toLowerCase();
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;
const warn = (ctx, err, msg) => ctx.log?.warn?.({ err }, `meetings/events: ${msg}`);

// Alias tabeli: e. Opis: zwykły tekst albo „Szczegóły” (details_html — kolumna z 042, przez to_jsonb,
// żeby starszy tenant bez niej nie wywracał zapytania).
const EVENT_COLS = `e.id::text AS id, e.title, COALESCE(NULLIF(e.description, ''), to_jsonb(e)->>'details_html') AS description,
  e.date::text AS date, e.time, e.end_time, e.end_date::text AS end_date, e.format, COALESCE(e.is_archived, false) AS is_archived,
  e.created_by, e.module_key, e.campus_id, e.visibility_segments`;

export async function loadEvent(db, eventId) {
  return one(db, `SELECT ${EVENT_COLS} FROM events e WHERE e.id::text = $1`, [String(eventId)]);
}
export async function meetingOfEvent(db, eventId) {
  return one(db, `SELECT * FROM meetings WHERE event_id = $1`, [String(eventId)]);
}

// Organizator spotkania wydarzenia: autor wydarzenia (aktywne konto), inaczej osoba zapisująca.
async function organizerOf(db, ev, actor) {
  const accounts = await activeAccounts(db, [ev.created_by, actor].filter(Boolean));
  if (ev.created_by && accounts.has(lower(ev.created_by))) return lower(ev.created_by);
  return lower(actor) || null;
}

// Zapisany na wydarzenie → zaproszony na spotkanie. Konto: uczestnik rozmowy + „wezmę udział”.
// Adres bez konta: gość z osobistym linkiem (mail). Zwraca { participant?, guest? }.
async function inviteRegistrant(ctx, tx, meeting, { email, name }, invitedBy, accounts) {
  const e = lower(email);
  if (!e || e.startsWith('reczne:') || !M.isEmail(e)) return {};
  if (accounts.has(e)) {
    const parts = await addParticipants(tx, meeting.conversation_id, [{ email: e, role: 'member' }]);
    await tx.query(
      `INSERT INTO meeting_invites (meeting_id, kind, email, response, responded_at, invited_by_email)
       VALUES ($1, 'member', $2, 'accepted', now(), $3)
       ON CONFLICT (meeting_id, email) DO UPDATE SET response = 'accepted', responded_at = now()
         WHERE meeting_invites.response = 'pending'`, [meeting.id, e, invitedBy]);
    return { participant: parts[0] || null };
  }
  const guests = (await tx.query(`SELECT count(*)::int AS n FROM meeting_invites WHERE meeting_id = $1 AND kind = 'guest'`, [meeting.id])).rows[0]?.n ?? 0;
  if (guests >= M.MAX_GUESTS) return {};
  const r = await createGuestInvite(tx, meeting, { email: e, name: M.isEmail(name) ? null : (String(name || '').trim().slice(0, 60) || null) }, invitedBy);
  return r ? { guest: { ...r.invite, token: r.link.token } } : {};
}

async function registrationsOf(db, eventId) {
  try {
    const { rows } = await db.query(
      `SELECT user_email AS email, full_name AS name FROM event_registrations
        WHERE event_id::text = $1 AND COALESCE(status, 'going') NOT IN ('cancelled', 'not_going')`, [String(eventId)]);
    return rows;
  } catch {
    return []; // tenant bez zapisów
  }
}

// ── Uzgadnianie wydarzenie → spotkanie ──────────────────────────────────────
// deleted: wiersz wydarzenia już usunięty (op delete) — spotkanie odwołane.
export async function syncEventMeeting(ctx, eventId, actor, { deleted = false } = {}) {
  const { db } = ctx;
  const ev = deleted ? null : await loadEvent(db, eventId);
  const meeting = await meetingOfEvent(db, eventId);
  const wantsOnline = !!ev && ONLINE_FORMATS.has(ev.format) && !ev.is_archived;

  if (!wantsOnline) {
    if (meeting?.status === 'scheduled') {
      await cancelMeetingInternal(ctx, meeting, actor, {
        note: deleted || ev?.is_archived ? 'Wydarzenie usunięte — spotkanie online odwołane' : 'Wydarzenie zmieniono na stacjonarne — spotkanie online odwołane',
      });
      return { status: 'cancelled' };
    }
    return { status: 'none' };
  }
  const times = M.eventTimes(ev);
  if (!times) return { status: 'needs_time', meeting_id: meeting?.id || null };
  const title = M.normalizeTitle(ev.title) || 'Spotkanie online';
  const description = M.plainText(ev.description);

  if (!meeting) return createEventMeeting(ctx, ev, { title, description, ...times }, actor);

  const timeChanged = Date.parse(meeting.starts_at) !== Date.parse(times.starts_at) || Date.parse(meeting.ends_at) !== Date.parse(times.ends_at);
  const titleChanged = meeting.title !== title;
  const reopened = meeting.status === 'cancelled';
  const descChanged = (meeting.description || null) !== description;
  if (!timeChanged && !titleChanged && !reopened && !descChanged) return { status: 'ok', meeting_id: meeting.id };

  const { updated, conv, reissued } = await withTx(db, async (tx) => {
    const updatedRow = await one(tx,
      `UPDATE meetings SET title = $2, description = $3, starts_at = $4, ends_at = $5,
              status = 'scheduled', cancelled_at = NULL,
              sequence = sequence + CASE WHEN $6 THEN 1 ELSE 0 END,
              reminder_sent_at = CASE WHEN $7 THEN NULL ELSE reminder_sent_at END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [meeting.id, title, description, times.starts_at, times.ends_at, timeChanged || titleChanged || reopened, timeChanged || reopened]);
    const convRow = titleChanged
      ? await one(tx, `UPDATE conversations SET name = $2, updated_at = now() WHERE id = $1 RETURNING *`, [meeting.conversation_id, title])
      : null;
    await tx.query(
      `UPDATE call_guest_links SET expires_at = $2::timestamptz + $3 * interval '1 second'
        WHERE meeting_id = $1 AND revoked_at IS NULL`, [meeting.id, times.ends_at, M.LINK_GRACE_SEC]);
    // Ponownie online (po odwołaniu): goście dostają nowe linki (stare wyłączono przy odwołaniu).
    const fresh = [];
    if (reopened) {
      const guests = (await tx.query(
        `SELECT * FROM meeting_invites WHERE meeting_id = $1 AND kind = 'guest' AND response <> 'declined'`, [meeting.id])).rows;
      for (const g of guests) {
        await tx.query(`DELETE FROM meeting_invites WHERE id = $1`, [g.id]);
        const r = await createGuestInvite(tx, updatedRow, { email: g.email, name: g.name }, g.invited_by_email);
        if (r) fresh.push({ ...r.invite, token: r.link.token });
      }
    }
    return { updated: updatedRow, conv: convRow, reissued: fresh };
  });
  if (conv) await emitRows(ctx, 'conversations', 'update', [conv]);
  await emitMeeting(ctx, updated);
  const short = M.formatShort(updated.starts_at);
  if (timeChanged || reopened) {
    await systemMessage(ctx, updated.conversation_id, lower(actor) || updated.organizer_email,
      reopened ? `Spotkanie online wznowione: ${short}` : `Zmieniono termin spotkania: ${short}`);
  }
  const invites = await invitesOf(db, updated.id);
  const members = invites.filter((i) => i.kind === 'member' && i.response !== 'declined' && i.email !== lower(actor)).map((i) => i.email);
  const guests = invites.filter((i) => i.kind === 'guest' && i.response !== 'declined' && i.email_sent_at && !reissued.some((r) => r.id === i.id));
  await background(ctx, async () => {
    if (timeChanged || titleChanged || reopened) {
      await notifyMembers(ctx, updated, members, {
        title: reopened ? `Spotkanie online: ${updated.title}` : `Zmiana spotkania: ${updated.title}`, body: `Termin: ${short}`,
      });
    }
    if (reissued.length) await emailGuests(ctx, updated, reissued, 'invite');
    if ((timeChanged || titleChanged || descChanged) && guests.length) await emailGuests(ctx, updated, guests, 'update');
  });
  return { status: 'ok', meeting_id: updated.id };
}

async function createEventMeeting(ctx, ev, input, actor) {
  const { db } = ctx;
  const organizer = await organizerOf(db, ev, actor);
  if (!organizer) return { status: 'none' };
  const registrants = await registrationsOf(db, ev.id);
  const accounts = await activeAccounts(db, [organizer, lower(actor), ...registrants.map((r) => r.email)]);
  const created = await withTx(db, async (tx) => {
    // Wyścig dwóch zapisów — drugi zobaczy spotkanie i nic nie utworzy.
    const existing = await one(tx, `SELECT * FROM meetings WHERE event_id = $1`, [ev.id]);
    if (existing) return { existing };
    const conv = await one(tx,
      `INSERT INTO conversations (type, name, posting_policy, created_by) VALUES ('meeting', $1, 'everyone', $2) RETURNING *`,
      [input.title, organizer]);
    const admins = [...new Set([organizer, lower(actor)].filter((e) => e && accounts.has(e)))];
    const parts = await addParticipants(tx, conv.id, admins.map((e) => ({ email: e, role: 'admin' })));
    const meeting = await one(tx,
      `INSERT INTO meetings (conversation_id, title, description, starts_at, ends_at, kind, organizer_email, event_id, source)
       VALUES ($1, $2, $3, $4, $5, 'video', $6, $7, 'event') RETURNING *`,
      [conv.id, input.title, input.description, input.starts_at, input.ends_at, organizer, ev.id]);
    await tx.query(
      `INSERT INTO meeting_invites (meeting_id, kind, email, response, responded_at, invited_by_email)
       VALUES ($1, 'member', $2, 'accepted', now(), $2)`, [meeting.id, organizer]);
    const guests = [];
    for (const r of registrants) {
      const out = await inviteRegistrant(ctx, tx, meeting, r, organizer, accounts);
      if (out.participant) parts.push(out.participant);
      if (out.guest) guests.push(out.guest);
    }
    return { conv, parts, meeting, guests };
  });
  if (created.existing) return { status: 'ok', meeting_id: created.existing.id };
  const { conv, parts, meeting, guests } = created;
  await emitRows(ctx, 'conversations', 'insert', [conv]);
  await emitRows(ctx, 'conversation_participants', 'insert', parts);
  await emitMeeting(ctx, meeting);
  await systemMessage(ctx, conv.id, organizer, `Spotkanie online do wydarzenia: ${M.formatShort(meeting.starts_at)}. Dołączyć może każdy, kto widzi wydarzenie.`);
  await background(ctx, async () => {
    if (guests.length) await emailGuests(ctx, meeting, guests, 'invite');
  });
  return { status: 'ok', meeting_id: meeting.id, created: true };
}

// Hook po zapisie events przez /api/db (routes.js) — w tle, błędy tylko w logu.
export function syncEventsAfterWrite(ctx, op, rows, actor) {
  const list = (rows || []).filter((r) => r && r.id != null);
  if (!list.length) return;
  Promise.resolve().then(async () => {
    for (const r of list) {
      const id = String(r.id);
      // Szybkie odrzucenie: wiersz wprost stacjonarny i bez spotkania. Zapis z select('id') nie zwraca
      // formatu — wtedy uzgadniamy (syncEventMeeting sam wczyta wydarzenie).
      if (op !== 'delete' && r.format === 'in_person' && !(await meetingOfEvent(ctx.db, id))) continue;
      await syncEventMeeting(ctx, id, actor, { deleted: op === 'delete' }).catch((err) => warn(ctx, err, `wydarzenie ${id}`));
    }
  }).catch((err) => warn(ctx, err, 'synchronizacja'));
}

// Hook po zapisie event_registrations: nowy zapis na wydarzenie online → zaproszenie na spotkanie;
// wypisanie → odpowiedź „nie wezmę udziału”.
export function syncRegistrationsAfterWrite(ctx, op, rows, actor) {
  const list = (rows || []).filter((r) => r && r.event_id != null && r.user_email);
  if (!list.length) return;
  Promise.resolve().then(async () => {
    for (const r of list) {
      const meeting = await meetingOfEvent(ctx.db, String(r.event_id));
      if (!meeting || meeting.status !== 'scheduled') continue;
      const email = lower(r.user_email);
      if (op === 'delete' || ['cancelled', 'not_going'].includes(r.status)) {
        await ctx.db.query(
          `UPDATE meeting_invites SET response = 'declined', responded_at = now() WHERE meeting_id = $1 AND email = $2`, [meeting.id, email]);
        continue;
      }
      const accounts = await activeAccounts(ctx.db, [email]);
      const out = await withTx(ctx.db, (tx) => inviteRegistrant(ctx, tx, meeting, { email, name: r.full_name }, lower(actor) || meeting.organizer_email, accounts));
      if (out.participant) await emitRows(ctx, 'conversation_participants', 'insert', [out.participant]);
      if (out.guest) await background(ctx, () => emailGuests(ctx, meeting, [out.guest], 'invite'));
      await emitMeeting(ctx, meeting);
    }
  }).catch((err) => warn(ctx, err, 'zapisy'));
}

// ── Dostęp do wydarzenia (jak /api/db) ──────────────────────────────────────
export async function visibleEventFor(ctx, user, eventId) {
  const { db } = ctx;
  const me = lower(user?.email);
  const u = await one(db, `SELECT id, email, role, is_super_admin, campus_id, member_id FROM app_users WHERE lower(email) = $1 LIMIT 1`, [me]);
  if (!u) throw new ApiError(403, 'Brak konta', 'NO_ACCOUNT');
  const access = await canAccess({ pool: db, dbName: ctx.tenant?.dbName, table: 'events', op: 'select', user: u, allowModuleScope: true });
  if (!access.ok) throw new ApiError(403, 'Nie masz dostępu do tego wydarzenia', 'EVENT_FORBIDDEN');
  const admin = !!u.is_super_admin || (await isAppAdmin(db, me));
  const params = [String(eventId)];
  const push = (v) => { params.push(v); return params.length; };
  const where = [`e.id::text = $1`];
  if (!admin) {
    if (u.campus_id != null) where.push(`(e.campus_id = $${push(u.campus_id)} OR e.campus_id IS NULL)`);
    const vis = await loadVisibilityContext(db, { email: u.email, role: u.role, campus_id: u.campus_id, member_id: u.member_id });
    where.push(eventVisibilityClause(vis, 'e', push));
    if (access.moduleScope?.modules) where.push(`e.module_key = ANY($${push(access.moduleScope.modules)}::text[])`);
  }
  const ev = await one(db, `SELECT ${EVENT_COLS} FROM events e WHERE ${where.join(' AND ')}`, params);
  if (!ev) throw new ApiError(404, 'Nie znaleziono wydarzenia', 'NOT_FOUND');
  return { ev, me };
}

// event-meeting { event_id, join?: true } → { status, meeting?, conversation_id?, joined? }
//   status: 'none' (stacjonarne) | 'needs_time' | 'scheduled' | 'cancelled'
export async function eventMeeting(ctx, user, body = {}) {
  const { db } = ctx;
  const { ev, me } = await visibleEventFor(ctx, user, body.event_id);
  if (!ONLINE_FORMATS.has(ev.format)) return { status: 'none' };
  let meeting = await meetingOfEvent(db, ev.id);
  // Spotkania jeszcze nie ma (np. wydarzenie sprzed 099 albo dodana godzina) — uzgodnij teraz.
  // Bez osoby wywołującej: oglądający nie zostaje administratorem czatu (organizator = autor wydarzenia).
  if (!meeting && M.eventTimes(ev)) {
    await syncEventMeeting(ctx, ev.id, null);
    meeting = await meetingOfEvent(db, ev.id);
  }
  if (!meeting) return { status: 'needs_time' };
  if (meeting.status === 'cancelled') return { status: 'cancelled', meeting_id: meeting.id };
  let joined = false;
  if (body.join === true) {
    if (!meeting) throw new ApiError(409, 'Spotkanie nie jest gotowe', 'NOT_READY');
    const parts = await addParticipants(db, meeting.conversation_id, [{ email: me, role: 'member' }]);
    await db.query(
      `INSERT INTO meeting_invites (meeting_id, kind, email, invited_by_email) VALUES ($1, 'member', $2, $2)
       ON CONFLICT (meeting_id, email) DO NOTHING`, [meeting.id, me]);
    if (parts.length) await emitRows(ctx, 'conversation_participants', 'insert', parts);
    joined = true;
  }
  const participant = !!(await one(db,
    `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND lower(user_email) = $2`, [meeting.conversation_id, me]));
  const live = await liveCallOf(db, meeting.conversation_id);
  const names = await namesOf(db, [meeting.organizer_email]);
  const invited = (await invitesOf(db, meeting.id)).filter((i) => i.response !== 'declined').length;
  return {
    status: 'scheduled',
    joined,
    meeting: {
      id: meeting.id,
      conversation_id: participant ? meeting.conversation_id : null,
      title: meeting.title,
      starts_at: meeting.starts_at,
      ends_at: meeting.ends_at,
      kind: meeting.kind,
      call_live: !!live,
      call_id: participant && live ? live.id : null,
      organizer_name: names.get(lower(meeting.organizer_email)) || null,
      participant,
      invited,
    },
  };
}

