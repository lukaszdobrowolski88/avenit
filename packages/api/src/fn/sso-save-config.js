// Admin: zapis konfiguracji SSO (Google/Microsoft). Sekret klienta szyfrowany (AES-256-GCM)
// przed zapisem do app_settings; nigdy nie wraca do klienta w jawnej postaci.
import { getCaller, isAdmin } from '../lib/user-admin.js';
import { encryptPassword } from '../lib/mailcrypto.js';
import { config } from '../config.js';

export const name = 'sso-save-config';
export const isPublic = false;

const SECRET = () => config.MAIL_ENCRYPTION_SECRET || config.JWT_SECRET;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });

  const provider = String(req.body?.provider || '');
  if (!['google', 'microsoft'].includes(provider)) return reply.code(400).send({ error: 'Nieznany dostawca.' });

  const set = (k, v) =>
    req.db.query('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [k, String(v)]);

  const b = req.body || {};
  if (b.enabled != null) await set(`sso_${provider}_enabled`, b.enabled ? 'on' : 'off');
  if (b.client_id != null) await set(`sso_${provider}_client_id`, b.client_id);
  if (provider === 'microsoft' && b.tenant != null) await set('sso_microsoft_tenant', b.tenant || 'common');
  if (b.client_secret) {
    const enc = await encryptPassword(String(b.client_secret), SECRET());
    await set(`sso_${provider}_client_secret_enc`, enc);
  }
  if (b.auto_provision != null) await set('sso_auto_provision', b.auto_provision ? 'on' : 'off');
  if (b.default_role != null) await set('sso_default_role', b.default_role || '');

  return reply.send({ success: true });
}
