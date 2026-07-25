// Wzbogacanie danych analitycznych: GeoIP (miasto + ASN z plików mmdb),
// reverse DNS, parsowanie User-Agent, wykrywanie botów.
//
// Bazy mmdb (DB-IP Lite lub MaxMind GeoLite2) leżą w GEOIP_DIR — pobiera je
// scripts/update-geoip.mjs (cron w workerze + przy starcie). Brak plików nie
// blokuje trackingu: enrichment zwraca nulle, reszta działa normalnie.
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { open as openMmdb } from 'maxmind';
import UAParser from 'ua-parser-js';
import { isbot } from 'isbot';
import { config } from '../config.js';

export const geoipDir = () => config.GEOIP_DIR || path.join(config.STORAGE_DIR, 'geoip');

// Preferuj GeoLite2 (dokładniejsze), fallback na DB-IP Lite.
const CITY_FILES = ['GeoLite2-City.mmdb', 'dbip-city-lite.mmdb'];
const ASN_FILES = ['GeoLite2-ASN.mmdb', 'dbip-asn-lite.mmdb'];

let cityReader = null;
let asnReader = null;
let loadedAt = 0;
const RELOAD_MS = 24 * 60 * 60 * 1000; // pliki podmienia cron — przeładuj raz na dobę

async function openFirst(files) {
  for (const f of files) {
    const p = path.join(geoipDir(), f);
    if (!fs.existsSync(p)) continue;
    try {
      return await openMmdb(p);
    } catch {
      // uszkodzony/niedograny plik — spróbuj następnego
    }
  }
  return null;
}

async function ensureReaders() {
  const now = Date.now();
  if (loadedAt && now - loadedAt < RELOAD_MS && (cityReader || asnReader)) return;
  loadedAt = now;
  [cityReader, asnReader] = await Promise.all([openFirst(CITY_FILES), openFirst(ASN_FILES)]);
}

// Geo + organizacja z ASN dla adresu IP. Zwraca nulle gdy brak baz/wpisu.
export async function lookupIp(ip) {
  await ensureReaders();
  const out = { country: null, region: null, city: null, asnOrg: null };
  if (!ip) return out;
  try {
    const c = cityReader?.get(ip);
    if (c) {
      out.country = c.country?.iso_code || null;
      out.region = c.subdivisions?.[0]?.names?.en || null;
      out.city = c.city?.names?.en || null;
    }
  } catch { /* nieprawidłowy IP (np. unix socket) */ }
  try {
    const a = asnReader?.get(ip);
    if (a) out.asnOrg = a.autonomous_system_organization || null;
  } catch { /* jw. */ }
  return out;
}

// Reverse DNS z twardym timeoutem — identyfikacja "czyje łącze" (styl bazo.io).
// Cache LRU: kościoły siedzą za wspólnym NAT, te same IP wracają.
const rdnsCache = new Map();
const RDNS_CACHE_MAX = 1000;
const RDNS_TIMEOUT_MS = 1000;

export async function reverseDns(ip) {
  if (!ip) return null;
  if (rdnsCache.has(ip)) {
    const v = rdnsCache.get(ip);
    rdnsCache.delete(ip);
    rdnsCache.set(ip, v); // odśwież pozycję LRU
    return v;
  }
  let host = null;
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((resolve) => setTimeout(() => resolve(null), RDNS_TIMEOUT_MS)),
    ]);
    host = Array.isArray(names) && names[0] ? String(names[0]).slice(0, 255) : null;
  } catch {
    host = null;
  }
  rdnsCache.set(ip, host);
  if (rdnsCache.size > RDNS_CACHE_MAX) rdnsCache.delete(rdnsCache.keys().next().value);
  return host;
}

// User-Agent → { deviceType, browser, browserVersion, os }.
export function parseUa(ua) {
  if (!ua) return { deviceType: null, browser: null, browserVersion: null, os: null };
  const r = new UAParser(ua).getResult();
  const t = r.device?.type;
  return {
    deviceType: t === 'mobile' || t === 'tablet' ? t : 'desktop',
    browser: r.browser?.name || null,
    browserVersion: r.browser?.version || null,
    os: r.os?.name || null,
  };
}

export const isBotUa = (ua) => isbot(ua || '');
