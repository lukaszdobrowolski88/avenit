#!/usr/bin/env node
// Pobiera darmowe bazy GeoIP do GEOIP_DIR (domyślnie <STORAGE_DIR>/geoip).
//
// Domyślnie: DB-IP Lite (CC-BY 4.0, bez konta i klucza, odświeżane co miesiąc):
//   https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz
//   https://download.db-ip.com/free/dbip-asn-lite-YYYY-MM.mmdb.gz
// Z MAXMIND_LICENSE_KEY w env: dokładniejsze MaxMind GeoLite2 (tar.gz z .mmdb
// w środku — rozpakowujemy minimalnym czytnikiem tara, bez zależności).
//
// Wywoływany: przy starcie workera (gdy brak plików) + cron raz w tygodniu.
// Może być też uruchomiony ręcznie: node packages/api/scripts/update-geoip.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const GEOIP_DIR = process.env.GEOIP_DIR || path.join(STORAGE_DIR, 'geoip');
const MAXMIND_KEY = process.env.MAXMIND_LICENSE_KEY || '';

const log = (...a) => console.log(new Date().toISOString(), '[geoip]', ...a);

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Zapis atomowy: najpierw plik tymczasowy, potem rename — API/worker czytający
// bazę w trakcie podmiany nigdy nie zobaczy niedogranego pliku.
function writeAtomic(dest, buf) {
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
}

// Minimalny czytnik tar: nagłówki co 512 B (nazwa @0..100, rozmiar ósemkowo @124..136).
function extractMmdbFromTarGz(gzBuf, dest) {
  const tar = zlib.gunzipSync(gzBuf);
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = tar.subarray(off, off + 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(tar.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8) || 0;
    off += 512;
    if (name.endsWith('.mmdb')) {
      writeAtomic(dest, tar.subarray(off, off + size));
      return true;
    }
    off += Math.ceil(size / 512) * 512;
  }
  return false;
}

// DB-IP publikuje plik za bieżący miesiąc; na przełomie miesiąca bywa opóźnienie,
// więc przy 404 cofamy się o miesiąc.
function dbipMonths() {
  const now = new Date();
  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return [fmt(now), fmt(prev)];
}

async function updateDbip(kind, dest) {
  for (const month of dbipMonths()) {
    const url = `https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz`;
    try {
      const gz = await download(url);
      writeAtomic(dest, zlib.gunzipSync(gz));
      log(`OK ${path.basename(dest)} (DB-IP ${month}, ${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
      return;
    } catch (err) {
      log(`pominięto ${url}: ${err.message}`);
    }
  }
  throw new Error(`nie udało się pobrać bazy DB-IP ${kind}`);
}

async function updateMaxmind(edition, dest) {
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${MAXMIND_KEY}&suffix=tar.gz`;
  const gz = await download(url);
  if (!extractMmdbFromTarGz(gz, dest)) throw new Error(`brak .mmdb w archiwum ${edition}`);
  log(`OK ${path.basename(dest)} (MaxMind, ${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
}

export async function updateGeoipDb() {
  fs.mkdirSync(GEOIP_DIR, { recursive: true });
  if (MAXMIND_KEY) {
    await updateMaxmind('GeoLite2-City', path.join(GEOIP_DIR, 'GeoLite2-City.mmdb'));
    await updateMaxmind('GeoLite2-ASN', path.join(GEOIP_DIR, 'GeoLite2-ASN.mmdb'));
  } else {
    await updateDbip('city', path.join(GEOIP_DIR, 'dbip-city-lite.mmdb'));
    await updateDbip('asn', path.join(GEOIP_DIR, 'dbip-asn-lite.mmdb'));
  }
}

// Czy jakakolwiek baza city już leży na dysku (do warunkowego pobrania przy starcie).
export function geoipFilesPresent() {
  return ['GeoLite2-City.mmdb', 'dbip-city-lite.mmdb']
    .some((f) => fs.existsSync(path.join(GEOIP_DIR, f)));
}

// Uruchomienie z CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  updateGeoipDb().catch((err) => {
    console.error('[geoip] błąd:', err.message);
    process.exit(1);
  });
}
