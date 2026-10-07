// Kościół demo (demo.avenit.pl) z fikcyjnymi danymi — konto dla recenzji App Store / Google Play
// i do zrzutów ekranu. Nikt tu nie jest prawdziwą osobą; pieśni są z domeny publicznej.
//
// Uruchamianie na VPS (z /opt/avenit):
//   docker compose exec -e DEMO_REVIEW_PASSWORD='…' -e DEMO_ADMIN_PASSWORD='…' api node scripts/demo-tenant.mjs
//
// Idempotentne: zakłada tenanta, gdy go nie ma; dane demo czyści i wstawia od nowa z datami
// liczonymi od dziś (przed każdą recenzją warto odświeżyć). Działa WYŁĄCZNIE na tenancie 'demo'.
// Konto recenzenta: rola lider, bez 2FA, zasady społeczności NIEzaakceptowane (recenzent widzi bramkę).
import crypto from 'node:crypto';
import { platformPool, getTenantPool, closeAll } from '../src/db.js';
import { provisionTenant, slugToDbName } from '../src/admin/provisioning.js';
import { hashPassword } from '../src/auth/passwords.js';

const SLUG = 'demo';
const DOMAIN = 'demo.avenit.pl';
const REVIEW = { email: `recenzja@${DOMAIN}`, name: 'Marta Nowak', role: 'lider' };
const ADMIN = { email: `admin@${DOMAIN}`, name: 'Administrator Demo' };
const PEOPLE = [
  { email: `pawel.wisniewski@${DOMAIN}`, first: 'Paweł', last: 'Wiśniewski', role: 'lider' },
  { email: `katarzyna.zielinska@${DOMAIN}`, first: 'Katarzyna', last: 'Zielińska', role: 'czlonek' },
  { email: `tomasz.lewandowski@${DOMAIN}`, first: 'Tomasz', last: 'Lewandowski', role: 'koordynator' },
  { email: `agnieszka.wojcik@${DOMAIN}`, first: 'Agnieszka', last: 'Wójcik', role: 'czlonek' },
  { email: `michal.kaminski@${DOMAIN}`, first: 'Michał', last: 'Kamiński', role: 'czlonek' },
];
const MEMBERS_ONLY = [
  ['Joanna', 'Dąbrowska'], ['Piotr', 'Kozłowski'], ['Ewa', 'Jankowska'], ['Krzysztof', 'Mazur'],
  ['Magdalena', 'Krawczyk'], ['Jakub', 'Piotrowski'], ['Natalia', 'Grabowska'], ['Łukasz', 'Pawlak'],
];
const LOCATION = 'Sala główna, ul. Ogrodowa 12, Wrocław';

const log = (...a) => console.log('[demo]', ...a);
const randomPassword = () => crypto.randomBytes(18).toString('base64url');

// ── Daty względem dziś ──────────────────────────────────────────────────────
const today = new Date();
today.setHours(12, 0, 0, 0);
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const nextDow = (dow, offsetWeeks = 0) => {
  const diff = (dow - today.getDay() + 7) % 7 || 7;
  return addDays(diff + 7 * offsetWeeks);
};
const ago = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

// ── Wstawianie odporne na schemat: tylko istniejące kolumny ─────────────────
// Typ kolumny ma znaczenie: tablica JS do jsonb musi iść jako JSON (pg zrobiłby z [] literał
// tablicy Postgresa „{}”, który jsonb czyta jako obiekt), a do text[] — jako tablica.
const colCache = new Map();
async function columns(db, table) {
  if (!colCache.has(table)) {
    const { rows } = await db.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
    colCache.set(table, new Map(rows.map((r) => [r.column_name, r.data_type])));
  }
  return colCache.get(table);
}

const toParam = (type, v) => {
  if (v === null || v instanceof Date) return v;
  if (type === 'json' || type === 'jsonb') return JSON.stringify(v);
  if (typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
  return v;
};

async function insert(db, table, rows) {
  const cols = await columns(db, table);
  if (!cols.size) { log(`pomijam ${table} — brak tabeli`); return []; }
  const out = [];
  for (const row of rows) {
    const entries = Object.entries(row).filter(([k, v]) => cols.has(k) && v !== undefined);
    const names = entries.map(([k]) => `"${k}"`).join(', ');
    const params = entries.map(([k, v]) => toParam(cols.get(k), v));
    const ph = entries.map((_, i) => `$${i + 1}`).join(', ');
    try {
      const { rows: r } = await db.query(`INSERT INTO ${table} (${names}) VALUES (${ph}) RETURNING *`, params);
      out.push(r[0]);
    } catch (err) {
      log(`błąd wstawiania do ${table}: ${err.message}`);
    }
  }
  log(`${table}: ${out.length}/${rows.length}`);
  return out;
}

async function wipe(db) {
  const tables = [
    'message_reports', 'user_blocks', 'poll_votes', 'message_read_receipts', 'messages',
    'conversation_participants', 'conversations', 'prayer_interactions', 'prayer_requests',
    'schedule_assignments', 'events', 'programs', 'home_group_leaders', 'home_group_members',
    'home_groups', 'sermons', 'songs', 'members', 'push_tokens',
  ];
  for (const t of tables) {
    await db.query(`DELETE FROM ${t}`).catch((err) => log(`czyszczenie ${t}: ${err.message}`));
  }
}

async function upsertUser(db, { email, name, role, password }) {
  const hash = await hashPassword(password);
  const { rows } = await db.query('SELECT id FROM app_users WHERE lower(email) = lower($1)', [email]);
  const base = {
    full_name: name, name, role, is_active: true, status: 'active', email_verified: true,
    password_hash: hash, totp_enabled: false, totp_required: false, terms_accepted_at: null, terms_version: null,
  };
  const cols = await columns(db, 'app_users');
  const entries = Object.entries(base).filter(([k]) => cols.has(k));
  if (rows[0]) {
    const set = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
    await db.query(`UPDATE app_users SET ${set} WHERE id = $1`, [rows[0].id, ...entries.map(([, v]) => v)]);
    return rows[0].id;
  }
  const [row] = await insert(db, 'app_users', [{ email, ...base }]);
  return row?.id;
}

// ── Treści ──────────────────────────────────────────────────────────────────
const SONGS = [
  {
    title: 'Amazing Grace', author: 'John Newton (1779)', key: 'G', tempo: '72', meter: '3/4', category: 'Hymn',
    lyrics: `[G]Amazing grace, how [C]sweet the [G]sound\nThat saved a wretch like [D]me\nI [G]once was lost, but [C]now am [G]found\nWas blind, but [D]now I [G]see\n\n'Twas [G]grace that taught my [C]heart to [G]fear\nAnd grace my fears re[D]lieved\nHow [G]precious did that [C]grace ap[G]pear\nThe hour I [D]first be[G]lieved`,
    chords_bars: '| G | G | C | G |\n| G | G | D | D |\n| G | G7 | C | G |\n| G | D | G | G |',
  },
  {
    title: 'Holy, Holy, Holy', author: 'Reginald Heber (1826)', key: 'D', tempo: '84', meter: '4/4', category: 'Hymn',
    lyrics: `[D]Holy, holy, [Bm]holy! [G]Lord God Al[D]mighty!\nEarly in the [A]morning our [D]song shall rise to [A]Thee\n[D]Holy, holy, [Bm]holy! [G]Merciful and [D]mighty!\n[G]God in three [D]Persons, [A]blessed Trini[D]ty!`,
    chords_bars: '| D | Bm | G | D |\n| D | A | D | A |\n| D | Bm | G | D |\n| G | D | A | D |',
  },
  {
    title: 'Come Thou Fount', author: 'Robert Robinson (1758)', key: 'C', tempo: '96', meter: '3/4', category: 'Hymn',
    lyrics: `[C]Come, Thou Fount of [F]every [C]blessing\nTune my heart to [G]sing Thy [C]grace\nStreams of mercy, [F]never [C]ceasing\nCall for songs of [G]loudest [C]praise`,
    chords_bars: '| C | F | C | C |\n| C | G | C | C |\n| C | F | C | C |\n| C | G | C | C |',
  },
  {
    title: 'It Is Well with My Soul', author: 'Horatio Spafford (1873)', key: 'C', tempo: '68', meter: '4/4', category: 'Hymn',
    lyrics: `When [C]peace like a river at[F]tendeth my [C]way\nWhen sorrows like [Am]sea billows [D]roll[G]\nWhat[C]ever my lot, Thou hast [F]taught me to [C]say\nIt is [G]well, it is well with my [C]soul`,
    chords_bars: '| C | F | C | C |\n| C | Am | D | G |\n| C | F | C | C |\n| G | G | C | C |',
  },
  {
    title: 'Kiedy ranne wstają zorze', author: 'Franciszek Karpiński (1786)', key: 'F', tempo: '80', meter: '4/4', category: 'Pieśń poranna',
    lyrics: `[F]Kiedy ranne [C]wstają [F]zorze\nTobie ziemia, [C]Tobie [F]morze\nTobie śpiewa [Bb]żywioł [F]wszelki\nBądź po[C]chwalon, Boże [F]wielki`,
    chords_bars: '| F | C | F | F |\n| F | C | F | F |\n| F | Bb | F | F |\n| F | C | F | F |',
  },
  {
    title: 'Doxology', author: 'Thomas Ken (1674)', key: 'G', tempo: '76', meter: '4/4', category: 'Hymn',
    lyrics: `[G]Praise God, from [D]whom all [G]blessings flow\nPraise Him, all [C]creatures [D]here be[G]low\nPraise Him a[Em]bove, ye [D]heavenly host\nPraise [G]Father, [C]Son, and [D]Holy [G]Ghost`,
    chords_bars: '| G | D | G | G |\n| G | C | D | G |\n| G | Em | D | D |\n| G | C | D | G |',
  },
];

const SERMONS = [
  { title: 'Radość, która nie zależy od okoliczności', speaker: 'Tomasz Lewandowski', scripture_ref: 'Flp 4,4-7', weeks: 1 },
  { title: 'Mieć umysł Chrystusa', speaker: 'Tomasz Lewandowski', scripture_ref: 'Flp 2,1-11', weeks: 2 },
  { title: 'Biec do celu', speaker: 'Paweł Wiśniewski', scripture_ref: 'Flp 3,12-16', weeks: 3 },
  { title: 'Wdzięczność na co dzień', speaker: 'Tomasz Lewandowski', scripture_ref: '1 Tes 5,16-18', weeks: 4 },
];

async function main() {
  const reviewPassword = process.env.DEMO_REVIEW_PASSWORD;
  if (!reviewPassword || reviewPassword.length < 10) {
    throw new Error('Ustaw DEMO_REVIEW_PASSWORD (min. 10 znaków) — to hasło dostanie recenzent Apple/Google.');
  }

  // 1. Tenant
  const { rows: t } = await platformPool.query('SELECT id, status FROM tenants WHERE slug = $1', [SLUG]);
  if (!t.length) {
    log('zakładam tenanta…');
    await provisionTenant({
      name: 'Kościół Demo', slug: SLUG, adminEmail: ADMIN.email, adminName: ADMIN.name,
      adminPassword: process.env.DEMO_ADMIN_PASSWORD || randomPassword(), planKey: 'starter',
    });
  }
  // Bez końca okresu próbnego — inaczej po 14 dniach API odpowiada 402.
  await platformPool.query(`UPDATE tenants SET status = 'active', trial_ends_at = NULL WHERE slug = $1`, [SLUG]);

  const db = getTenantPool(slugToDbName(SLUG));
  await wipe(db);

  // 2. Konta
  await upsertUser(db, { ...REVIEW, password: reviewPassword });
  for (const p of PEOPLE) await upsertUser(db, { email: p.email, name: `${p.first} ${p.last}`, role: p.role, password: randomPassword() });

  // 3. Kartoteka
  const [mFirst, mLast] = REVIEW.name.split(' ');
  await insert(db, 'members', [
    { first_name: mFirst, last_name: mLast, email: REVIEW.email, phone: '+48 600 100 200', status: 'Członek', ministries: ['Grupa Uwielbienia'], membership_date: iso(addDays(-900)) },
    ...PEOPLE.map((p, i) => ({ first_name: p.first, last_name: p.last, email: p.email, phone: `+48 600 100 2${i + 1}0`, status: 'Członek', membership_date: iso(addDays(-400 - i * 90)) })),
    ...MEMBERS_ONLY.map(([f, l], i) => ({ first_name: f, last_name: l, email: `${f}.${l}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('ł', 'l') + `@${DOMAIN}`, status: i % 3 === 2 ? 'Sympatyk' : 'Członek', membership_date: iso(addDays(-200 - i * 60)) })),
  ]);

  // 4. Pieśni i kazania
  const songs = await insert(db, 'songs', SONGS.map((s) => ({ ...s, tags: ['demo'] })));
  await insert(db, 'sermons', SERMONS.map((s) => ({
    title: s.title, speaker: s.speaker, series: 'List do Filipian', scripture_ref: s.scripture_ref,
    sermon_date: iso(nextDow(0, -s.weeks)), is_published: true,
    description: 'Kazanie z cyklu o Liście do Filipian. Nagranie i notatki z nabożeństwa.',
  })));

  // 5. Wydarzenia (dziś +) i program najbliższego nabożeństwa
  const sun1 = nextDow(0), sun2 = nextDow(0, 1), sun3 = nextDow(0, 2);
  const songAt = (i) => songs[i]?.id;
  const [program] = await insert(db, 'programs', [{
    date: iso(sun1), title: 'Nabożeństwo niedzielne', status: 'published',
    schedule: [
      { id: 'p1', type: 'header', title: 'Powitanie i ogłoszenia', person: 'Tomasz Lewandowski', duration: 300 },
      { id: 'p2', type: 'song', title: SONGS[1].title, songId: songAt(1), songKey: 'D', person: 'Zespół uwielbienia', duration: 300 },
      { id: 'p3', type: 'song', title: SONGS[0].title, songId: songAt(0), songKey: 'G', person: 'Zespół uwielbienia', duration: 300 },
      { id: 'p4', type: 'header', title: 'Modlitwa za kościół', person: 'Katarzyna Zielińska', duration: 300 },
      { id: 'p5', type: 'header', title: 'Kazanie: Pokój Boży (Flp 4,6-9)', person: 'Tomasz Lewandowski', duration: 1800 },
      { id: 'p6', type: 'song', title: SONGS[5].title, songId: songAt(5), songKey: 'G', person: 'Zespół uwielbienia', duration: 240 },
    ],
  }]);
  const ev = async (row) => (await insert(db, 'events', [{ ...row, is_archived: false }]))[0];
  const evSun1 = await ev({ title: 'Nabożeństwo niedzielne', date: iso(sun1), time: '10:00', end_time: '12:00', location: LOCATION, description: 'Wspólne uwielbienie, modlitwa i Słowo. Po nabożeństwie kawa i ciasto.', program_id: program?.id });
  const evSun2 = await ev({ title: 'Nabożeństwo niedzielne', date: iso(sun2), time: '10:00', end_time: '12:00', location: LOCATION, description: 'Kontynuacja cyklu o Liście do Filipian.' });
  await insert(db, 'events', [
    { title: 'Wieczór uwielbienia', date: iso(nextDow(5)), time: '19:00', end_time: '21:00', location: LOCATION, description: 'Muzyka, modlitwa i świadectwa. Zaproś przyjaciół!', is_archived: false },
    { title: 'Spotkanie młodzieży', date: iso(nextDow(6)), time: '18:00', end_time: '20:00', location: 'Sala młodzieżowa, ul. Ogrodowa 12', description: 'Gry, rozmowa przy pizzy i krótkie rozważanie.', is_archived: false },
    { title: 'Szkolenie dla liderów grup domowych', date: iso(addDays(10)), time: '19:00', end_time: '21:00', location: 'Sala konferencyjna, ul. Ogrodowa 12', description: 'Jak prowadzić rozmowę o Biblii w małej grupie.', is_archived: false },
    { title: 'Nabożeństwo niedzielne', date: iso(sun3), time: '10:00', end_time: '12:00', location: LOCATION, description: 'Nabożeństwo z wieczerzą Pańską.', is_archived: false },
  ]);

  // 6. Grafik: zaproszenie oczekujące + potwierdzone
  await insert(db, 'schedule_assignments', [
    { event_id: evSun1?.id, team_type: 'worship', role_key: 'vocal', role_label: 'Wokal', assigned_name: REVIEW.name, assigned_email: REVIEW.email, assigned_by_name: 'Paweł Wiśniewski', status: 'pending' },
    { event_id: evSun1?.id, team_type: 'worship', role_key: 'guitar', role_label: 'Gitara', assigned_name: 'Paweł Wiśniewski', assigned_email: PEOPLE[0].email, assigned_by_name: 'Paweł Wiśniewski', status: 'accepted' },
    { event_id: evSun1?.id, team_type: 'worship', role_key: 'keys', role_label: 'Klawisze', assigned_name: 'Katarzyna Zielińska', assigned_email: PEOPLE[1].email, assigned_by_name: 'Paweł Wiśniewski', status: 'accepted' },
    { event_id: evSun2?.id, team_type: 'worship', role_key: 'vocal', role_label: 'Wokal', assigned_name: REVIEW.name, assigned_email: REVIEW.email, assigned_by_name: 'Paweł Wiśniewski', status: 'accepted' },
    { event_id: evSun2?.id, team_type: 'media', role_key: 'slides', role_label: 'Slajdy', assigned_name: 'Michał Kamiński', assigned_email: PEOPLE[4].email, assigned_by_name: 'Tomasz Lewandowski', status: 'accepted' },
  ]);

  // 7. Ściana modlitwy
  const prayers = await insert(db, 'prayer_requests', [
    { user_email: PEOPLE[1].email, user_name: 'Katarzyna Zielińska', content: 'Proszę o modlitwę za moją mamę, która w przyszłym tygodniu ma operację. Dziękuję, że jesteście!', category: 'zdrowie', visibility: 'public', is_anonymous: false, status: 'active', is_active: true, created_at: ago(5) },
    { user_email: PEOPLE[3].email, user_name: 'Agnieszka Wójcik', content: 'Módlcie się, proszę, o mądrość przy wyborze nowej pracy i o pokój w czasie zmian.', category: 'finanse', visibility: 'public', is_anonymous: false, status: 'active', is_active: true, created_at: ago(20) },
    { user_email: PEOPLE[4].email, user_name: null, content: 'O pojednanie w mojej rodzinie przed świętami.', category: 'rodzina', visibility: 'public', is_anonymous: true, status: 'active', is_active: true, created_at: ago(30) },
    { user_email: PEOPLE[0].email, user_name: 'Paweł Wiśniewski', content: 'Za nasz zespół uwielbienia — o jedność i świeżość w służbie.', category: 'duchowe', visibility: 'public', is_anonymous: false, status: 'active', is_active: true, created_at: ago(50) },
    { user_email: PEOPLE[2].email, user_name: 'Tomasz Lewandowski', content: 'O dobre przygotowanie szkolenia dla liderów grup domowych.', category: 'inne', visibility: 'public', is_anonymous: false, status: 'answered', answered_testimony: 'Zgłosiło się 12 osób — dziękujemy za modlitwę!', is_active: true, created_at: ago(200) },
  ]);
  // Liczniki „modli się”; recenzent modli się za dwie prośby (przycisk w obu stanach na ścianie).
  const prayed = [];
  for (const [i, p] of prayers.entries()) {
    for (const who of PEOPLE.map((x) => x.email).slice(0, 2 + i)) {
      if (who !== p.user_email) prayed.push({ request_id: p.id, user_email: who });
    }
  }
  for (const i of [1, 3]) if (prayers[i]) prayed.push({ request_id: prayers[i].id, user_email: REVIEW.email });
  await insert(db, 'prayer_interactions', prayed);

  // 8. Grupy domowe (punkty we Wrocławiu — mapa wymaga współrzędnych w Polsce)
  const groups = await insert(db, 'home_groups', [
    { name: 'Grupa Krzyki', description: 'Studium Ewangelii Marka, modlitwa i wspólna kolacja.', meeting_day: 'Wtorek', meeting_time: '19:00', location: 'U Wiśniewskich', address: 'ul. Powstańców Śląskich 95, Wrocław', latitude: 51.0889, longitude: 17.0141, lat: 51.0889, lng: 17.0141 },
    { name: 'Grupa Śródmieście', description: 'Grupa dla studentów i młodych pracujących.', meeting_day: 'Środa', meeting_time: '19:30', location: 'Kawiarnia przy kościele', address: 'ul. Ogrodowa 12, Wrocław', latitude: 51.1100, longitude: 17.0320, lat: 51.11, lng: 17.032 },
    { name: 'Grupa Psie Pole', description: 'Grupa rodzinna — dzieci mają osobne zajęcia.', meeting_day: 'Czwartek', meeting_time: '18:30', location: 'U Lewandowskich', address: 'ul. Kiełczowska 70, Wrocław', latitude: 51.1489, longitude: 17.1063, lat: 51.1489, lng: 17.1063 },
  ]);
  if (groups[0]) {
    await insert(db, 'home_group_members', [
      { group_id: groups[0].id, full_name: 'Paweł Wiśniewski', email: PEOPLE[0].email, phone: '+48 600 100 210', is_leader: true, role: 'leader' },
      { group_id: groups[0].id, full_name: REVIEW.name, email: REVIEW.email, is_leader: false, role: 'member' },
      { group_id: groups[0].id, full_name: 'Agnieszka Wójcik', email: PEOPLE[3].email, is_leader: false, role: 'member' },
      { group_id: groups[0].id, full_name: 'Joanna Dąbrowska', is_leader: false, role: 'member' },
    ]);
  }
  if (groups[2]) {
    await insert(db, 'home_group_members', [
      { group_id: groups[2].id, full_name: 'Tomasz Lewandowski', email: PEOPLE[2].email, is_leader: true, role: 'leader' },
      { group_id: groups[2].id, full_name: 'Michał Kamiński', email: PEOPLE[4].email, is_leader: false, role: 'member' },
    ]);
  }

  // 9. Komunikator: zespół uwielbienia + rozmowa prywatna
  const [team] = await insert(db, 'conversations', [{ type: 'group', name: 'Zespół uwielbienia', created_by: PEOPLE[0].email, posting_policy: 'everyone', last_message_at: ago(1) }]);
  const [dm] = await insert(db, 'conversations', [{ type: 'direct', created_by: PEOPLE[2].email, last_message_at: ago(3) }]);
  if (team) {
    await insert(db, 'conversation_participants', [REVIEW.email, PEOPLE[0].email, PEOPLE[1].email, PEOPLE[4].email].map((e, i) => ({
      conversation_id: team.id, user_email: e, role: i === 1 ? 'admin' : 'member', last_read_at: ago(8),
    })));
    const t = (h, who, name, content) => ({ conversation_id: team.id, sender_email: who, sender_name: name, content, message_type: 'text', attachments: [], created_at: ago(h) });
    await insert(db, 'messages', [
      t(30, PEOPLE[0].email, 'Paweł Wiśniewski', 'Cześć wszystkim! Grafik na niedzielę jest już w aplikacji 🙌'),
      t(29, PEOPLE[1].email, 'Katarzyna Zielińska', 'Super, dziękuję! Gram na klawiszach.'),
      t(28, PEOPLE[0].email, 'Paweł Wiśniewski', 'Próba w sobotę o 17:00 w sali głównej. Setlista: Holy, Holy, Holy (D), Amazing Grace (G), Doxology (G).'),
      t(26, PEOPLE[4].email, 'Michał Kamiński', 'Przygotuję slajdy z tekstami do piątku.'),
      t(9, PEOPLE[1].email, 'Katarzyna Zielińska', 'Czy Amazing Grace gramy w G, czy schodzimy do F?'),
      t(8, PEOPLE[0].email, 'Paweł Wiśniewski', 'Zostajemy w G — Marta, pasuje Ci?'),
      t(1, PEOPLE[0].email, 'Paweł Wiśniewski', 'Pomódlmy się dziś wieczorem za niedzielne nabożeństwo 🙏'),
    ]);
  }
  if (dm) {
    await insert(db, 'conversation_participants', [REVIEW.email, PEOPLE[2].email].map((e) => ({ conversation_id: dm.id, user_email: e, role: 'member', last_read_at: ago(10) })));
    await insert(db, 'messages', [
      { conversation_id: dm.id, sender_email: PEOPLE[2].email, sender_name: 'Tomasz Lewandowski', content: 'Marto, dziękuję za pomoc przy szkoleniu liderów!', message_type: 'text', attachments: [], created_at: ago(5) },
      { conversation_id: dm.id, sender_email: REVIEW.email, sender_name: REVIEW.name, content: 'Bardzo chętnie. Przygotuję listę obecności.', message_type: 'text', attachments: [], created_at: ago(4) },
      { conversation_id: dm.id, sender_email: PEOPLE[2].email, sender_name: 'Tomasz Lewandowski', content: 'Świetnie, do zobaczenia w niedzielę!', message_type: 'text', attachments: [], created_at: ago(3) },
    ]);
  }

  log(`gotowe: https://${DOMAIN} — recenzent ${REVIEW.email} (rola ${REVIEW.role}, bez 2FA)`);
}

main()
  .then(() => closeAll())
  .catch(async (err) => {
    console.error('[demo] BŁĄD:', err.message);
    await closeAll().catch(() => {});
    process.exit(1);
  });
