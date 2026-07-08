// JWT (access) + refresh tokeny (rotowane, hash w bazie).
// Access: HS256, krótki TTL. aud rozróżnia użytkowników tenanta i adminów platformy.
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);

export const AUD_TENANT = 'avenit:tenant';
export const AUD_ADMIN = 'avenit:admin';

// auid = "legacy" id użytkownika (auth_user_id z GoTrue, dla zmigrowanych kont)
// — dane produkcyjne (konwersacje, presence, created_by) są nim kluczowane.
export async function signAccessToken({ userId, authUserId, tenantSlug, role, email, aud }) {
  return new SignJWT({ ten: tenantSlug ?? null, role, email, auid: authUserId || String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token, aud) {
  const { payload } = await jwtVerify(token, secret, { audience: aud });
  return payload;
}

// Refresh token: 48 losowych bajtów; w bazie trzymamy tylko SHA-256.
export function newRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate() {
  return new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
}

// Zapis/rotacja/unieważnienie w dowolnej bazie (tenant: refresh_tokens, platform: admin_refresh_tokens).
export async function storeRefreshToken(pool, table, userColumn, userId, hash, userAgent) {
  await pool.query(
    `INSERT INTO ${table} (${userColumn}, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [userId, hash, refreshExpiryDate(), userAgent || null]
  );
}

export async function rotateRefreshToken(pool, table, userColumn, oldToken, userAgent) {
  const oldHash = hashRefreshToken(oldToken);
  const { rows } = await pool.query(
    `UPDATE ${table} SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING ${userColumn} AS user_id`,
    [oldHash]
  );
  if (!rows[0]) return null;
  const { token, hash } = newRefreshToken();
  await storeRefreshToken(pool, table, userColumn, rows[0].user_id, hash, userAgent);
  return { userId: rows[0].user_id, token };
}

export async function revokeRefreshToken(pool, table, token) {
  await pool.query(
    `UPDATE ${table} SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashRefreshToken(token)]
  );
}
