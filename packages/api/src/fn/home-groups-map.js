// Mapa grup domowych (member-facing) — zwraca grupy z współrzędnymi do pinezek.
// Sam fakt istnienia grupy + nazwa + przybliżona lokalizacja NIE są prywatne (jak
// my-home-groups); kontaktów TU nie zwracamy. Współrzędnych grupy nie mają w danych,
// więc leniwie geokodujemy adres serwerowo (Nominatim/OpenStreetMap, keyless) i cache'ujemy
// w home_groups.latitude/longitude. Na żądanie geokodujemy MAŁĄ paczkę (do 3) brakujących,
// żeby nie przeciążać OSM ani nie blokować odpowiedzi — kolejne wejścia uzupełniają resztę.
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'home-groups-map';
export const method = 'POST';

const GEOCODE_LIMIT = 3; // maks. prób na jedno żądanie (polityka OSM: bądź grzeczny)

async function geocode(address, log) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Avenit/1.0 (church-manager; kontakt przez avenit.pl)' },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
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
    const { rows } = await req.db.query(
      `SELECT id, name, location, address, latitude, longitude, geocoded_at, campus_id
         FROM home_groups
        ORDER BY name ASC`
    );

    // Leniwe geokodowanie: grupy bez współrzędnych, z adresem, nigdy nie próbowane.
    const toGeocode = rows
      .filter((g) => g.latitude == null && !g.geocoded_at && (g.address || g.location))
      .slice(0, GEOCODE_LIMIT);

    for (const g of toGeocode) {
      const query = g.address || g.location;
      const hit = await geocode(query, req.log);
      try {
        if (hit) {
          await req.db.query(
            `UPDATE home_groups SET latitude = $1, longitude = $2, geocoded_at = now() WHERE id = $3`,
            [hit.lat, hit.lon, g.id]
          );
          g.latitude = hit.lat;
          g.longitude = hit.lon;
        } else {
          // Stempel, by nie ponawiać w kółko nieudanego adresu.
          await req.db.query(`UPDATE home_groups SET geocoded_at = now() WHERE id = $1`, [g.id]);
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
      latitude: g.latitude ?? null,
      longitude: g.longitude ?? null,
      campus_id: g.campus_id ?? null,
    }));

    return reply.send({ groups });
  } catch (e) {
    req.log?.error?.(e, 'home-groups-map failed');
    return reply.send({ groups: [] });
  }
}
