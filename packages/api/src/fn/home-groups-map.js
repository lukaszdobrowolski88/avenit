// Mapa grup domowych (member-facing) — zwraca grupy z współrzędnymi do pinezek.
// Sam fakt istnienia grupy + nazwa + przybliżona lokalizacja NIE są prywatne (jak
// my-home-groups); kontaktów TU nie zwracamy. Współrzędnych grupy nie mają w danych,
// więc leniwie geokodujemy adres serwerowo (Nominatim/OpenStreetMap, keyless) i cache'ujemy
// w home_groups.latitude/longitude. Na żądanie geokodujemy MAŁĄ paczkę (do 3) brakujących,
// żeby nie przeciążać OSM ani nie blokować odpowiedzi — kolejne wejścia uzupełniają resztę.
//
// Geokodowanie jest zawężone do Polski (countrycodes=pl) z podpowiedzią okolicy (viewbox wokół
// grup, które już mają współrzędne). Wynik spoza Polski = „nie znaleziono” — wcześniej wolny tekst
// typu „lokalizacja zmienna” trafiał do Kalifornii i zostawał w bazie na stałe. Zapisane
// współrzędne spoza Polski są czyszczone i geokodowane ponownie. Gdy serwer nie ma własnych
// współrzędnych, korzysta z tych zapisanych przez web (home_groups.lat/lng).
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'home-groups-map';
export const method = 'POST';

const GEOCODE_LIMIT = 3; // maks. prób na jedno żądanie (polityka OSM: bądź grzeczny)

// Prostokąt Polski z marginesem.
export function inPoland(lat, lon) {
  const a = Number(lat); const b = Number(lon);
  if (lat == null || lon == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a >= 48.9 && a <= 55.0 && b >= 14.0 && b <= 24.3;
}

// Mediana punktów → viewbox „okolicy kościoła” (lon1,lat1,lon2,lat2) do podpowiedzi geokoderowi.
export function viewboxFor(points, pad = 0.6) {
  const pts = (points || []).filter((p) => inPoland(p.lat, p.lon));
  if (!pts.length) return null;
  const med = (arr) => { const s = [...arr].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const lat = med(pts.map((p) => Number(p.lat)));
  const lon = med(pts.map((p) => Number(p.lon)));
  return [lon - pad, lat + pad, lon + pad, lat - pad].map((v) => v.toFixed(4)).join(',');
}

export function geocodeUrl(address, viewbox = null) {
  const p = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'pl', 'accept-language': 'pl', q: String(address || '').trim() });
  if (viewbox) p.set('viewbox', viewbox);
  return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
}

async function geocode(address, log, viewbox = null) {
  try {
    const url = geocodeUrl(address, viewbox);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Avenit/1.0 (church-manager; kontakt przez avenit.pl)' },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!inPoland(lat, lon)) return null; // pomyłka geokodera (np. inny kraj)
    return { lat, lon };
  } catch (e) {
    log?.warn?.({ err: e }, 'geocode failed');
    return null;
  }
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.email) return reply.send({ groups: [] });

  try {
    let rows;
    try {
      ({ rows } = await req.db.query(
        `SELECT id, name, location, address, latitude, longitude, geocoded_at, campus_id, lat, lng
           FROM home_groups
          ORDER BY name ASC`
      ));
    } catch {
      // Starszy schemat bez kolumn lat/lng (web) — bez nich.
      ({ rows } = await req.db.query(
        `SELECT id, name, location, address, latitude, longitude, geocoded_at, campus_id
           FROM home_groups
          ORDER BY name ASC`
      ));
    }

    // Współrzędne spoza Polski to pomyłki — traktujemy jak brak (i geokodujemy ponownie).
    for (const g of rows) {
      g._bad = g.latitude != null && !inPoland(g.latitude, g.longitude);
      if (g._bad) { g.latitude = null; g.longitude = null; }
      // Brak własnych współrzędnych, a web już je wyliczył (lat/lng) → użyj ich.
      if (g.latitude == null && inPoland(g.lat, g.lng)) { g.latitude = Number(g.lat); g.longitude = Number(g.lng); g._fromWeb = true; }
    }
    const viewbox = viewboxFor(rows.filter((g) => g.latitude != null).map((g) => ({ lat: g.latitude, lon: g.longitude })));

    // Leniwe geokodowanie: grupy bez współrzędnych, z adresem — nigdy nie próbowane albo z błędnym wynikiem.
    const toGeocode = rows
      .filter((g) => g.latitude == null && (!g.geocoded_at || g._bad) && (g.address || g.location))
      .slice(0, GEOCODE_LIMIT);

    for (const g of toGeocode) {
      const query = g.address || g.location;
      const hit = await geocode(query, req.log, viewbox);
      try {
        if (hit) {
          await req.db.query(
            `UPDATE home_groups SET latitude = $1, longitude = $2, geocoded_at = now() WHERE id = $3`,
            [hit.lat, hit.lon, g.id]
          );
          g.latitude = hit.lat;
          g.longitude = hit.lon;
        } else {
          // Stempel, by nie ponawiać w kółko nieudanego adresu (i wyczyszczenie błędnych współrzędnych).
          await req.db.query(`UPDATE home_groups SET latitude = NULL, longitude = NULL, geocoded_at = now() WHERE id = $1`, [g.id]);
        }
      } catch (e) {
        req.log?.warn?.({ err: e }, 'home-groups-map cache write failed');
      }
    }

    const groups = rows.map((g) => ({
      id: g.id,
      name: g.name,
      location: g.location ?? null,
      // adres zwracamy (do nawigacji) — to nie kontakt osobowy, tylko miejsce spotkań
      address: g.address ?? null,
      latitude: inPoland(g.latitude, g.longitude) ? Number(g.latitude) : null,
      longitude: inPoland(g.latitude, g.longitude) ? Number(g.longitude) : null,
      campus_id: g.campus_id ?? null,
    }));

    return reply.send({ groups });
  } catch (e) {
    req.log?.error?.(e, 'home-groups-map failed');
    return reply.send({ groups: [] });
  }
}
