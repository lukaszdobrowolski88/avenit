// Moduły wyłączone dla tenanta na poziomie PLATFORMY (panel admina → tenant_modules).
// Wspólne dla /api/db (filtr odczytu app_modules) i /api/fn/my-permissions (mobile),
// żeby web i mobilka chowały dokładnie te same moduły. Cache per tenant 60 s.
import { platformPool } from '../db.js';

const disabledModulesCache = new Map(); // tenantId -> { set, at }

export async function platformDisabledModules(tenantId) {
  const cached = disabledModulesCache.get(tenantId);
  if (cached && Date.now() - cached.at < 60_000) return cached.set;
  let set = new Set();
  try {
    const { rows } = await platformPool.query(
      `SELECT module_key FROM tenant_modules WHERE tenant_id = $1 AND is_enabled = false`,
      [tenantId]
    );
    set = new Set(rows.map((r) => r.module_key));
  } catch { /* brak tabeli/bazy — nic nie wyłączamy */ }
  disabledModulesCache.set(tenantId, { set, at: Date.now() });
  return set;
}
