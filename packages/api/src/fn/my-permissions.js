// „Moje uprawnienia" (mobile) — zwraca to, czego web używa do bramkowania UI, policzone
// SERWEROWO tym samym kodem co /api/db (loadGrants + resolver z @avenit/shared), żeby
// mobilka widziała dokładnie to samo co web dla tej samej osoby.
//
// Dlaczego endpoint, a nie czytanie tabel z klienta jak web (PermissionsContext):
//  • web pobiera CAŁE permission_grants (nadpisania wszystkich osób) — tu zwracamy tylko
//    granty dotyczące zalogowanego (jego rola + jego nadpisania + jego służby);
//  • rola i is_super_admin z ŻYWEJ bazy (token bywa nieaktualny), jak w /api/db;
//  • widoczność modułu (app_modules.is_enabled + platforma + can(resource_key)) liczona
//    w jednym miejscu, identycznie jak Sidebar weba.
//
// Odpowiedź:
//   { role, isAdmin, legacy, appUserId, campusId,
//     grants: [{ role, user_id, capability, allowed }],   // do makeResolver po stronie klienta
//     ministries: [{ ministry_key, role, campus_id }],
//     modules: [{ key, label, icon, path, resource_key, is_system, display_order, visible }],
//     tabs: [{ id, module_key, key, label, component_type, display_order, visible }] }
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany, widzi tylko swoje).
import { loadGrants } from '../dataapi/registry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';
import { platformDisabledModules } from '../lib/platform-modules.js';

export const name = 'my-permissions';
export const method = 'POST';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const userId = req.user?.id;
  if (!userId) return reply.code(401).send({ error: 'Brak sesji' });

  try {
    const { rows: meRows } = await req.db.query(
      `SELECT id, role, is_super_admin, campus_id FROM app_users WHERE id = $1`,
      [userId]
    );
    const me = meRows[0];
    if (!me) return reply.code(404).send({ error: 'Nie znaleziono konta' });

    const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
    const legacy = grants === null;
    const isAdmin = !!me.is_super_admin || adminRoles.has(me.role);

    // Tylko granty tej osoby: jej rola + jej nadpisania (w tym wyprowadzone ze służb).
    const myGrants = legacy
      ? []
      : grants
          .filter((g) => (g.user_id != null && g.user_id === me.id) || (g.user_id == null && g.role === me.role))
          .map((g) => ({ role: g.role, user_id: g.user_id, capability: g.capability, allowed: g.allowed === true }));

    // Tryb legacy (przed migracją 005) — backend nie egzekwuje capability, więc nie
    // chowamy niczego, czego web by nie schował (requireCapability też przepuszcza).
    const resolver = makeResolver(myGrants, { role: me.role, userId: me.id, isAdmin });
    const canCap = (cap) => (legacy || isAdmin ? true : resolver.can(cap));

    let ministries = [];
    try {
      const { rows } = await req.db.query(
        `SELECT ministry_key, role, campus_id FROM ministry_memberships WHERE user_id = $1`,
        [me.id]
      );
      ministries = rows;
    } catch { /* brak tabeli (przed migracją 025) */ }

    const disabled = await platformDisabledModules(req.tenant.id);

    // Moduły: jak Sidebar weba — wiersz app_modules widoczny gdy is_enabled i can(resource_key).
    let modules = [];
    let moduleIdToKey = new Map();
    try {
      const { rows } = await req.db.query(
        `SELECT id, key, label, icon, path, resource_key, is_enabled, is_system, display_order
           FROM app_modules ORDER BY display_order NULLS LAST, key`
      );
      modules = rows
        .filter((m) => !disabled.has(m.key))
        .map((m) => {
          moduleIdToKey.set(m.id, m.key);
          const cap = m.resource_key || `module:${m.key}`;
          return {
            id: m.id,
            key: m.key,
            label: m.label,
            icon: m.icon ?? null,
            path: m.path ?? null,
            resource_key: cap,
            is_system: !!m.is_system,
            display_order: m.display_order ?? null,
            visible: m.is_enabled !== false && canCap(cap),
          };
        });
    } catch { /* brak tabeli */ }

    // Fallback, gdy app_modules puste (stary tenant): statyczny katalog + flagi app_settings.
    if (modules.length === 0) {
      let flags = {};
      try {
        const { rows } = await req.db.query(
          `SELECT key, value FROM app_settings WHERE key LIKE 'module\\_%\\_enabled'`
        );
        for (const r of rows) flags[r.key] = r.value;
      } catch { /* brak tabeli */ }
      modules = MODULES.filter((m) => !disabled.has(m.key)).map((m, i) => {
        const flag = flags[`module_${m.key}_enabled`];
        const enabled = flag === undefined ? true : !(flag === false || flag === 'false');
        return {
          key: m.key,
          label: m.label,
          icon: null,
          path: null,
          resource_key: `module:${m.key}`,
          is_system: true,
          display_order: i,
          visible: enabled && canCap(`module:${m.key}`),
        };
      });
    }

    // Zakładki modułów (kreator) — widoczne gdy moduł widoczny i can(tab:<mod>:<tab>).
    let tabs = [];
    try {
      const { rows } = await req.db.query(
        `SELECT id, module_id, key, label, display_order, component_type FROM app_module_tabs ORDER BY display_order NULLS LAST, key`
      );
      const visibleMods = new Set(modules.filter((m) => m.visible).map((m) => m.key));
      tabs = rows
        .map((t) => ({ ...t, module_key: moduleIdToKey.get(t.module_id) }))
        .filter((t) => t.module_key)
        .map((t) => ({
          id: t.id,
          module_key: t.module_key,
          key: t.key,
          label: t.label,
          component_type: t.component_type || 'empty',
          display_order: t.display_order ?? null,
          visible: visibleMods.has(t.module_key) && canCap(`tab:${t.module_key}:${t.key}`),
        }));
    } catch { /* brak tabeli */ }

    return reply.send({
      role: me.role,
      isAdmin,
      legacy,
      appUserId: me.id,
      campusId: me.campus_id ?? null,
      grants: myGrants,
      ministries,
      modules,
      tabs,
    });
  } catch (err) {
    req.log.error({ err }, '[my-permissions]');
    return reply.code(500).send({ error: 'Nie udało się wczytać uprawnień' });
  }
}
