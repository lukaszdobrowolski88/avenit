// Pliki z Dysku Google i OneDrive / SharePoint (Faza 3 integracji, migracja 120) — bez kopiowania.
// POST /api/fn/cloud-files { action, provider, ... } — każda zalogowana osoba, tylko WŁASNE połączenie:
//   status          — stan obu dostawców (bez tokenów): włączone przez kościół, dostępne, połączone, konto
//   connect         — adres autoryzacji (Google drive.file / Microsoft Files.Read.All) + ciasteczko wiążące
//   disconnect      — odłączenie plików (połączenie zostaje, jeśli obsługuje też kalendarz)
//   picker_session  — Google: krótko ważny token dostępu + klucz API i numer projektu Pickera;
//                     Microsoft: adres OneDrive osoby + token dla tego zasobu (File Picker v8)
//   token           — Microsoft: token dla zasobu, o który prosi Picker (tylko *.sharepoint.com / Graph)
//   resolve         — metadane wybranych plików pobrane od dostawcy → znormalizowane odnośniki
//   share           — Google: udostępnienie osobom z organizacji (domain, reader) — jawna opcja
// Nigdy nie zwraca refresh tokenu ani tokenów innych osób. Szczegóły: docs/integrations-workspace.md.
import { config, isProd } from '../config.js';
import { isProvider, resolveIntegrationCreds } from '../integrations/providers.js';
import { IntegrationError } from '../integrations/tokens.js';
import { startConnect, NONCE_COOKIE, STATE_TTL_MS } from '../integrations/oauth.js';
import {
  filesStatus, filesEnabled, pickerSession, pickerToken, resolvePicked, shareWithOrganization, disconnectFiles,
} from '../integrations/cloudFiles.js';

export const name = 'cloud-files';
export const isPublic = false;
export const rateLimit = { max: 120, timeWindow: '10 minutes' };

export async function cloudFilesAction(req) {
  const db = req.db;
  const b = req.body || {};
  const action = String(b.action || 'status');
  const provider = String(b.provider || '');
  const { rows } = await db.query(`SELECT id, email, COALESCE(is_active, true) AS is_active FROM app_users WHERE id::text = $1`, [String(req.user?.id ?? '')]);
  const me = rows[0];
  if (!me || me.is_active === false) throw new IntegrationError('Brak konta.', { status: 403, code: 'forbidden' });
  if (action === 'status') return { providers: await filesStatus(db, me.id) };
  if (!isProvider(provider)) throw new IntegrationError('Nieznany dostawca.', { status: 400 });

  if (action === 'connect') {
    if (!(await filesEnabled(db, provider))) {
      throw new IntegrationError('Pliki z tej usługi są wyłączone przez administratora kościoła.', { status: 403, code: 'files_disabled' });
    }
    const creds = await resolveIntegrationCreds(db, provider);
    const { url, nonce } = await startConnect(db, {
      provider, purpose: 'files', tenant: req.tenant.subdomain, user: { id: me.id, email: me.email }, creds,
    });
    return { url, __cookie: nonce };
  }
  if (action === 'disconnect') return { success: true, removed: await disconnectFiles(db, me.id, provider) };
  if (action === 'picker_session') return await pickerSession(db, me.id, provider);
  if (action === 'token') return await pickerToken(db, me.id, provider, b.resource);
  if (action === 'resolve') return await resolvePicked(db, me, provider, b.items);
  if (action === 'share') return await shareWithOrganization(db, me, provider, b.file_ids);
  throw new IntegrationError('Nieznana akcja.', { status: 400 });
}

export default async function handler(req, reply) {
  try {
    const out = await cloudFilesAction(req);
    if (out.__cookie) {
      // Nonce na domenie nadrzędnej — czytelny na centralnym callbacku app.<domena> (jak SSO).
      reply.setCookie(NONCE_COOKIE, out.__cookie, {
        httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', domain: `.${config.APP_DOMAIN}`, maxAge: Math.floor(STATE_TTL_MS / 1000),
      });
      delete out.__cookie;
    }
    // Tokeny dostępu osoby — bez zapisu w pamięci podręcznej pośredników i przeglądarki.
    reply.header('Cache-Control', 'no-store');
    return reply.send(out);
  } catch (e) {
    if (e instanceof IntegrationError) return reply.code(e.status || 400).send({ error: e.message, code: e.code });
    req.log.error({ err: e }, 'cloud-files failed');
    return reply.code(500).send({ error: 'Błąd plików z chmury.' });
  }
}
