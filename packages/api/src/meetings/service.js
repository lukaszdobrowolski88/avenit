// Spotkania online z zaproszeniami (migracja 098) — jak spotkania w Teams.
//
// Spotkanie = rozmowa typu 'meeting' (czat + połączenie LiveKit z src/calls) z terminem.
//   • członkowie (po koncie) — uczestnicy rozmowy, powiadomienie w aplikacji + push,
//     odpowiedź „Wezmę udział / Może / Nie” (meeting-respond);
//   • goście (po e-mailu) — osobisty link /rozmowa/<token> (call_guest_links z meeting_id),
//     mail w marce z plikiem kalendarza; odpowiedź ze strony gościa (meeting-guest-rsvp).
// Konto z adresem podanym jako „gość” zostaje zaproszone jako członek (po koncie).
//
// Uprawnienia: zakłada każdy z dostępem do Komunikatora; zmienia i odwołuje organizator,
// administrator rozmowy spotkania albo administrator aplikacji. Goście — nigdy, gdy na spotkaniu
// jest osoba niepełnoletnia (jak linki gości w 097). Limit: 50 gości na spotkanie i 200 zaproszeń
// e-mail na osobę na dobę (ochrona przed wysyłką spamu z domeny kościoła).
//
// fn: meeting-create / meeting-update / meeting-cancel / meeting-respond / meeting-get /
//     meeting-list / meeting-ics; publiczne meeting-guest-rsvp; worker meeting-reminders.
import { randomBytes } from 'node:crypto';
import { ApiError } from '../dataapi/querybuilder.js';
import { isMember } from '../dataapi/komunikator.js';
import { minorEmails, isAppAdmin } from '../dataapi/komunikatorPlus.js';
import { deliverNotifications } from '../dataapi/boardNotify.js';
import { messageLink } from '../realtime/push-hooks.js';
import { logAccountEvent } from '../lib/account-audit.js';
import { sendEmail } from '../lib/email.js';
import { rsvpBase } from '../fn/rsvp-send.js';
import { callDeps, emitRows, liveCallOf, assertEnabled, getCall } from '../calls/service.js';
import { churchName, linkPath, MESSAGES as GUEST_MESSAGES } from '../calls/guests.js';
import * as L from '../calls/logic.js';
import * as M from './logic.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;
const warn = (ctx, err, msg) => ctx.log?.warn?.({ err }, `meetings: ${msg}`);
const audit = (db, actor, action, detail) => logAccountEvent(db, { email: actor, action, actor, detail });

export const MESSAGES = {
  minorsGuests: 'Ze względu na ochronę dzieci i młodzieży nie można zapraszać gości na spotkanie, w którym uczestniczy osoba niepełnoletnia.',
  forbidden: 'Spotkanie zmienia jego organizator albo administrator.',
  notFound: 'Nie znaleziono spotkania.',
  cancelled: 'To spotkanie zostało odwołane.',
  notInvited: 'Nie masz zaproszenia na to spotkanie.',
  unknownMembers: 'Nie znaleziono kont: ',
  guestLimit: 'Wysłano dziś zbyt wiele zaproszeń e-mail. Spróbuj jutro albo zaproś mniej gości.',
  fromEvent: 'To spotkanie jest częścią wydarzenia — termin, osoby i odwołanie zmienisz na stronie wydarzenia.',
};

// Odbicie spotkania z Komunikatora w Kalendarzu: wydarzenie online widoczne dla uczestników
// spotkania (segment 'meeting'). Termin w strefie kościoła.
export const MEETING_SEGMENTS = JSON.stringify([{ type: 'meeting', label: 'Uczestnicy spotkania' }]);
export function eventFieldsOf(meeting) {
  const s = M.utcToZoned(meeting.starts_at);
  const e = M.utcToZoned(meeting.ends_at);
  return { title: meeting.title, description: meeting.description || null, date: s.date, time: s.time, end_time: e.time, end_date: e.date !== s.date ? e.date : null };
}
async function mirrorEvent(db, meeting, { archive = false } = {}) {
  if (!meeting?.event_id || meeting.source !== 'meeting') return;
  if (archive) {
    await db.query(`UPDATE events SET is_archived = true WHERE id::text = $1`, [meeting.event_id]);
    return;
  }
  const f = eventFieldsOf(meeting);
  await db.query(
    `UPDATE events SET title = $2, description = $3, date = $4::date, time = $5, end_time = $6, end_date = $7::date
      WHERE id::text = $1`,
    [meeting.event_id, f.title, f.description, f.date, f.time, f.end_time, f.end_date]);
}

// ── Kontekst ────────────────────────────────────────────────────────────────
export function meetingDeps(extra = {}) {
  return { ...callDeps(), sendEmail, deliver: deliverNotifications, ...extra };
}

export function meetingCtxFromRequest(req) {
  return {
    db: req.db,
    tenantSlug: req.tenant?.slug,
    tenant: {
      name: req.tenant?.name || '', slug: req.tenant?.slug, subdomain: req.tenant?.subdomain || req.tenant?.slug,
      dbName: req.tenant?.db_name, blocked: !!req.tenantBlocked,
    },
    log: req.log,
    deps: meetingDeps(),
  };
}

export async function runMeetingFn(req, reply, action) {
  try {
    return reply.send(await action(meetingCtxFromRequest(req), req.user, req.body || {}));
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) {
      return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    req.log?.error?.({ err }, 'meetings: błąd');
    return reply.code(500).send({ error: 'Nie udało się zapisać spotkania. Spróbuj ponownie.' });
  }
}

const originOf = (ctx) => rsvpBase(ctx.tenant?.subdomain || ctx.tenantSlug);
export const guestJoinUrl = (ctx, token) => `${originOf(ctx)}${linkPath(token)}`;

// Transakcja, gdy pula ją daje (pg.Pool / atrapa w testach); inaczej zapytania po kolei.
export async function withTx(db, fn) {
  if (typeof db.connect !== 'function') return fn(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Odczyt ──────────────────────────────────────────────────────────────────
export async function namesOf(db, emails) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  const out = new Map();
  if (!list.length) return out;
  const { rows } = await db.query(
    `SELECT lower(email) AS e, COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS n
       FROM app_users WHERE lower(email) = ANY($1::text[])`, [list]);
  for (const r of rows) if (!out.has(r.e)) out.set(r.e, r.n);
  return out;
}

export async function activeAccounts(db, emails) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await db.query(
    `SELECT lower(email) AS e, COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS n
       FROM app_users WHERE lower(email) = ANY($1::text[]) AND COALESCE(is_active, true) = true`, [list]);
  return new Map(rows.map((r) => [r.e, r.n]));
}

export async function meetingById(db, id) {
  if (!UUID_RE.test(String(id ?? ''))) return null;
  return one(db, `SELECT * FROM meetings WHERE id = $1`, [String(id)]);
}
async function meetingByConversation(db, conversationId) {
  if (!UUID_RE.test(String(conversationId ?? ''))) return null;
  return one(db, `SELECT * FROM meetings WHERE conversation_id = $1`, [String(conversationId)]);
}
export async function invitesOf(db, meetingId) {
  return (await db.query(`SELECT * FROM meeting_invites WHERE meeting_id = $1 ORDER BY kind, created_at`, [meetingId])).rows;
}

// Kto zarządza: organizator, administrator rozmowy spotkania, administrator aplikacji.
async function canManage(db, meeting, me) {
  if (lower(meeting.organizer_email) === me) return true;
  if ((await isMember(db, meeting.conversation_id, me))?.role === 'admin') return true;
  return isAppAdmin(db, me);
}

async function loadForParticipant(db, me, body) {
  const meeting = body.meeting_id ? await meetingById(db, body.meeting_id) : await meetingByConversation(db, body.conversation_id);
  if (!meeting) throw new ApiError(404, MESSAGES.notFound, 'NOT_FOUND');
  const member = await isMember(db, meeting.conversation_id, me);
  if (!member) throw new ApiError(403, MESSAGES.notInvited, 'NOT_INVITED');
  return { meeting, member };
}

async function loadForManager(db, me, body) {
  const meeting = await meetingById(db, body.meeting_id);
  if (!meeting) throw new ApiError(404, MESSAGES.notFound, 'NOT_FOUND');
  if (!(await canManage(db, meeting, me))) throw new ApiError(403, MESSAGES.forbidden, 'MEETING_FORBIDDEN');
  return meeting;
}

// Widok spotkania. E-maile gości tylko dla zarządzających.
export async function meetingView(db, meeting, me, { manage = null } = {}) {
  const invites = await invitesOf(db, meeting.id);
  const names = await namesOf(db, [meeting.organizer_email, ...invites.filter((i) => i.kind === 'member').map((i) => i.email)]);
  const canEdit = manage ?? (await canManage(db, meeting, me));
  const mine = invites.find((i) => i.kind === 'member' && i.email === me);
  const live = meeting.status === 'scheduled' ? await liveCallOf(db, meeting.conversation_id) : null;
  return {
    id: meeting.id,
    conversation_id: meeting.conversation_id,
    title: meeting.title,
    description: meeting.description,
    starts_at: meeting.starts_at,
    ends_at: meeting.ends_at,
    kind: meeting.kind,
    status: meeting.status,
    event_id: meeting.event_id || null,
    source: meeting.source || 'meeting',
    guests_auto_admit: !!meeting.guests_auto_admit,
    organizer: { email: meeting.organizer_email, name: names.get(lower(meeting.organizer_email)) || meeting.organizer_email },
    can_manage: !!canEdit,
    my_response: mine?.response || null,
    call_live: !!live,
    call_id: live?.id || null,
    members: invites.filter((i) => i.kind === 'member').map((i) => ({
      email: i.email, name: names.get(i.email) || i.name || i.email, response: i.response,
      organizer: i.email === lower(meeting.organizer_email),
    })),
    guests: invites.filter((i) => i.kind === 'guest').map((i) => ({
      id: i.id, name: i.name || M.nameFromEmail(i.email), response: i.response,
      ...(canEdit ? { email: i.email, email_sent: !!i.email_sent_at } : {}),
    })),
  };
}

// ── Zapis ───────────────────────────────────────────────────────────────────
export async function addParticipants(db, conversationId, entries) {
  if (!entries.length) return [];
  const { rows } = await db.query(
    `INSERT INTO conversation_participants (conversation_id, user_email, role)
     SELECT $1, t.e, t.r FROM unnest($2::text[], $3::text[]) AS t(e, r)
     ON CONFLICT (conversation_id, user_email) DO NOTHING RETURNING *`,
    [conversationId, entries.map((e) => e.email), entries.map((e) => e.role)]);
  return rows;
}

export async function createGuestInvite(db, meeting, guest, me) {
  const invite = await one(db,
    `INSERT INTO meeting_invites (meeting_id, kind, email, name, invited_by_email)
     VALUES ($1, 'guest', $2, $3, $4) ON CONFLICT (meeting_id, email) DO NOTHING RETURNING *`,
    [meeting.id, guest.email, guest.name || M.nameFromEmail(guest.email), me]);
  if (!invite) return null;
  const link = await one(db,
    `INSERT INTO call_guest_links (conversation_id, token, created_by_email, auto_admit, show_title, expires_at,
                                   meeting_id, invite_id, guest_name)
     VALUES ($1, $2, $3, $4, true, $5::timestamptz + $6 * interval '1 second', $7, $8, $9) RETURNING *`,
    [meeting.conversation_id, randomBytes(32).toString('base64url'), me, !!meeting.guests_auto_admit,
      meeting.ends_at, M.LINK_GRACE_SEC, meeting.id, invite.id, invite.name]);
  return one(db, `UPDATE meeting_invites SET guest_link_id = $2 WHERE id = $1 RETURNING *`, [invite.id, link.id])
    .then((row) => ({ invite: row, link }));
}

export async function revokeGuestLinks(ctx, db, where, params) {
  const { rows } = await db.query(
    `UPDATE call_guest_links SET revoked_at = now(), revoked_by_email = 'meeting'
      WHERE revoked_at IS NULL AND ${where} RETURNING id`, params);
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const { rows: expired } = await db.query(
    `UPDATE call_guest_requests SET status = 'expired', updated_at = now()
      WHERE link_id = ANY($1::uuid[]) AND status IN ('pending', 'admitted') RETURNING *`, [ids]);
  // Goście w trwającym połączeniu — rozłącz (najlepszy wysiłek).
  for (const r of expired.filter((x) => x.call_id && x.joined_at && !x.left_at)) {
    const call = await getCall(db, r.call_id);
    if (call && L.isLive(call.status) && ctx.deps?.livekit?.removeParticipant) {
      Promise.resolve().then(() => ctx.deps.livekit.removeParticipant(call.room_name, r.identity)).catch(() => {});
    }
  }
  return expired;
}

export async function guestQuotaLeft(db, me) {
  const r = await one(db,
    `SELECT count(*)::int AS n FROM meeting_invites
      WHERE kind = 'guest' AND invited_by_email = $1 AND created_at > now() - interval '1 day'`, [me]);
  return M.GUEST_EMAILS_PER_DAY - (r?.n ?? 0);
}

export async function assertGuestsAllowed(db, people) {
  if ((await minorEmails(db, people)).size > 0) throw new ApiError(403, MESSAGES.minorsGuests, 'GUESTS_MINORS');
}

export async function systemMessage(ctx, conversationId, sender, content) {
  try {
    const msg = await one(ctx.db,
      `INSERT INTO messages (conversation_id, sender_email, content, message_type) VALUES ($1, $2, $3, 'system') RETURNING *`,
      [conversationId, sender, content]);
    await emitRows(ctx, 'messages', 'insert', [msg]);
    const conv = await one(ctx.db,
      `UPDATE conversations SET last_message_at = now(), last_message_preview = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [conversationId, content]).catch(() => null);
    if (conv) await emitRows(ctx, 'conversations', 'update', [conv]);
  } catch (err) {
    warn(ctx, err, 'wiadomość systemowa');
  }
}

// Powiadomienia członków (dzwonek + push). type 'meeting', link do rozmowy spotkania.
export async function notifyMembers(ctx, meeting, emails, { title, body }) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  if (!list.length) return;
  const deliver = ctx.deps?.deliver || deliverNotifications;
  try {
    await deliver({
      db: ctx.db,
      tenant: { slug: ctx.tenantSlug },
      log: ctx.log,
      entries: list.map((e) => ({
        user_email: e, type: 'meeting', title, body, link: messageLink(meeting.conversation_id),
        data: { meeting_id: meeting.id, conversation_id: meeting.conversation_id },
      })),
      deps: { sendPush: ctx.deps.sendPush, emit: ctx.deps.emit },
      dedupeMinutes: 0,
    });
  } catch (err) {
    warn(ctx, err, 'powiadomienia');
  }
}

// Maile do gości: invite/update/reminder z .ics REQUEST, cancel z .ics CANCEL. Stempel wysyłki
// dopiero po udanej wysyłce. Błąd jednego adresu nie zatrzymuje pozostałych.
export async function emailGuests(ctx, meeting, guests, variant) {
  if (!guests.length || typeof ctx.deps?.sendEmail !== 'function') return { sent: 0, failed: 0 };
  const names = await namesOf(ctx.db, [meeting.organizer_email]);
  const organizerName = names.get(lower(meeting.organizer_email)) || meeting.organizer_email;
  const church = await churchName(ctx.db, ctx.tenant?.name);
  const when = M.formatWhen(meeting.starts_at, meeting.ends_at);
  let sent = 0;
  let failed = 0;
  for (const g of guests) {
    const token = g.token || (g.guest_link_id
      ? (await one(ctx.db, `SELECT token FROM call_guest_links WHERE id = $1`, [g.guest_link_id]))?.token
      : null);
    const joinUrl = token && variant !== 'cancel' ? guestJoinUrl(ctx, token) : '';
    const args = { variant, title: meeting.title, when, organizerName, churchName: church, description: meeting.description || '', joinUrl, guestName: g.name };
    const attachments = variant === 'reminder' ? [] : [{
      filename: variant === 'cancel' ? 'odwolane.ics' : 'zaproszenie.ics',
      type: `text/calendar; charset=utf-8; method=${variant === 'cancel' ? 'CANCEL' : 'REQUEST'}`,
      contentBase64: Buffer.from(M.buildIcs({
        meeting, method: variant === 'cancel' ? 'CANCEL' : 'REQUEST',
        organizer: { email: meeting.organizer_email, name: organizerName }, attendee: { email: g.email, name: g.name }, url: joinUrl,
      }), 'utf8').toString('base64'),
    }];
    try {
      await ctx.deps.sendEmail({
        to: g.email,
        subject: M.guestEmailSubject(variant, meeting.title),
        html: M.guestEmailHtml(args),
        text: M.guestEmailText(args),
        replyTo: meeting.organizer_email,
        fromName: church,
        attachments,
      });
      sent += 1;
      if (g.id && variant !== 'cancel') {
        await ctx.db.query(`UPDATE meeting_invites SET email_sent_at = now() WHERE id = $1`, [g.id]).catch(() => {});
      }
    } catch (err) {
      failed += 1;
      warn(ctx, err, `e-mail do gościa (${variant})`);
    }
  }
  return { sent, failed };
}

// Wysyłka w tle (odpowiedź fn nie czeka na dostawcę poczty); w testach — await (deps.inline).
export function background(ctx, fn) {
  const p = Promise.resolve().then(fn).catch((err) => warn(ctx, err, 'zadanie w tle'));
  return ctx.deps?.inline ? p : undefined;
}

export async function emitMeeting(ctx, meeting) {
  await emitRows(ctx, 'meetings', 'update', [meeting]);
}

// Podział listy zaproszonych: konta → członkowie, reszta → goście (po e-mailu).
async function splitInvitees(db, me, body) {
  const members = M.parseMembers(body.members).filter((e) => e !== me);
  const guestsIn = M.parseGuests(body.guests).filter((g) => g.email !== me);
  const accounts = await activeAccounts(db, [...members, ...guestsIn.map((g) => g.email)]);
  const unknown = members.filter((e) => !accounts.has(e));
  if (unknown.length) throw new ApiError(400, `${MESSAGES.unknownMembers}${unknown.slice(0, 5).join(', ')}`, 'UNKNOWN_MEMBERS');
  const memberSet = new Set(members);
  for (const g of guestsIn) if (accounts.has(g.email)) memberSet.add(g.email);
  const guests = guestsIn.filter((g) => !accounts.has(g.email));
  if (memberSet.size > M.MAX_MEMBERS) throw new ApiError(400, `Na spotkanie można zaprosić najwyżej ${M.MAX_MEMBERS} osób`, 'TOO_MANY_MEMBERS');
  return { members: [...memberSet], guests, accounts };
}

// ── Akcje (fn z sesją) ──────────────────────────────────────────────────────
// meeting-create { title, description, starts_at, duration_min, kind, guests_auto_admit,
//                  members: [email], guests: [{ email, name } | email] } → { meeting }
export async function createMeeting(ctx, user, body = {}) {
  assertEnabled(ctx);
  const { db } = ctx;
  const me = lower(user?.email);
  if (!me) throw new ApiError(401, 'Zaloguj się', 'UNAUTHORIZED');
  const input = M.normalizeMeetingInput(body);
  const { members, guests } = await splitInvitees(db, me, body);
  if (guests.length) {
    await assertGuestsAllowed(db, [me, ...members]);
    if (guests.length > (await guestQuotaLeft(db, me))) throw new ApiError(429, MESSAGES.guestLimit, 'GUEST_QUOTA');
  }

  const created = await withTx(db, async (tx) => {
    const conv = await one(tx,
      `INSERT INTO conversations (type, name, posting_policy, created_by) VALUES ('meeting', $1, 'everyone', $2) RETURNING *`,
      [input.title, me]);
    const parts = await addParticipants(tx, conv.id, [{ email: me, role: 'admin' }, ...members.map((e) => ({ email: e, role: 'member' }))]);
    const f = eventFieldsOf(input);
    const event = await one(tx,
      `INSERT INTO events (title, description, date, time, end_time, end_date, format, visibility_segments, created_by)
       VALUES ($1, $2, $3::date, $4, $5, $6::date, 'online', $7::jsonb, $8) RETURNING id::text AS id`,
      [f.title, f.description, f.date, f.time, f.end_time, f.end_date, MEETING_SEGMENTS, me]);
    const meeting = await one(tx,
      `INSERT INTO meetings (conversation_id, title, description, starts_at, ends_at, kind, organizer_email, guests_auto_admit, event_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'meeting') RETURNING *`,
      [conv.id, input.title, input.description, input.starts_at, input.ends_at, input.kind, me, input.guests_auto_admit, event.id]);
    await tx.query(
      `INSERT INTO meeting_invites (meeting_id, kind, email, response, responded_at, invited_by_email)
       SELECT $1, 'member', t.e, CASE WHEN t.e = $2 THEN 'accepted' ELSE 'pending' END,
              CASE WHEN t.e = $2 THEN now() END, $2
         FROM unnest($3::text[]) AS t(e)`,
      [meeting.id, me, [me, ...members]]);
    const guestRows = [];
    for (const g of guests) {
      const r = await createGuestInvite(tx, meeting, g, me);
      if (r) guestRows.push({ ...r.invite, token: r.link.token });
    }
    return { conv, parts, meeting, guestRows };
  });

  const { conv, parts, meeting, guestRows } = created;
  await emitRows(ctx, 'conversations', 'insert', [conv]);
  await emitRows(ctx, 'conversation_participants', 'insert', parts);
  await emitMeeting(ctx, meeting);
  const names = await namesOf(db, [me]);
  const byName = names.get(me) || me;
  const short = M.formatShort(meeting.starts_at);
  await systemMessage(ctx, conv.id, me, `${byName} zaplanował(a) spotkanie: ${short}`);
  await audit(db, me, 'meeting_created', `spotkanie ${meeting.id}: ${members.length} członków, ${guestRows.length} gości`);
  await background(ctx, async () => {
    await notifyMembers(ctx, meeting, members, { title: `Zaproszenie: ${meeting.title}`, body: `${byName} zaprasza Cię na spotkanie online — ${short}` });
    await emailGuests(ctx, meeting, guestRows, 'invite');
  });
  return { meeting: await meetingView(db, meeting, me, { manage: true }) };
}

// meeting-update { meeting_id, title?, description?, starts_at?, duration_min?, kind?, guests_auto_admit?,
//                  members?: [email] (pełna lista), guests?: [{ email, name }] (pełna lista) } → { meeting }
export async function updateMeeting(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const current = await loadForManager(db, me, body);
  if (current.status === 'cancelled') throw new ApiError(410, MESSAGES.cancelled, 'MEETING_CANCELLED');
  if (current.source === 'event') throw new ApiError(409, MESSAGES.fromEvent, 'MEETING_FROM_EVENT');
  const input = M.normalizeMeetingInput(body, { current });
  const timeChanged = input.starts_at !== new Date(current.starts_at).toISOString() || input.ends_at !== new Date(current.ends_at).toISOString();
  const titleChanged = input.title !== current.title;
  const detailsChanged = timeChanged || titleChanged || input.description !== current.description || input.kind !== current.kind;

  const invites = await invitesOf(db, current.id);
  const organizer = lower(current.organizer_email);
  const curMembers = invites.filter((i) => i.kind === 'member').map((i) => i.email);
  const curGuests = invites.filter((i) => i.kind === 'guest');
  let addMembers = [];
  let removeMembers = [];
  let addGuests = [];
  let removeGuests = [];
  if (body.members !== undefined || body.guests !== undefined) {
    const next = await splitInvitees(db, organizer, {
      members: body.members !== undefined ? body.members : curMembers,
      guests: body.guests !== undefined ? body.guests : curGuests.map((g) => ({ email: g.email, name: g.name })),
    });
    const wantMembers = new Set([organizer, ...next.members]);
    addMembers = [...wantMembers].filter((e) => !curMembers.includes(e));
    removeMembers = curMembers.filter((e) => !wantMembers.has(e) && e !== organizer);
    const wantGuests = new Map(next.guests.map((g) => [g.email, g]));
    addGuests = next.guests.filter((g) => !curGuests.some((c) => c.email === g.email));
    removeGuests = curGuests.filter((g) => !wantGuests.has(g.email));
    const remainingGuests = curGuests.length - removeGuests.length + addGuests.length;
    if (remainingGuests > 0) await assertGuestsAllowed(db, [...wantMembers]);
    if (addGuests.length > (await guestQuotaLeft(db, me))) throw new ApiError(429, MESSAGES.guestLimit, 'GUEST_QUOTA');
  }

  const result = await withTx(db, async (tx) => {
    const meeting = await one(tx,
      `UPDATE meetings SET title = $2, description = $3, starts_at = $4, ends_at = $5, kind = $6, guests_auto_admit = $7,
              sequence = sequence + CASE WHEN $8 THEN 1 ELSE 0 END,
              reminder_sent_at = CASE WHEN $9 THEN NULL ELSE reminder_sent_at END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [current.id, input.title, input.description, input.starts_at, input.ends_at, input.kind, input.guests_auto_admit,
        detailsChanged || addGuests.length > 0, timeChanged]);
    const conv = titleChanged
      ? await one(tx, `UPDATE conversations SET name = $2, updated_at = now() WHERE id = $1 RETURNING *`, [current.conversation_id, input.title])
      : null;
    // Ważność linków gości i „wpuszczaj bez pytania” idą za spotkaniem.
    await tx.query(
      `UPDATE call_guest_links SET expires_at = $2::timestamptz + $3 * interval '1 second', auto_admit = $4
        WHERE meeting_id = $1 AND revoked_at IS NULL`,
      [current.id, input.ends_at, M.LINK_GRACE_SEC, input.guests_auto_admit]);
    const parts = await addParticipants(tx, current.conversation_id, addMembers.map((e) => ({ email: e, role: 'member' })));
    if (addMembers.length) {
      await tx.query(
        `INSERT INTO meeting_invites (meeting_id, kind, email, invited_by_email)
         SELECT $1, 'member', t.e, $2 FROM unnest($3::text[]) AS t(e) ON CONFLICT (meeting_id, email) DO NOTHING`,
        [current.id, me, addMembers]);
    }
    let removedParts = [];
    if (removeMembers.length) {
      await tx.query(`DELETE FROM meeting_invites WHERE meeting_id = $1 AND kind = 'member' AND email = ANY($2::text[])`, [current.id, removeMembers]);
      removedParts = (await tx.query(
        `DELETE FROM conversation_participants WHERE conversation_id = $1 AND lower(user_email) = ANY($2::text[]) RETURNING *`,
        [current.conversation_id, removeMembers])).rows;
    }
    if (removeGuests.length) {
      await revokeGuestLinks(ctx, tx, `invite_id = ANY($1::uuid[])`, [removeGuests.map((g) => g.id)]);
      await tx.query(`DELETE FROM meeting_invites WHERE id = ANY($1::uuid[])`, [removeGuests.map((g) => g.id)]);
    }
    const newGuests = [];
    for (const g of addGuests) {
      const r = await createGuestInvite(tx, meeting, g, me);
      if (r) newGuests.push({ ...r.invite, token: r.link.token });
    }
    await mirrorEvent(tx, meeting);
    return { meeting, conv, parts, removedParts, newGuests };
  });

  const { meeting, conv, parts, removedParts, newGuests } = result;
  if (conv) await emitRows(ctx, 'conversations', 'update', [conv]);
  if (parts.length) await emitRows(ctx, 'conversation_participants', 'insert', parts);
  // Usunięci: zdarzenie do nich samych (audience liczona po zapisie już ich nie obejmuje).
  if (removedParts.length && typeof ctx.deps?.emit === 'function' && ctx.tenantSlug) {
    ctx.deps.emit(ctx.tenantSlug, 'conversation_participants', 'delete', removedParts, { audience: new Set(removeMembers) });
  }
  await emitMeeting(ctx, meeting);
  const byName = (await namesOf(db, [me])).get(me) || me;
  const short = M.formatShort(meeting.starts_at);
  if (timeChanged) await systemMessage(ctx, meeting.conversation_id, me, `${byName} zmienił(a) termin spotkania: ${short}`);
  await audit(db, me, 'meeting_updated',
    `spotkanie ${meeting.id}${timeChanged ? ', nowy termin' : ''}; +${addMembers.length}/-${removeMembers.length} członków, +${newGuests.length}/-${removeGuests.length} gości`);

  const keptGuests = (await invitesOf(db, meeting.id)).filter((i) => i.kind === 'guest' && i.response !== 'declined'
    && !newGuests.some((n) => n.id === i.id));
  const keptMembers = curMembers.filter((e) => !removeMembers.includes(e) && e !== me);
  await background(ctx, async () => {
    if (addMembers.length) {
      await notifyMembers(ctx, meeting, addMembers, { title: `Zaproszenie: ${meeting.title}`, body: `${byName} zaprasza Cię na spotkanie online — ${short}` });
    }
    if (timeChanged || titleChanged) {
      await notifyMembers(ctx, meeting, keptMembers, { title: `Zmiana spotkania: ${meeting.title}`, body: `Nowy termin: ${short}` });
    }
    if (newGuests.length) await emailGuests(ctx, meeting, newGuests, 'invite');
    if (detailsChanged && keptGuests.length) await emailGuests(ctx, meeting, keptGuests, 'update');
    if (removeGuests.length) await emailGuests(ctx, meeting, removeGuests, 'cancel');
  });
  return { meeting: await meetingView(db, meeting, me, { manage: true }) };
}

// meeting-cancel { meeting_id } → { meeting }. Linki gości przestają działać, goście i członkowie
// dostają informację; rozmowa (czat) zostaje.
export async function cancelMeeting(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const current = await loadForManager(db, me, body);
  if (current.source === 'event' && current.status === 'scheduled') throw new ApiError(409, MESSAGES.fromEvent, 'MEETING_FROM_EVENT');
  const meeting = await cancelMeetingInternal(ctx, current, me);
  return { meeting: await meetingView(db, meeting, me, { manage: true }) };
}

// Odwołanie (Komunikator, zmiana wydarzenia na stacjonarne, usunięcie/archiwizacja wydarzenia).
// Idempotentne — zwraca aktualny wiersz.
export async function cancelMeetingInternal(ctx, current, actor, { note = null } = {}) {
  const { db } = ctx;
  if (current.status === 'cancelled') return current;
  const meeting = await one(db,
    `UPDATE meetings SET status = 'cancelled', cancelled_at = now(), sequence = sequence + 1, updated_at = now()
      WHERE id = $1 AND status = 'scheduled' RETURNING *`, [current.id]);
  if (!meeting) return (await meetingById(db, current.id)) || current;
  await revokeGuestLinks(ctx, db, `meeting_id = $1`, [meeting.id]);
  await mirrorEvent(db, meeting, { archive: true });
  await emitMeeting(ctx, meeting);
  const me = lower(actor);
  const byName = (await namesOf(db, [me])).get(me) || me || 'Organizator';
  await systemMessage(ctx, meeting.conversation_id, me || meeting.organizer_email, note || `${byName} odwołał(a) spotkanie`);
  await audit(db, me || meeting.organizer_email, 'meeting_cancelled', `spotkanie ${meeting.id}`);
  const invites = await invitesOf(db, meeting.id);
  const members = invites.filter((i) => i.kind === 'member' && i.email !== me && i.response !== 'declined').map((i) => i.email);
  const guests = invites.filter((i) => i.kind === 'guest' && i.response !== 'declined' && i.email_sent_at);
  await background(ctx, async () => {
    await notifyMembers(ctx, meeting, members, { title: `Odwołane: ${meeting.title}`, body: `Spotkanie online zaplanowane na ${M.formatShort(meeting.starts_at)} zostało odwołane` });
    await emailGuests(ctx, meeting, guests, 'cancel');
  });
  return meeting;
}

// meeting-respond { meeting_id, response: 'accepted'|'tentative'|'declined' } → { meeting }
export async function respondMeeting(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const response = M.normalizeResponse(body.response);
  if (!response) throw new ApiError(400, 'Wybierz odpowiedź', 'BAD_RESPONSE');
  const { meeting } = await loadForParticipant(db, me, body);
  if (meeting.status === 'cancelled') throw new ApiError(410, MESSAGES.cancelled, 'MEETING_CANCELLED');
  const row = await one(db,
    `UPDATE meeting_invites SET response = $3, responded_at = now() WHERE meeting_id = $1 AND kind = 'member' AND email = $2 RETURNING *`,
    [meeting.id, me, response]);
  if (!row) throw new ApiError(403, MESSAGES.notInvited, 'NOT_INVITED');
  const touched = await one(db, `UPDATE meetings SET updated_at = now() WHERE id = $1 RETURNING *`, [meeting.id]);
  await emitMeeting(ctx, touched || meeting);
  return { meeting: await meetingView(db, touched || meeting, me) };
}

// meeting-get { meeting_id | conversation_id } → { meeting }
export async function getMeeting(ctx, user, body = {}) {
  const me = lower(user?.email);
  const { meeting } = await loadForParticipant(ctx.db, me, body);
  return { meeting: await meetingView(ctx.db, meeting, me) };
}

// meeting-list { from?, to? } → { meetings } — moje (uczestnik rozmowy), domyślnie od wczoraj na 60 dni.
export async function listMeetings(ctx, user, body = {}) {
  const me = lower(user?.email);
  const from = Date.parse(body.from ?? '') || Date.now() - 86_400_000;
  const to = Date.parse(body.to ?? '') || Date.now() + 60 * 86_400_000;
  const { rows } = await ctx.db.query(
    `SELECT m.*, i.response AS my_response
       FROM meetings m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND lower(cp.user_email) = $1
       LEFT JOIN meeting_invites i ON i.meeting_id = m.id AND i.kind = 'member' AND i.email = $1
      WHERE m.ends_at >= $2 AND m.starts_at <= $3 AND ($4 OR m.status = 'scheduled')
      ORDER BY m.starts_at LIMIT 200`,
    [me, new Date(from).toISOString(), new Date(to).toISOString(), body.include_cancelled === true]);
  return {
    meetings: rows.map((m) => ({
      id: m.id, conversation_id: m.conversation_id, title: m.title, starts_at: m.starts_at, ends_at: m.ends_at,
      kind: m.kind, status: m.status, organizer_email: m.organizer_email, my_response: m.my_response || null,
    })),
  };
}

// meeting-ics { meeting_id } → { filename, content } — do własnego kalendarza (członek).
export async function meetingIcs(ctx, user, body = {}) {
  const me = lower(user?.email);
  const { meeting } = await loadForParticipant(ctx.db, me, body);
  const names = await namesOf(ctx.db, [meeting.organizer_email, me]);
  const url = `${originOf(ctx)}${messageLink(meeting.conversation_id)}`;
  return {
    filename: `${M.oneLineFilename(meeting.title)}.ics`,
    content: M.buildIcs({
      meeting, method: meeting.status === 'cancelled' ? 'CANCEL' : 'REQUEST',
      organizer: { email: meeting.organizer_email, name: names.get(lower(meeting.organizer_email)) },
      attendee: { email: me, name: names.get(me) }, url,
    }),
  };
}

// ── Gość (publiczne) ────────────────────────────────────────────────────────
// Spotkanie linku gościa (null, gdy link nie jest ze spotkania).
export async function meetingOfLink(db, link) {
  if (!link?.meeting_id) return null;
  return meetingById(db, link.meeting_id);
}

// Informacje dla strony gościa (bez danych innych uczestników).
export async function guestMeetingInfo(db, link) {
  const meeting = await meetingOfLink(db, link);
  if (!meeting) return null;
  const invite = link.invite_id ? await one(db, `SELECT name, response FROM meeting_invites WHERE id = $1`, [link.invite_id]) : null;
  const names = await namesOf(db, [meeting.organizer_email]);
  return {
    title: meeting.title,
    description: meeting.description,
    starts_at: meeting.starts_at,
    ends_at: meeting.ends_at,
    kind: meeting.kind,
    status: meeting.status,
    organizer_name: names.get(lower(meeting.organizer_email)) || null,
    guest_name: invite?.name || link.guest_name || null,
    response: invite?.response || null,
  };
}

// meeting-guest-rsvp { token, response } → { ok, response }
export async function guestRsvp(ctx, body = {}) {
  const { db } = ctx;
  const response = M.normalizeResponse(body.response);
  if (!response) throw new ApiError(400, 'Wybierz odpowiedź', 'BAD_RESPONSE');
  const t = String(body.token ?? '').trim();
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(t)) throw new ApiError(404, GUEST_MESSAGES.notFound, 'LINK_NOT_FOUND');
  const link = await one(db, `SELECT * FROM call_guest_links WHERE token = $1`, [t]);
  if (!link?.meeting_id || !link.invite_id) throw new ApiError(404, GUEST_MESSAGES.notFound, 'LINK_NOT_FOUND');
  const meeting = await meetingById(db, link.meeting_id);
  if (!meeting || meeting.status === 'cancelled') throw new ApiError(410, MESSAGES.cancelled, 'MEETING_CANCELLED');
  if (link.revoked_at) throw new ApiError(410, GUEST_MESSAGES.expired, 'LINK_EXPIRED');
  const row = await one(db,
    `UPDATE meeting_invites SET response = $2, responded_at = now() WHERE id = $1 RETURNING *`, [link.invite_id, response]);
  if (!row) throw new ApiError(404, GUEST_MESSAGES.notFound, 'LINK_NOT_FOUND');
  const touched = await one(db, `UPDATE meetings SET updated_at = now() WHERE id = $1 RETURNING *`, [meeting.id]);
  await emitMeeting(ctx, touched || meeting);
  return { ok: true, response: row.response };
}

// ── Połączenie w spotkaniu ──────────────────────────────────────────────────
// Start połączenia w rozmowie spotkania: bez dzwonienia do wszystkich — powiadomienie
// „Spotkanie się rozpoczęło” do zaproszonych (bez tych, którzy odmówili).
export async function notifyMeetingStarted(ctx, conversationId, startedBy) {
  const meeting = await meetingByConversation(ctx.db, conversationId);
  if (!meeting || meeting.status !== 'scheduled') return;
  const invites = await invitesOf(ctx.db, meeting.id);
  const who = invites.filter((i) => i.kind === 'member' && i.response !== 'declined' && i.email !== lower(startedBy)).map((i) => i.email);
  const byName = (await namesOf(ctx.db, [startedBy])).get(lower(startedBy)) || startedBy;
  await notifyMembers(ctx, meeting, who, { title: `Spotkanie trwa: ${meeting.title}`, body: `${byName} rozpoczął(ęła) spotkanie — dołącz` });
}

export async function assertMeetingOpen(db, conversationId) {
  const meeting = await meetingByConversation(db, conversationId);
  if (meeting?.status === 'cancelled') throw new ApiError(410, MESSAGES.cancelled, 'MEETING_CANCELLED');
  return meeting;
}

// ── Przypomnienia (worker, co minutę) ───────────────────────────────────────
// Spotkania zaczynające się w ciągu 10 min, bez przypomnienia, zaplanowane wcześniej niż 15 min
// przed startem (świeżo utworzone mają w zaproszeniu wszystko). Zajęcie wiersza UPDATE … RETURNING
// (dwa przebiegi nie wyślą dwa razy).
export async function sendMeetingReminders(ctx) {
  const { rows } = await ctx.db.query(
    `UPDATE meetings SET reminder_sent_at = now()
      WHERE status = 'scheduled' AND reminder_sent_at IS NULL
        AND starts_at > now() AND starts_at <= now() + $1 * interval '1 minute'
        AND created_at < starts_at - interval '15 minutes'
      RETURNING *`, [M.REMINDER_MIN]);
  for (const meeting of rows) {
    const invites = await invitesOf(ctx.db, meeting.id);
    const members = invites.filter((i) => i.kind === 'member' && i.response !== 'declined').map((i) => i.email);
    const guests = invites.filter((i) => i.kind === 'guest' && i.response !== 'declined' && i.email_sent_at);
    await notifyMembers(ctx, meeting, members, { title: `Za ${M.REMINDER_MIN} minut: ${meeting.title}`, body: 'Spotkanie online zaraz się zacznie' });
    await emailGuests(ctx, meeting, guests, 'reminder');
  }
  return rows.length;
}
