// POST /api/db — pojedynczy endpoint zapytań (odpowiednik PostgREST dla klienta
// zgodnego z supabase-js). Autoryzacja per tabela/rola w registry.js.
import { buildQuery, buildCountQuery, ApiError, quoteIdent, embeddedTablePairs } from './querybuilder.js';
import { canAccess, getTableRule, invalidatePermissions, requireCapability, loadGrants } from './registry.js';
import { fieldColumns, crudCapability, crudCapabilities, MODULES } from '@avenit/shared/src/permissions/catalog.js';
import { isModuleScopedTable } from '@avenit/shared/src/permissions/moduleScope.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { emitChange } from '../realtime/hub.js';
import { notifyOnWrite, prepareUserTaskAssign, notifyUserTaskAssign } from '../realtime/push-hooks.js';
import { platformDisabledModules } from '../lib/platform-modules.js';
import { assertTaskCommentTarget, enforceOwnedWrite, isOwnedTable, ownerScope } from './ownership.js';
import { PII_TABLES, enforcePiiWrite, isPiiTable, redactPii } from './pii.js';
import { enforceSharedWrite, enforceExpenseApproval, enforceCampaignStatus, enforceAccountWrite } from './sharedWrites.js';
import { isConversationTable, conversationScope, enforceConversationWrite, conversationAudience, conversationDeleteAudience, assertConversationFilters, pollVotesRedactor } from './komunikator.js';
import { MODERATE_CAPABILITY, reportScope, enforceReportWrite, reportAudience, normalizeBlockWrite, assertVoteFilters, anonymousPollIds, redactVotes } from './komunikatorPlus.js';
import { isBoardTable, boardScope, enforceBoardWrite, boardAudience } from './boardsScope.js';
import { isMailTable, mailScope, enforceMailWrite, mailAudience } from './mailScope.js';
import { applyModuleScope, moduleRowScope, andScopes } from './moduleScope.js';
import { loadVisibilityContext } from './eventVisibility.js';
import { filterUserContent, notifyNewReport } from '../lib/moderation.js';
import { prepareBoardAssignNotify, notifyBoardAssignees } from './boardNotify.js';

// Złączenia między modułami dozwolone bez dostępu do modułu tabeli dociąganej —
// świadome wyjątki operacyjne. Klucz: '<tabela nadrzędna>><tabela dociągana>'.
//   checkins>households — obsługa Dzieci widzi rodzinę zameldowanego dziecka (odbiór,
//   kontakt z rodzicem), choć gospodarstwa należą do modułu Członkowie.
const EMBED_CROSS_MODULE_ALLOW = new Set(['checkins>households']);

// Stare tabele wydarzeń modułów usunięte migracjami 077/078 (wszystko jest w `events`). Starsze
// wersje aplikacji mobilnej mogą jeszcze o nie pytać — odczyt zwraca pustą listę zamiast
// błędu (ekran kalendarza się nie wywraca), zapis: 410 z prośbą o aktualizację.
const RETIRED_TABLES = new Set([
  'worship_events', 'media_events', 'atmosfera_events', 'kids_events',
  'homegroups_events', 'ministry_events', 'module_events',
  'mlodziezowka_events', // migracja 078
]);

// Propozycje budżetu: team_type, pod którym zakładka Finanse zespołu (shared/FinanceTab,
// prop `ministry`) zapisuje i czyta propozycje. Stałe etykiety, często inne niż nazwa w menu.
// Moduły własne (FinanceWidget) zapisują nazwę albo klucz modułu.
const PROPOSAL_TEAM_TYPES = {
  worship: 'Grupa Uwielbienia',
  media: 'MediaTeam',
  atmosfera: 'AtmosferaTeam',
  kids: 'małe Avenit',
  homegroups: 'Grupy domowe',
  mlodziezowka: 'Mlodziezowka',
};
const BUILTIN_MODULE_KEYS = new Set(MODULES.map((m) => m.key));

// Tabele, których insert wyzwala automatyczny push (patrz push-hooks.js).
// Push wysyłamy wsadowo (fn send-assignment-invites), nie na każdy insert przypisania.
const PUSH_ON_INSERT = new Set(['messages']);

export default async function dataApiRoutes(app) {
  app.post('/api/db', { preHandler: [app.requireUser, app.block2FAPending] }, async (req, reply) => {
    const q = req.body || {};
    try {
      // Pola wewnętrzne (__ownerScope, __campusScope, __visibilityScope, __embedScopes…) ustawia
      // wyłącznie serwer — z żądania klienta zawsze usuwamy.
      for (const k of Object.keys(q)) if (k.startsWith('__')) delete q[k];
      if (RETIRED_TABLES.has(q.table)) {
        if (q.op === 'select') return reply.send({ data: q.single ? null : [], count: q.count ? 0 : null });
        throw new ApiError(410, 'Ta funkcja została przeniesiona — zaktualizuj aplikację.');
      }
      const { rows: userRows } = await req.db.query(
        `SELECT is_super_admin, campus_id, role, member_id FROM app_users WHERE id = $1`, [req.user.id]
      );
      const user = {
        ...req.user,
        is_super_admin: userRows[0]?.is_super_admin,
        campus_id: userRows[0]?.campus_id ?? null,
        role: userRows[0]?.role ?? req.user.role,
      };

      // Twarda izolacja kampusów (Faza 4): osoba z przypisanym kampusem i BEZ roli admina
      // widzi/edytuje tylko dane swojego kampusu (albo bez kampusu). Uśpione, gdy campus_id
      // = null (obecnie wszyscy) → q.__campusScope niedodawany → SQL bez zmian.
      const { adminRoles, grants: allGrants } = await loadGrants(req.db, req.tenant.db_name);
      const isAdmin = user.is_super_admin || adminRoles.has(user.role);
      if (!isAdmin && user.campus_id != null) q.__campusScope = { campusId: user.campus_id };

      // Złączenia w SELECT (embed) — lista par [nadrzędna, dociągana]; nieznana relacja → 400.
      const embedPairs = q.select && q.op === 'select' ? embeddedTablePairs(q.table, q.select) : [];
      const embedTables = [...new Set(embedPairs.map(([, child]) => child))];

      // Widoczność wydarzeń: kontekst zalogowanego dla egzekwowania audytorium (segmentów).
      // Tylko dla nie-adminów i tylko przy odczycie events — wprost albo w złączeniu (admin widzi
      // wszystko). Fail-closed: brak membera => segmenty grupowe po prostu nie łapią.
      if (!isAdmin && q.op === 'select' && (q.table === 'events' || embedTables.includes('events'))) {
        q.__visibilityScope = await loadVisibilityContext(req.db, {
          email: req.user.email, role: user.role, campus_id: user.campus_id, member_id: userRows[0]?.member_id ?? null,
        });
      }

      const access = await canAccess({
        pool: req.db,
        dbName: req.tenant.db_name,
        table: q.table,
        op: q.op,
        user,
        allowModuleScope: true, // wspólne tabele służb — zawężenie niżej (applyModuleScope)
        ignoreDuplicates: q.op === 'upsert' && !!q.ignoreDuplicates, // DO NOTHING — wystarcza create
      });
      if (!access.ok) {
        // Wyjątki self-service (mimo braku roli): własny profil w app_users,
        // oraz akceptacja/odrzucenie WŁASNEGO zaproszenia do służby.
        const selfAllowed =
          (await allowSelfUpdate(q, req)) ||
          (await allowAssignmentSelfRespond(q, req)) ||
          (await allowOwnPrayerWrite(q, req));
        if (!selfAllowed) {
          throw new ApiError(403, access.reason);
        }
      }

      // Resolver nie-admina (admin i tryb legacy: null — bez dodatkowych ograniczeń niżej).
      const resolver = !isAdmin && allGrants !== null
        ? makeResolver(allGrants, { role: user.role, userId: user.id, isAdmin: false })
        : null;
      // Pełny wgląd w propozycje budżetu ma tylko ten, kto je zatwierdza. Sam odczyt modułu
      // Finanse (np. preset lidera) nie wystarcza — lider widzi propozycje swoich zespołów.
      const fullFinance = !resolver || resolver.can('action:finance:approve');

      // Dane osobowe w zaproszeniach RSVP / zapisach (pii.js): obsługa widzi wszystko,
      // reszta — cudze wiersze z wymazanymi danymi, zapis tylko własny.
      const piiStaff = (table) => !resolver || resolver.can(PII_TABLES[table].staffCap);
      const piiMe = { email: String(req.user.email || '').toLowerCase(), memberId: userRows[0]?.member_id ?? null };
      const piiRestricted = isPiiTable(q.table) && !piiStaff(q.table);

      // Propozycje budżetu (T(null)): składa je każdy (liderzy z zakładki Finanse zespołu),
      // ale decyzję (zmiana statusu / usunięcie) podejmuje tylko action:finance:approve.
      // upsert to też zmiana istniejącego wiersza, a insert z gotowym statusem — decyzja.
      if (
        access.ok &&
        q.table === 'budget_proposals' &&
        access.resolver &&
        !access.resolver.can('action:finance:approve') &&
        (q.op === 'update' || q.op === 'delete' || q.op === 'upsert' ||
          (q.op === 'insert' && proposalRows(q).some((r) => r.status != null && r.status !== 'pending')))
      ) {
        throw new ApiError(403, 'Decyzje o budżecie wymagają uprawnienia do zatwierdzania finansów');
      }

      // Bez prawa zatwierdzania propozycje są widoczne tylko dla zespołów, których zakładkę
      // Finanse osoba otwiera, i własne. Zgłaszać też można tylko dla tych zespołów i pod
      // własnym e-mailem (submitted_by).
      if (access.ok && q.table === 'budget_proposals' && !fullFinance) {
        const teamTypes = await proposalTeamTypes(req, resolver);
        if (q.op === 'select') q.__proposalScope = { teamTypes, email: req.user.email || '' };
        if (q.op === 'insert') {
          const email = String(req.user.email || '').toLowerCase();
          for (const r of proposalRows(q)) {
            if (!teamTypes.includes(r.team_type)) {
              throw new ApiError(403, 'Propozycję można zgłosić tylko dla zespołu, którego finanse widzisz');
            }
            if (r.submitted_by != null && String(r.submitted_by).toLowerCase() !== email) {
              throw new ApiError(403, 'Propozycję zgłaszasz pod własnym adresem e-mail');
            }
          }
        }
      }

      // Tabele wspólne bez modułu (słowniki, służby zespołów, RSVP, udostępnienia, tablice):
      // zapis tylko z uprawnieniem do modułu, z którego pochodzą (sharedWrites.js).
      if (access.ok) await enforceSharedWrite(q, req, resolver);
      if (access.ok) enforceExpenseApproval(q, resolver);
      if (access.ok) enforceCampaignStatus(q, resolver);
      // Konta i ustawienia SSO: nie-admin z manage_users / manage_integrations nie nada roli admina,
      // nie ruszy konta administratora ani konfiguracji SSO (sharedWrites.js). Także ścieżka
      // samoobsługi (własny profil) — tam przepuszcza tylko kolumny selfUpdateColumns.
      await enforceAccountWrite(q, req, { isAdmin, user });

      // Złączenia (embed) nie mogą omijać uprawnień: tabela dociągana wymaga dostępu do
      // SWOJEGO modułu (i floorów readRoles), jak tabela główna. Wcześniej sprawdzano tylko
      // obecność w REGISTRY, więc np. dostęp do checkins dawał przez złączenie dane z modułu
      // Członkowie. Celowo bez CRUD per zasób — złączenia w obrębie modułu (programs →
      // program_types) działają jak dotąd. Admin i tryb legacy (grants null) bez zmian.
      // Tabel osobistych nie wolno dociągać złączeniem — ominęłoby to zawężenie do właściciela
      // (a tabel z danymi osobowymi — wymazywanie cudzych danych, jeśli nie jesteś obsługą;
      // głosów w ankietach — anonimizację).
      // Zakresy wierszy tabeli dociąganej (audyt 2026-10, runda 3): prywatne tablice, zakres służby,
      // rozmowy, poczta, zgłoszenia, kampus i widoczność wydarzeń działają też w złączeniu
      // (q.__embedScopes / q.__embedHidden → querybuilder) — np. board_items:item_id(*)
      // z board_item_updates nie pokaże elementów prywatnej tablicy.
      if (embedTables.length) {
        const moderatorForEmbeds = isAdmin || !!resolver?.can(MODERATE_CAPABILITY);
        q.__embedScopes = {};
        q.__embedHidden = {};
        for (const child of embedTables) {
          if (isOwnedTable(child) || (isPiiTable(child) && !piiStaff(child)) || child === 'poll_votes') {
            throw new ApiError(403, `Brak dostępu do danych '${child}' w złączeniu`);
          }
          let scope = null;
          if (resolver && isModuleScopedTable(child)) {
            // Wspólne tabele służb: jak zapytanie wprost — globalnie albo w zakresie służby.
            const childAccess = await canAccess({
              pool: req.db, dbName: req.tenant.db_name, table: child, op: 'select', user, allowModuleScope: true,
            });
            if (!childAccess.ok) throw new ApiError(403, `Brak dostępu do danych '${child}' w złączeniu`);
            if (childAccess.moduleScope) scope = moduleRowScope(child, childAccess.moduleScope.modules);
          }
          if (child === 'message_reports') scope = andScopes(scope, reportScope(req.user, moderatorForEmbeds));
          if (isConversationTable(child)) scope = andScopes(scope, conversationScope(child, req.user));
          if (isBoardTable(child)) scope = andScopes(scope, boardScope(child, req.user));
          if (isMailTable(child)) scope = andScopes(scope, mailScope(child, req.user));
          if (scope?.select) q.__embedScopes[child] = scope.select;
          if (resolver) {
            const denied = fieldColumns(child).filter((c) => !resolver.fieldReadable(child, c));
            if (denied.length) q.__embedHidden[child] = denied;
          }
        }
      }

      if (resolver) {
        for (const [parent, child] of embedPairs) {
          const rule = getTableRule(child);
          if (!rule) continue; // buildQuery odrzuci nieznaną tabelę
          if (rule.readRoles && !rule.readRoles.includes(user.role)) {
            throw new ApiError(403, `Brak dostępu do danych '${child}' w złączeniu`);
          }
          if (
            typeof rule.resource === 'string' &&
            rule.resource.startsWith('module:') &&
            !isModuleScopedTable(child) && // sprawdzone wyżej (globalnie albo w zakresie służby)
            !EMBED_CROSS_MODULE_ALLOW.has(`${parent}>${child}`) &&
            !resolver.can(rule.resource)
          ) {
            throw new ApiError(403, `Brak dostępu do danych '${child}' w złączeniu (${rule.resource})`);
          }
          // Zawężenie wierszy propozycji działa tylko na tabeli głównej — w złączeniu ich nie dajemy.
          if (child === 'budget_proposals' && !fullFinance) {
            throw new ApiError(403, "Brak dostępu do danych 'budget_proposals' w złączeniu");
          }
        }
      }

      // Materiały to tabele T(null) (czyta i dodaje każdy zalogowany), ale zmiana nazwy
      // i usuwanie cudzych plików wymaga uprawnienia z roli — inaczej tylko własne.
      if (access.ok && !(await allowMaterialsWrite(q, req, access))) {
        throw new ApiError(403, 'Możesz zmieniać i usuwać tylko własne pliki');
      }

      // Egzekwowanie pól przy zapisie: odrzuć próbę edycji kolumny bez prawa.
      if (access.resolver && (q.op === 'insert' || q.op === 'update' || q.op === 'upsert') && q.values) {
        const cols = fieldColumns(q.table);
        if (cols.length) {
          const rows = Array.isArray(q.values) ? q.values : [q.values];
          for (const row of rows) {
            for (const c of cols) {
              if (row && c in row && !access.resolver.fieldWritable(q.table, c)) {
                throw new ApiError(403, `Brak uprawnienia do edycji pola '${c}'`);
              }
            }
          }
        }
      }

      // PARYTET DANYCH: rekordy własnych kolekcji kreatora egzekwowane PER MODUŁ i PER
      // OPERACJA — dokładnie jak tabele custom_<key>_* (res:custom_<key>_records:<op>).
      // Zapytania muszą być zawężone do modułu (module_key) — inaczej odrzucamy (brak wycieku).
      if (q.table === 'module_records' && access.resolver && !user.is_super_admin) {
        const moduleKey = moduleRecordsModuleKey(q);
        if (!moduleKey) throw new ApiError(400, 'module_records: wymagany filtr/wartość module_key');
        const caps = crudCapabilities(`custom_${moduleKey}_records`, q.op, { ignoreDuplicates: !!q.ignoreDuplicates });
        const missing = caps.find((c) => !access.resolver.can(c));
        if (missing) throw new ApiError(403, `Brak uprawnienia ${missing}`);
      }

      if (piiRestricted) enforcePiiWrite(q, piiMe);

      // Treści użytkowników (wiadomości, modlitwy, tablice): wulgaryzmy maskowane przy zapisie
      // (wytyczna App Store 1.2 — filtrowanie treści obraźliwych; lib/moderation.js).
      filterUserContent(q);

      // Komunikator+ (komunikatorPlus.js): zgłoszenia wiadomości — zgłaszający widzi własne,
      // moderator (admin aplikacji albo action:komunikator:moderate) wszystkie i je rozstrzyga.
      const moderator = isAdmin || !!resolver?.can(MODERATE_CAPABILITY);
      if (q.table === 'message_reports') {
        q.__ownerScope = reportScope(req.user, moderator);
        await enforceReportWrite(q, req, moderator);
        if (q.op !== 'select' && !q.returning) q.returning = '*';
      }
      // Blokady: e-maile małymi literami, bez blokowania siebie, ponowna blokada bez błędu.
      if (q.table === 'user_blocks') normalizeBlockWrite(q, req.user);
      // Głosy w ankietach: bez filtrowania po cudzym e-mailu (ankiety anonimowe).
      if (q.table === 'poll_votes' && q.op === 'select') assertVoteFilters(q.filters, req.user.email);

      // Tabele osobiste: wiersze tylko właściciela (patrz ownership.js) — dla każdego, także admina.
      if (isOwnedTable(q.table)) {
        q.__ownerScope = ownerScope(q.table, req.user);
        enforceOwnedWrite(q, req.user);
        await assertTaskCommentTarget(q, req);
      }

      // Komunikator: tylko uczestnicy rozmowy, nadawca = ja, kanał ogłoszeń dla administratorów
      // (komunikator.js) — dla każdego, także admina aplikacji (prywatna korespondencja).
      if (isConversationTable(q.table)) {
        assertConversationFilters(q);
        q.__ownerScope = conversationScope(q.table, req.user);
        await enforceConversationWrite(q, req);
        // Realtime liczy odbiorców z wierszy zwróconych przez zapis — bez RETURNING (np. zapis
        // z mobilki bez .select()) zmiana nie docierała do nikogo.
        if (q.op !== 'select' && !q.returning) q.returning = '*';
        q.__preAudience = await conversationDeleteAudience(req.db, q).catch(() => null);
      }

      // Projekty: prywatne tablice tylko dla właściciela i edytorów (boardsScope.js).
      // Zapis: spójność tablicy (board_id z elementu/grupy), komentarze tylko autora, udostępnianie
      // i formularz tylko właściciela, source_kind tylko serwer (boardsScope.js).
      if (isBoardTable(q.table)) {
        q.__ownerScope = boardScope(q.table, req.user);
        const { moduleKeys } = await loadGrants(req.db, req.tenant.db_name);
        await enforceBoardWrite(q, req, {
          isAdmin, isSuperAdmin: !!user.is_super_admin, resolver, moduleKeys: moduleKeys || [],
        });
      }

      // Prawo tylko „w zakresie służby” (events/grafik/tablice modułu): wiersze zawężone do służb
      // osoby, AND z zakresem powyżej; zapis tylko do nich (moduleScope.js).
      if (access.ok && access.moduleScope) await applyModuleScope(q, req, access.moduleScope);

      // Poczta: skrzynka i jej wiadomości tylko dla właściciela (mailScope.js) — także dla admina.
      if (isMailTable(q.table)) {
        q.__ownerScope = mailScope(q.table, req.user);
        await enforceMailWrite(q, req);
      }

      // Wyczyść cache uprawnień przy zmianach ról/grantów.
      if (['app_permissions', 'permission_grants', 'app_roles', 'ministry_memberships'].includes(q.table) && q.op !== 'select') {
        invalidatePermissions(req.tenant.db_name);
      }

      // head + count: tylko liczba wierszy.
      // Te same zakresy co SELECT (kampus, widoczność wydarzeń, tablice, służby…) — buildCountQuery.
      if (q.op === 'select' && q.head && q.count) {
        const cq = buildCountQuery(q);
        const { rows } = await req.db.query(cq.sql, cq.params);
        return reply.send({ data: [], count: rows[0].count });
      }

      // Osoby w komórkach elementu tablicy PRZED zapisem — do powiadomień o przypisaniu (nie rzuca).
      const boardAssign = await prepareBoardAssignNotify(req.db, q);
      // Zadanie osobiste przypisywane innej osobie — stan przed zapisem (nie rzuca; push-hooks.js).
      const taskAssign = await prepareUserTaskAssign(req.db, q);

      const built = buildQuery(q);
      const result = await req.db.query(built.sql, built.params);
      let data = result.rows.map(unwrapRow);

      if (piiRestricted && q.op === 'select') data = redactPii(q.table, data, piiMe);

      // Ankiety anonimowe (K7): e-mail głosującego tylko w jego własnych głosach.
      if (q.table === 'poll_votes' && q.op === 'select' && Array.isArray(data) && data.length) {
        const anon = await anonymousPollIds(req.db, data.map((r) => r?.message_id));
        data = redactVotes(data, anon, req.user.email);
      }

      // Egzekwowanie pól przy odczycie: usuń kolumny bez prawa odczytu.
      if (access.resolver && q.op === 'select') {
        const denied = fieldColumns(q.table).filter((c) => !access.resolver.fieldReadable(q.table, c));
        if (denied.length && Array.isArray(data)) {
          for (const row of data) if (row) for (const c of denied) if (c in row) delete row[c];
        }
      }

      // Egzekwowanie modułów per tenant z poziomu platformy: moduł wyłączony
      // w panelu admina znika u tenanta niezależnie od lokalnego app_modules.
      if (q.op === 'select' && q.table === 'app_modules' && Array.isArray(data)) {
        const disabled = await platformDisabledModules(req.tenant.id);
        if (disabled.size) data = data.filter((m) => !disabled.has(m.key));
      }

      let count = null;
      if (q.op === 'select' && q.count) {
        const cq = buildCountQuery(q);
        const { rows } = await req.db.query(cq.sql, cq.params);
        count = rows[0].count;
      }

      // single/maybeSingle — semantyka supabase (błąd przy 0 lub >1 dla single).
      if (q.single) {
        if (data.length > 1) {
          throw new ApiError(406, 'Zapytanie zwróciło więcej niż jeden wiersz', 'PGRST116');
        }
        if (data.length === 0 && q.single !== 'maybe') {
          throw new ApiError(406, 'Zapytanie nie zwróciło wierszy', 'PGRST116');
        }
        data = data[0] ?? null;
      }

      // Realtime: powiadom subskrybentów o zmianach.
      if (q.op !== 'select') {
        const changed = Array.isArray(data) ? data : [data].filter(Boolean);
        // Zgłoszenia: tylko zgłaszający i moderatorzy.
        const reportAud = q.table === 'message_reports'
          ? await reportAudience(req.db, changed, (u) => isModeratorAccount(u, adminRoles, allGrants)).catch(() => new Set())
          : null;
        // Komunikator: zmiana trafia tylko do uczestników rozmowy.
        const audience = q.__preAudience
          ?? reportAud
          ?? (await conversationAudience(req.db, q.table, changed).catch(() => new Set()))
          ?? (await boardAudience(req.db, q.table, changed).catch(() => new Set()))
          ?? (await mailAudience(req.db, q.table, changed).catch(() => new Set()));
        // Głosy w ankietach anonimowych — e-mail tylko dla głosującego (także w realtime).
        const redact = q.table === 'poll_votes' ? await pollVotesRedactor(req.db, changed).catch(() => null) : null;
        emitChange(req.tenant.slug, q.table, q.op, changed, { audience, ...(redact ? { redact } : {}) });
      }

      // Push: nowa wiadomość / zaproszenie do służby. Fire-and-forget — nie blokuje
      // odpowiedzi i nie może jej wywrócić (błędy łapane w środku hooka).
      if (q.op === 'insert' && PUSH_ON_INSERT.has(q.table)) {
        notifyOnWrite({
          pool: req.db,
          table: q.table,
          op: q.op,
          values: q.values,
          actingUserEmail: req.user.email,
          log: req.log,
        }).catch((err) => req.log?.error?.({ err }, 'push-hooks failed'));
      }

      // Nowe zgłoszenie wiadomości: e-mail + push do moderatorów (reakcja w ciągu 24 h). Fire-and-forget.
      if (q.op === 'insert' && q.table === 'message_reports') {
        for (const r of (Array.isArray(data) ? data : [data]).filter(Boolean)) {
          notifyNewReport({ db: req.db, tenant: req.tenant, report: r, log: req.log });
        }
      }

      // Nowo przypisani w kolumnie „Osoby” elementu tablicy: powiadomienie + push. Fire-and-forget.
      if (boardAssign) notifyBoardAssignees({ db: req.db, tenant: req.tenant, prep: boardAssign, data, rowCount: result.rowCount, actor: req.user, log: req.log });
      // Zadanie osobiste przypisane innej osobie: wpis + push dla przypisanego. Fire-and-forget.
      if (taskAssign) notifyUserTaskAssign({ db: req.db, tenant: req.tenant, prep: taskAssign, data, rowCount: result.rowCount, actor: req.user, log: req.log });

      return reply.send({ data, count });
    } catch (err) {
      return sendError(reply, err, req);
    }
  });

  // ── RPC: dynamiczne DDL CustomModule (port funkcji z Supabase) ─────────
  // Bezpieczne w architekturze baza-per-tenant: DDL dotyka wyłącznie bazy tenanta.
  // Wymaga uprawnienia do zarządzania modułami (tworzenie tabel modułów własnych).
  app.post('/api/rpc/:name', { preHandler: [app.requireUser, app.block2FAPending, requireCapability('action:settings:manage_modules')] }, async (req, reply) => {
    const { name } = req.params;
    const args = req.body || {};
    try {
      const rpcs = await import('./rpc.js');
      const fn = rpcs.RPC_HANDLERS[name];
      if (!fn) throw new ApiError(404, `Nieznana funkcja RPC: ${name}`);
      const data = await fn(req.db, args, req);
      return reply.send({ data });
    } catch (err) {
      return sendError(reply, err, req);
    }
  });

  // ── Presence (odpowiednik raw PATCH user_presence z usePresence.js) ────
  // Tabela user_presence jest kluczowana po user_email (patrz usePresence.js).
  app.post('/api/presence', { preHandler: app.requireUser }, async (req, reply) => {
    const { status = 'online', last_seen } = req.body || {};
    await req.db.query(
      `INSERT INTO user_presence (user_email, status, last_seen, updated_at)
       VALUES ($1, $2, COALESCE($3::timestamptz, now()), now())
       ON CONFLICT (user_email) DO UPDATE
         SET status = EXCLUDED.status, last_seen = EXCLUDED.last_seen, updated_at = now()`,
      [req.user.email, status, last_seen || null]
    );
    emitChange(req.tenant.slug, 'user_presence', 'update', [{ user_email: req.user.email, status }]);
    return reply.send({ ok: true });
  });
}

// Moderator zgłoszeń Komunikatora: admin aplikacji albo osoba z action:komunikator:moderate
// (tryb legacy bez grantów — tylko admini).
function isModeratorAccount(u, adminRoles, grants) {
  if (!u) return false;
  if (u.is_super_admin || adminRoles.has(u.role)) return true;
  if (grants === null) return false;
  return makeResolver(grants, { role: u.role, userId: u.id, isAdmin: false }).can(MODERATE_CAPABILITY);
}

// Akceptacja/odrzucenie WŁASNEGO zaproszenia do służby przez zaproszonego,
// nawet bez ogólnego prawa zapisu do grafiku (res:schedule_assignments:update).
// Ograniczenia: tylko update statusu na 'accepted'/'rejected' na własnym wierszu.
async function allowAssignmentSelfRespond(q, req) {
  if (q.table !== 'schedule_assignments' || q.op !== 'update') return false;
  const values = q.values || {};
  const cols = Object.keys(values);
  const allowedCols = ['status', 'responded_at', 'updated_at'];
  if (!cols.length || !cols.every((c) => allowedCols.includes(c))) return false;
  if (!['accepted', 'rejected'].includes(String(values.status))) return false;
  // Filtr musi wskazywać pojedynczy wiersz po id.
  const f = q.filters || [];
  const idFilter = f.find((x) => x.type === 'eq' && x.column === 'id');
  if (f.length !== 1 || !idFilter) return false;
  // Właścicielstwo: wiersz musi należeć do zalogowanego (assigned_email == email).
  const { rows } = await req.db.query(
    `SELECT 1 FROM schedule_assignments
      WHERE id = $1 AND lower(assigned_email) = lower($2)`,
    [idFilter.value, req.user.email],
  );
  return rows.length > 0;
}

// Edycja / usunięcie / oznaczenie „wysłuchana" WŁASNEJ prośby o modlitwę przez autora,
// mimo że rola „czlonek" ma tylko res:prayer_requests:read+create (bez update/delete).
// Wzorzec jak allowAssignmentSelfRespond: filtr musi wskazywać pojedynczy wiersz po id,
// a wiersz musi należeć do zalogowanego (user_email == email). Przy update dozwolone
// wyłącznie kolumny treści/statusu — NIGDY user_email (brak przejęcia autorstwa cudzego wpisu).
async function allowOwnPrayerWrite(q, req) {
  if (q.table !== 'prayer_requests' || (q.op !== 'update' && q.op !== 'delete')) return false;
  if (!req.user?.email) return false;
  // Filtr musi wskazywać dokładnie jeden wiersz po id.
  const f = q.filters || [];
  const idFilter = f.find((x) => x.type === 'eq' && x.column === 'id');
  if (f.length !== 1 || !idFilter) return false;
  if (q.op === 'update') {
    const allowedCols = [
      'content', 'category', 'requester_name', 'is_anonymous', 'visibility',
      'status', 'answered_testimony', 'is_active', 'updated_at',
    ];
    const cols = Object.keys(q.values || {});
    if (!cols.length || !cols.every((c) => allowedCols.includes(c))) return false;
  }
  // Właścicielstwo: wiersz musi należeć do zalogowanego.
  const { rows } = await req.db.query(
    `SELECT 1 FROM prayer_requests WHERE id = $1 AND lower(user_email) = lower($2)`,
    [idFilter.value, req.user.email],
  );
  return rows.length > 0;
}

// materials_files / materials_folders: update i delete dozwolone, gdy rola daje
// res:<tabela>:update|delete (rada, koordynator), albo gdy żądanie dotyczy jednego
// WŁASNEGO wiersza (plik: uploaded_by, folder: created_by — e-mail). Pozostałe operacje
// i tabele bez zmian. Tryb legacy (resolver null) nie jest ograniczany.
const MATERIALS_OWNER = { materials_files: 'uploaded_by', materials_folders: 'created_by' };

async function allowMaterialsWrite(q, req, access) {
  const ownerCol = MATERIALS_OWNER[q.table];
  if (!ownerCol) return true;
  if (!access.resolver) return true;
  // Upsert z nadpisaniem (DO UPDATE) zmieniłby istniejący — być może cudzy — plik: tylko z prawem
  // edycji wszystkich plików. Bez nadpisywania (ignoreDuplicates) to zwykłe dodanie.
  if (q.op === 'upsert') return !!q.ignoreDuplicates || access.resolver.can(crudCapability(q.table, 'update'));
  if (q.op !== 'update' && q.op !== 'delete') return true;
  if (access.resolver.can(crudCapability(q.table, q.op))) return true;
  if (!req.user?.email) return false;
  const f = q.filters || [];
  const idFilter = f.find((x) => x.type === 'eq' && x.column === 'id');
  if (f.length !== 1 || !idFilter) return false;
  const { rows } = await req.db.query(
    `SELECT 1 FROM ${quoteIdent(q.table)} WHERE id = $1 AND lower(${quoteIdent(ownerCol)}) = lower($2)`,
    [idFilter.value, req.user.email],
  );
  return rows.length > 0;
}

// Aktualizacja własnego profilu w app_users mimo braku roli admina.
async function allowSelfUpdate(q, req) {
  if (q.table !== 'app_users' || q.op !== 'update') return false;
  const rule = getTableRule('app_users');
  const allowedCols = rule.selfUpdateColumns || [];
  const cols = Object.keys(q.values || {});
  if (!cols.every((c) => allowedCols.includes(c))) return false;
  // Filtry muszą wskazywać wyłącznie własny wiersz (id lub email).
  const f = q.filters || [];
  return (
    f.length === 1 &&
    f[0].type === 'eq' &&
    ((f[0].column === 'id' && String(f[0].value) === String(req.user.id)) ||
      (f[0].column === 'email' && f[0].value?.toLowerCase() === req.user.email?.toLowerCase()))
  );
}

function proposalRows(q) {
  return (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
}

// team_type propozycji widocznych bez dostępu do Finansów: zespoły z zakładką Finanse
// (tab:<moduł>:finances — rola albo przynależność do służby) i moduły własne z dostępem
// (nazwa i klucz, bo FinanceWidget zapisuje `moduleName || moduleKey`). Moduł własny =
// bez component_name i spoza katalogu (sermons/rsvp/ai mają komponent, choć nie są w katalogu).
async function proposalTeamTypes(req, resolver) {
  const out = new Set();
  for (const [key, label] of Object.entries(PROPOSAL_TEAM_TYPES)) {
    if (resolver.can(`tab:${key}:finances`)) out.add(label);
  }
  try {
    const { rows } = await req.db.query(`SELECT key, label, component_name FROM app_modules`);
    for (const m of rows) {
      if (!m.key || m.component_name || BUILTIN_MODULE_KEYS.has(m.key)) continue;
      if (!resolver.can(`module:${m.key}`)) continue;
      out.add(m.key);
      if (m.label) out.add(m.label);
    }
  } catch { /* brak tabeli — tylko zespoły wbudowane */ }
  return [...out];
}

// Wyznacza module_key żądania na module_records (insert: z values; pozostałe: z filtra eq).
// Zwraca null, gdy żądanie nie jest jednoznacznie zawężone do jednego modułu.
function moduleRecordsModuleKey(q) {
  if (q.op === 'insert') {
    const rows = Array.isArray(q.values) ? q.values : [q.values];
    const keys = new Set(rows.map((r) => r && r.module_key).filter(Boolean));
    return keys.size === 1 ? String([...keys][0]) : null;
  }
  const f = (q.filters || []).find((x) => x.type === 'eq' && x.column === 'module_key');
  return f ? String(f.value) : null;
}

function unwrapRow(row) {
  if (row && typeof row === 'object' && '__row' in row) {
    const { __row, ...rest } = row;
    return { ...__row, ...rest };
  }
  return row;
}

function sendError(reply, err, req) {
  if (err instanceof ApiError) {
    // Loguj odmowy/awarie (403/5xx) z kontekstem — inaczej logi pokazują goły statusCode
    // bez powodu, co uniemożliwia diagnozę „skąd 403 na /api/db".
    if (err.status === 403 || err.status >= 500) {
      req.log?.warn?.({
        table: req.body?.table, op: req.body?.op,
        role: req.user?.role, userId: req.user?.id, reason: err.message,
      }, 'data api denied');
    }
    return reply.code(err.status).send({ error: err.message, code: err.code });
  }
  req.log.error({ err }, 'data api error');
  // Format zbliżony do błędów PostgREST — klient supabase-compat go rozumie.
  return reply.code(400).send({ error: err.message, code: err.code || null, details: err.detail || null });
}
