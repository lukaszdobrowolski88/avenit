// Social Media — reguły automatyczne (migracja 123, worker co godzinę: fn/social-rules.js).
//
//   sermon_published — nowe opublikowane kazanie (dodane po utworzeniu reguły) → post z linkiem
//                      do kazania i miniaturą z YouTube,
//   event_reminder   — wydarzenie za N dni (czas polski) → post z linkiem do karty wydarzenia;
//                      opcjonalnie tylko wydarzenia ogólne (bez służby) i wybrane typy.
// Akcja: szkic | do akceptacji | kolejka. Post powstaje w imieniu autora reguły i z JEGO prawami
// (sprawdzanymi przy każdym przebiegu) — kto stracił prawo publikacji, tworzy już tylko szkice.
// Gdy post nie przejdzie walidacji (np. Instagram bez zdjęcia) albo kolejka nie ma godzin —
// powstaje szkic do uzupełnienia. Każda treść raz na regułę (social_rule_runs).
import { SocialError } from './meta.js';
import { socialAccess, savePost } from './service.js';
import { sharePrefill } from './links.js';
import { deliverNotifications } from '../dataapi/boardNotify.js';
import { DEFAULT_TEMPLATES } from '@avenit/shared/src/lib/socialShare.js';
import { warsawParts, warsawToDate } from '@avenit/shared/src/lib/chatSchedule.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lower = (v) => String(v ?? '').trim().toLowerCase();
export const TRIGGERS = ['sermon_published', 'event_reminder'];
export const ACTIONS = ['draft', 'submit', 'queue'];
const err = (status, message, code = 'BAD_REQUEST') => new SocialError(message, { status, code });

export async function listRules(ctx) {
  try {
    const { rows } = await ctx.db.query(`SELECT * FROM social_rules ORDER BY created_at`);
    return rows;
  } catch (e) {
    if (e?.code === '42P01') return [];
    throw e;
  }
}

function cleanConfig(trigger, c = {}) {
  if (trigger !== 'event_reminder') return {};
  const days = Math.min(Math.max(parseInt(c.days_before, 10) || 0, 0), 30);
  const types = (Array.isArray(c.event_types) ? c.event_types : []).map((t) => String(t || '').trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  return { days_before: days, only_general: c.only_general !== false, event_types: types };
}

export async function saveRule(ctx, access, body = {}) {
  if (!access.create && !access.publish) throw err(403, 'Nie masz uprawnień do tworzenia postów.', 'FORBIDDEN');
  const trigger = TRIGGERS.includes(body.trigger) ? body.trigger : null;
  if (!trigger) throw err(400, 'Wybierz, kiedy reguła ma działać.');
  const action = ACTIONS.includes(body.action) ? body.action : 'draft';
  if (action === 'queue' && !access.publish) throw err(403, 'Dodawanie do kolejki bez akceptacji wymaga prawa publikacji.', 'NO_PUBLISH');
  const ids = [...new Set((Array.isArray(body.account_ids) ? body.account_ids : []).filter((v) => UUID_RE.test(String(v))))];
  if (!ids.length) throw err(400, 'Wybierz co najmniej jeden kanał.');
  const name = String(body.name || '').trim().slice(0, 120) || (trigger === 'sermon_published' ? 'Nowe kazanie' : 'Przypomnienie o wydarzeniu');
  const template = String(body.template || '').slice(0, 5000) || DEFAULT_TEMPLATES[trigger === 'sermon_published' ? 'sermon' : 'event'];
  const configJson = JSON.stringify(cleanConfig(trigger, body.config));
  const enabled = body.enabled !== false;
  const me = lower(access.me?.email);
  if (body.id) {
    if (!UUID_RE.test(String(body.id))) throw err(400, 'Nieprawidłowa reguła.');
    const { rows: cur } = await ctx.db.query(`SELECT created_by FROM social_rules WHERE id = $1`, [body.id]);
    if (!cur[0]) throw err(404, 'Nie znaleziono reguły.', 'NOT_FOUND');
    if (!access.admin && !access.publish && lower(cur[0].created_by) !== me) throw err(403, 'Możesz zmieniać tylko własne reguły.', 'FORBIDDEN');
    // Zmiana reguły przenosi ją na osobę zmieniającą (posty powstają z jej prawami).
    await ctx.db.query(
      `UPDATE social_rules SET name = $2, trigger = $3, config = $4::jsonb, action = $5, account_ids = $6::uuid[], template = $7,
              enabled = $8, created_by = $9, updated_at = now() WHERE id = $1`,
      [body.id, name, trigger, configJson, action, ids, template, enabled, me]);
  } else {
    await ctx.db.query(
      `INSERT INTO social_rules (name, trigger, config, action, account_ids, template, enabled, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5::uuid[], $6, $7, $8)`,
      [name, trigger, configJson, action, ids, template, enabled, me]);
  }
  return listRules(ctx);
}

export async function deleteRule(ctx, access, body = {}) {
  if (!UUID_RE.test(String(body.id || ''))) throw err(400, 'Nieprawidłowa reguła.');
  const { rows } = await ctx.db.query(`SELECT created_by FROM social_rules WHERE id = $1`, [body.id]);
  if (!rows[0]) throw err(404, 'Nie znaleziono reguły.', 'NOT_FOUND');
  if (!access.admin && !access.publish && lower(rows[0].created_by) !== lower(access.me?.email)) throw err(403, 'Możesz usuwać tylko własne reguły.', 'FORBIDDEN');
  await ctx.db.query(`DELETE FROM social_rules WHERE id = $1`, [body.id]);
  return listRules(ctx);
}

// ── Worker ──────────────────────────────────────────────────────────────────
async function candidates(ctx, rule) {
  if (rule.trigger === 'sermon_published') {
    const { rows } = await ctx.db.query(
      `SELECT id FROM sermons WHERE is_published = true AND slug IS NOT NULL AND created_at >= $1
        ORDER BY created_at LIMIT 10`, [rule.created_at]).catch(() => ({ rows: [] }));
    return rows.map((r) => ({ kind: 'sermon', id: r.id, key: `sermon:${r.id}` }));
  }
  const c = rule.config || {};
  const days = Number(c.days_before) || 0;
  const now = ctx.deps?.now ? ctx.deps.now() : new Date();
  const t = warsawParts(now);
  const p = warsawParts(warsawToDate(t.year, t.month, t.day + days, 12, 0));
  const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const conds = ['date = $1::date', 'COALESCE(is_archived, false) = false'];
  const params = [ymd];
  if (c.only_general) conds.push('module_key IS NULL');
  if (Array.isArray(c.event_types) && c.event_types.length) { params.push(c.event_types); conds.push(`event_type = ANY($${params.length}::text[])`); }
  const { rows } = await ctx.db.query(`SELECT id, date FROM events WHERE ${conds.join(' AND ')} ORDER BY time NULLS LAST LIMIT 20`, params)
    .catch(async () => (await ctx.db.query(`SELECT id, date FROM events WHERE date = $1::date LIMIT 20`, [ymd]).catch(() => ({ rows: [] }))));
  return rows.map((r) => ({ kind: 'event', id: r.id, key: `event:${r.id}:${ymd}` }));
}

async function creatorAccess(ctx, email) {
  const { rows } = await ctx.db.query(`SELECT id FROM app_users WHERE lower(email) = $1 LIMIT 1`, [lower(email)]).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;
  return socialAccess(ctx.db, { id: rows[0].id }, ctx.dbName);
}

export async function runRules(ctx) {
  const stats = { created: 0, skipped: 0 };
  const rules = (await listRules(ctx)).filter((r) => r.enabled);
  if (!rules.length) return stats;
  const { rows: accRows } = await ctx.db.query(`SELECT id, status FROM social_accounts`);
  const active = new Set(accRows.filter((a) => a.status !== 'revoked').map((a) => a.id));
  for (const rule of rules) {
    const accounts = (rule.account_ids || []).filter((id) => active.has(id));
    if (!accounts.length) { stats.skipped += 1; continue; }
    const access = await creatorAccess(ctx, rule.created_by);
    if (!access?.view || (!access.create && !access.publish)) { stats.skipped += 1; continue; }
    for (const c of await candidates(ctx, rule)) {
      const { rows: claimed } = await ctx.db.query(
        `INSERT INTO social_rule_runs (rule_id, ref_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING rule_id`, [rule.id, c.key]);
      if (!claimed.length) continue;
      try {
        const pre = await sharePrefill(ctx, access, { kind: c.kind, id: c.id, template: rule.template });
        const wanted = rule.action === 'queue' && access.publish ? 'queue' : rule.action === 'submit' || rule.action === 'queue' ? 'submit' : 'draft';
        const base = {
          content: pre.content, media: pre.media, source_type: pre.source_type, source_id: pre.source_id,
          targets: accounts.map((account_id) => ({ account_id })),
        };
        let post;
        try {
          post = await savePost(ctx, access, { ...base, intent: wanted });
        } catch (e) {
          if (wanted === 'draft') throw e;
          post = await savePost(ctx, access, { ...base, intent: 'draft' }); // do uzupełnienia (np. IG bez zdjęcia)
        }
        await ctx.db.query(`UPDATE social_rule_runs SET post_id = $3 WHERE rule_id = $1 AND ref_key = $2`, [rule.id, c.key, post.id]);
        stats.created += 1;
        if (post.status === 'draft') {
          await (ctx.deps?.deliver || deliverNotifications)({
            db: ctx.db, tenant: { slug: ctx.tenantSlug }, log: ctx.log,
            entries: [{ user_email: lower(rule.created_by), type: 'social', title: `Reguła „${rule.name}” przygotowała szkic posta`,
              body: pre.title || 'Sprawdź i zaplanuj publikację.', link: `/social?post=${post.id}`, data: { post_id: post.id } }],
          }).catch(() => {});
        }
      } catch (e) {
        ctx.log?.error?.({ err: e }, `social-rules: reguła ${rule.id}`);
        // Zwolnienie wpisu — spróbujemy w kolejnym przebiegu.
        await ctx.db.query(`DELETE FROM social_rule_runs WHERE rule_id = $1 AND ref_key = $2 AND post_id IS NULL`, [rule.id, c.key]).catch(() => {});
      }
    }
  }
  return stats;
}
