// Synchronizacja kont z katalogu Google Workspace / Microsoft 365 (src/integrations/directory.js).
// POST /api/fn/directory-sync { action: 'preview' | 'apply' | 'history', provider }
//   preview — podgląd zmian (nic nie zmienia; wpis w historii jako 'preview'),
//   apply   — zastosowanie: wymaga manage_integrations ORAZ manage_users,
//   history — ostatnie przebiegi.
// Worker: runForTenant co 6 h — tylko dostawcy z włączonym automatem i po pierwszym ręcznym „Zastosuj”.
import { integrationCaller } from '../integrations/access.js';
import { isProvider, PROVIDERS } from '../integrations/providers.js';
import { IntegrationError, loadConnection } from '../integrations/tokens.js';
import { runDirectorySync, syncHistory, loadDirectorySettings } from '../integrations/directory.js';
import { platformPool } from '../db.js';
import { accountsForecast } from '../tenant/accounts.js';

export const name = 'directory-sync';
export const isPublic = false;
export const capability = 'action:settings:manage_integrations';
export const rateLimit = { max: 20, timeWindow: '10 minutes' };

async function sendInvite(email, data) {
  const { sendInviteEmail } = await import('../lib/email.js');
  return sendInviteEmail(email, data);
}

export async function directoryAction(req, access, deps = {}) {
  const b = req.body || {};
  const action = String(b.action || 'preview');
  const provider = String(b.provider || '');
  if (!access.canIntegrations) throw new IntegrationError('Synchronizacją zarządza osoba z uprawnieniem „Zarządzaj integracjami”.', { status: 403, code: 'forbidden' });
  if (!isProvider(provider)) throw new IntegrationError('Nieznany dostawca.', { status: 400 });
  const actor = access.caller?.email || null;
  const ctx = { tenantSubdomain: req.tenant?.subdomain, sendInvite: deps.sendInvite || sendInvite };

  if (action === 'history') return { history: await syncHistory(req.db, provider, 20) };
  if (action === 'preview') {
    const res = await runDirectorySync(req.db, provider, { dryRun: true, actor, ctx });
    return { ...res, accountsLimit: await planForecast(req, res.plan?.counts, deps) };
  }
  if (action === 'apply') {
    if (!access.canUsers) {
      throw new IntegrationError('Zastosować synchronizację (zakładanie i blokowanie kont) może osoba z uprawnieniem „Zarządzaj użytkownikami”.', { status: 403, code: 'forbidden' });
    }
    return runDirectorySync(req.db, provider, { dryRun: false, trigger: 'manual', actor, ctx });
  }
  throw new IntegrationError('Nieznana akcja.', { status: 400 });
}

// Limit planu liczony w kontach użytkowników: „Po synchronizacji: X kont, limit planu Y”.
// Nowe konta (także te, które trafią do kolejki zatwierdzeń) minus blokowane. Tylko informacja —
// synchronizacja nikogo nie blokuje. Błąd liczenia (np. baza platform) → null, bez przerywania.
async function planForecast(req, counts, deps = {}) {
  if (!counts || !req.tenant?.id) return null;
  const delta = (counts.create || 0) - (counts.block || 0);
  try {
    const f = deps.forecast || ((d) => accountsForecast(platformPool, req.tenant.id, req.db, d));
    return await f(delta);
  } catch {
    return null;
  }
}

export default async function handler(req, reply) {
  try {
    const access = await integrationCaller(req.db, req.user.id, req.tenant.db_name);
    return reply.send(await directoryAction(req, access));
  } catch (e) {
    if (e instanceof IntegrationError) return reply.code(e.status || 400).send({ error: e.message, code: e.code });
    req.log.error({ err: e }, 'directory-sync failed');
    return reply.code(500).send({ error: 'Błąd synchronizacji katalogu.' });
  }
}

// Worker (co 6 h). Błąd jednego dostawcy nie blokuje drugiego; status połączenia i historia
// zapisują problem dla administratora.
export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  for (const provider of PROVIDERS) {
    let conn;
    try { conn = await loadConnection(pool, provider); } catch { return; } // brak tabel (przed 118)
    if (!conn || conn.status === 'revoked') continue;
    const settings = await loadDirectorySettings(pool, provider);
    if (!settings.enabled || !settings.first_applied_at) continue;
    try {
      const r = await runDirectorySync(pool, provider, {
        dryRun: false, trigger: 'schedule', actor: 'system',
        ctx: { tenantSubdomain: ctx.tenantSubdomain, sendInvite: ctx.sendInvite || sendInvite },
      });
      log(`directory-sync ${provider}: +${r.applied?.created || 0} kont, ${r.applied?.linked || 0} powiązań, ${r.applied?.blocked || 0} blokad${r.errors.length ? `, błędy: ${r.errors.length}` : ''}`);
    } catch (e) {
      log(`directory-sync ${provider}: błąd: ${e.message}`);
    }
  }
}
