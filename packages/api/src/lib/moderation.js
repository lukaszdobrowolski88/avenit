// Bezpieczeństwo treści użytkowników (wytyczna App Store 1.2): filtr wulgaryzmów, lista
// moderatorów i powiadomienia o nowych zgłoszeniach (moderator ma zareagować w ciągu 24 h).
import { config } from '../config.js';
import { loadGrants } from '../dataapi/registry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { MODERATE_CAPABILITY } from '../dataapi/komunikatorPlus.js';

const lower = (v) => String(v || '').trim().toLowerCase();

// ── Filtr wulgaryzmów ───────────────────────────────────────────────────────
// Rdzenie mocnych wulgaryzmów PL — dopasowanie w środku słowa (odmiana: „spierdalaj”, „najebany”).
// Żaden z nich nie występuje w zwykłych polskich ani angielskich słowach.
const PL_STEMS = ['kurw', 'chuj', 'huj', 'pierdol', 'pierdal', 'jeban', 'jebać', 'jebac', 'jebie', 'jebn', 'pizd', 'dziwk'];
// Krótkie formy tylko jako całe słowa („cipa” siedzi w „participate”, „ciota” w „ciotka”).
const PL_WORDS = ['cipa', 'cipy', 'cipą', 'cipę', 'cipo', 'ciota', 'cioty', 'ciotą', 'szmato'];
// Rdzeń z przedrostkiem (zajebisty, wyjebać…) — samo „jeb” jest zbyt krótkie, by łapać je wszędzie.
const PL_PREFIXED = /(?<!\p{L})(?:za|wy|od|prze|roz|na|po|do|u|w|s|ze|pod|nad)jeb\p{L}*/giu;
// EN — tylko całe słowa (biblijne „Shittim” czy „Scunthorpe” zostają nietknięte).
const EN_WORDS = ['fuck', 'fucking', 'fucked', 'fucker', 'motherfucker', 'shit', 'bullshit', 'cunt', 'bitch', 'asshole', 'nigger', 'faggot', 'whore', 'slut'];

const PL_RE = new RegExp(`\\p{L}*(?:${PL_STEMS.join('|')})\\p{L}*`, 'giu');
const WORDS_RE = new RegExp(`(?<!\\p{L})(?:${[...PL_WORDS, ...EN_WORDS].join('|')})(?!\\p{L})`, 'giu');
// Wyjątki — słowa zawierające rdzeń, a niewulgarne (nazwiska).
const ALLOW = new Set(['hujar']);

const mask = (word) => (word.length <= 2 ? '**' : word[0] + '*'.repeat(word.length - 1));

// Maskuje wulgaryzmy gwiazdkami (pierwsza litera zostaje). Zwraca ten sam tekst, gdy nic nie znalazł.
export function maskProfanity(text) {
  if (typeof text !== 'string' || !text) return text;
  const swap = (m) => (ALLOW.has(m.toLowerCase()) ? m : mask(m));
  return text.replace(PL_RE, swap).replace(PL_PREFIXED, swap).replace(WORDS_RE, swap);
}

// Kolumny z treścią pisaną przez użytkowników, filtrowane przy zapisie przez /api/db.
export const FILTERED_COLUMNS = {
  messages: ['content'],
  prayer_requests: ['content', 'answered_testimony'],
  wall_posts: ['content', 'title'],
};

// Mutuje q.values: maskuje wulgaryzmy w kolumnach z treścią (insert/update/upsert).
export function filterUserContent(q) {
  const cols = FILTERED_COLUMNS[q?.table];
  if (!cols || !['insert', 'update', 'upsert'].includes(q.op) || !q.values) return;
  const rows = Array.isArray(q.values) ? q.values : [q.values];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const c of cols) if (typeof r[c] === 'string') r[c] = maskProfanity(r[c]);
  }
}

// ── Moderatorzy ─────────────────────────────────────────────────────────────
// Moderator = superadmin, rola administracyjna albo uprawnienie action:komunikator:moderate
// (ta sama definicja co panel „Zgłoszenia” w Komunikatorze).
export async function isModerator(db, dbName, user) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  const { grants, adminRoles } = await loadGrants(db, dbName);
  if (adminRoles.has(user.role)) return true;
  if (grants === null) return false;
  return makeResolver(grants, { role: user.role, userId: user.id, isAdmin: false }).can(MODERATE_CAPABILITY);
}

export async function moderatorAccounts(db, dbName) {
  const { rows } = await db.query(
    `SELECT id, email, full_name, role, is_super_admin FROM app_users
      WHERE email IS NOT NULL AND is_active IS NOT FALSE`);
  const out = [];
  for (const u of rows) if (await isModerator(db, dbName, u).catch(() => false)) out.push(u);
  return out;
}

// ── Powiadomienia o zgłoszeniu ──────────────────────────────────────────────
const TYPE_LABEL = { message: 'wiadomość w Komunikatorze', prayer: 'prośba na ścianie modlitwy', wall_post: 'wpis na tablicy zespołu' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export const tenantWebUrl = (tenant) => `https://${tenant.slug}.${config.APP_DOMAIN}`;

// Fire-and-forget: e-mail + push do moderatorów kościoła i krótki alert (bez treści) do operatora
// platformy — kopia bezpieczeństwa, gdyby kościół nie miał aktywnego moderatora.
export async function notifyNewReport({ db, tenant, report, log }) {
  try {
    const type = report.content_type || 'message';
    const label = TYPE_LABEL[type] || 'treść';
    const link = `${tenantWebUrl(tenant)}/komunikator`;
    const { sendEmail } = await import('./email.js');
    const mods = await moderatorAccounts(db, tenant.db_name).catch(() => []);
    const reporter = lower(report.reporter_email);
    const recipients = mods.filter((m) => lower(m.email) !== reporter);

    const html = `<p>W Avenit zgłoszono treść do moderacji: <b>${esc(label)}</b>.</p>
<p><b>Powód:</b> ${esc(report.reason || 'nie podano')}</p>
${report.message_content ? `<blockquote style="border-left:3px solid #FFBE0B;margin:12px 0;padding:6px 12px;color:#4A463E">${esc(clip(report.message_content, 600))}</blockquote>` : ''}
<p>Zgłoszenia rozpatrz w ciągu 24 godzin: usuń treść albo zablokuj autora, jeśli narusza zasady społeczności.</p>
<p><a href="${link}">Otwórz Komunikator → Zgłoszenia</a></p>`;
    for (const m of recipients) {
      await sendEmail({ to: m.email, subject: 'Nowe zgłoszenie treści — Avenit', html }).catch((err) => log?.warn?.({ err }, 'report email failed'));
    }

    const { sendPushCore } = await import('../fn/send-push.js');
    for (const m of recipients) {
      await sendPushCore(db, {
        user_email: m.email,
        title: 'Nowe zgłoszenie treści',
        body: `${label[0].toUpperCase()}${label.slice(1)} — rozpatrz w ciągu 24 h.`,
        link: '/komunikator',
      }).catch(() => {});
    }

    const ops = config.MODERATION_ALERT_EMAIL;
    if (ops) {
      await sendEmail({
        to: ops,
        subject: `[Avenit] Zgłoszenie treści — ${tenant.slug}`,
        html: `<p>Kościół <b>${esc(tenant.slug)}</b>: nowe zgłoszenie (${esc(label)}), powód: ${esc(report.reason || '—')}.</p>
<p>Moderatorzy kościoła powiadomieni: ${recipients.length}. Jeśli zgłoszenie nie zostanie rozpatrzone w ciągu 24 h, zareaguj w panelu kościoła.</p>`,
      }).catch(() => {});
    }
  } catch (err) {
    log?.error?.({ err }, 'notifyNewReport failed');
  }
}
