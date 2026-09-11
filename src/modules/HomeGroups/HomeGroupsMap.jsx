import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Search, Navigation } from 'lucide-react';
import { tr } from '../../i18n';

// Geokodowanie adresów przez Nominatim (OSM) — cache w pamięci + localStorage, rate-limit.
const mem = {};
async function geocode(address) {
  const a = String(address || '').trim();
  if (!a) return null;
  const key = 'hggeo:' + a.toLowerCase();
  if (key in mem) return mem[key];
  const cached = localStorage.getItem(key);
  if (cached !== null) { const v = JSON.parse(cached); mem[key] = v; return v; }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(a)}`);
    const data = await res.json();
    const v = data && data[0] ? { lat: +data[0].lat, lon: +data[0].lon } : null;
    localStorage.setItem(key, JSON.stringify(v)); mem[key] = v; return v;
  } catch { return null; }
}
const wasCached = (address) => {
  const key = 'hggeo:' + String(address || '').trim().toLowerCase();
  return (key in mem) || localStorage.getItem(key) !== null;
};

// Odległość w km (Haversine).
function distanceKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const groupIcon = (highlight) => L.divIcon({
  className: '', iconSize: [22, 22], iconAnchor: [11, 22],
  html: `<div style="background:${highlight ? '#10b981' : '#6366f1'};width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
});
const userIcon = () => L.divIcon({
  className: '', iconSize: [18, 18], iconAnchor: [9, 9],
  html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(239,68,68,.35)"></div>`,
});

export default function HomeGroupsMap({ groups = [], leaders = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const groupLayerRef = useRef(null);
  const userLayerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(0);
  const [coords, setCoords] = useState({});       // groupId -> {lat,lon}
  const [address, setAddress] = useState('');
  const [userPoint, setUserPoint] = useState(null);
  const [searching, setSearching] = useState(false);

  const withAddress = useMemo(() => groups.filter((g) => (g.address || g.location || '').trim()), [groups]);
  const leaderName = (id) => leaders.find((l) => l.id === id)?.full_name;

  // Inicjalizacja mapy raz.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([52.0, 19.4], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    groupLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Geokodowanie grup + markery.
  useEffect(() => {
    if (!mapRef.current || !groupLayerRef.current) return;
    let alive = true;
    (async () => {
      setLoading(true); setMissing(0);
      groupLayerRef.current.clearLayers();
      const found = {}; const pts = []; let miss = 0;
      for (const g of withAddress) {
        const addr = g.address || g.location;
        const cachedBefore = wasCached(addr);
        const geo = await geocode(addr);
        if (!alive) return;
        if (geo) {
          found[g.id] = geo; pts.push([geo.lat, geo.lon]);
          const ln = leaderName(g.leader_id);
          L.marker([geo.lat, geo.lon], { icon: groupIcon(false) })
            .bindTooltip(`<b>${g.name}</b>${g.meeting_day ? `<br>${g.meeting_day} ${g.meeting_time || ''}` : ''}${ln ? `<br>${tr('Lider')}: ${ln}` : ''}`, { direction: 'top' })
            .addTo(groupLayerRef.current);
        } else miss++;
        if (!cachedBefore) await new Promise((r) => setTimeout(r, 1100));
      }
      if (!alive) return;
      setCoords(found); setMissing(miss); setLoading(false);
      if (pts.length && !userPoint) mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withAddress]);

  // Najbliższe grupy wg wpisanego adresu.
  const nearest = useMemo(() => {
    if (!userPoint) return [];
    return withAddress
      .filter((g) => coords[g.id])
      .map((g) => ({ g, km: distanceKm(userPoint, coords[g.id]) }))
      .sort((a, b) => a.km - b.km);
  }, [userPoint, coords, withAddress]);

  const searchNearest = async () => {
    if (!address.trim()) return;
    setSearching(true);
    try {
      const geo = await geocode(address);
      if (!geo) { setUserPoint(null); return; }
      setUserPoint(geo);
      // Marker użytkownika + dopasowanie widoku do użytkownika i najbliższej grupy.
      userLayerRef.current.clearLayers();
      L.marker([geo.lat, geo.lon], { icon: userIcon() }).bindTooltip(tr('Twój adres'), { direction: 'top' }).addTo(userLayerRef.current);
    } finally { setSearching(false); }
  };

  // Podświetl najbliższą + wyśrodkuj po wyliczeniu.
  useEffect(() => {
    if (!userPoint || !mapRef.current || nearest.length === 0) return;
    const closest = nearest[0];
    const cg = coords[closest.g.id];
    mapRef.current.fitBounds([[userPoint.lat, userPoint.lon], [cg.lat, cg.lon]], { padding: [60, 60], maxZoom: 14 });
    // odśwież markery grup z podświetleniem najbliższej
    groupLayerRef.current.clearLayers();
    withAddress.forEach((g) => {
      const geo = coords[g.id]; if (!geo) return;
      const ln = leaderName(g.leader_id);
      L.marker([geo.lat, geo.lon], { icon: groupIcon(g.id === closest.g.id) })
        .bindTooltip(`<b>${g.name}</b>${g.meeting_day ? `<br>${g.meeting_day} ${g.meeting_time || ''}` : ''}${ln ? `<br>${tr('Lider')}: ${ln}` : ''}`, { direction: 'top' })
        .addTo(groupLayerRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearest]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchNearest(); }}
            placeholder={tr('Wpisz swój adres, aby znaleźć najbliższą grupę…')}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <button onClick={searchNearest} disabled={searching} className="px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />} {tr('Znajdź najbliższą')}
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <MapPin size={15} /> {withAddress.length} {tr('grup z adresem')}
        {loading && <span className="flex items-center gap-1 text-accent-primary"><Loader2 size={13} className="animate-spin" /> {tr('geokodowanie…')}</span>}
        {!loading && missing > 0 && <span className="text-amber-500">· {missing} {tr('bez współrzędnych')}</span>}
      </div>

      <div ref={containerRef} className="w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 460 }} />

      {userPoint && (
        <div>
          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">{tr('Najbliższe grupy')}</h4>
          {nearest.length === 0 ? (
            <p className="text-sm text-gray-400">{tr('Brak grup z rozpoznanym adresem.')}</p>
          ) : (
            <div className="space-y-2">
              {nearest.slice(0, 5).map(({ g, km }, i) => (
                <div key={g.id} className={`flex items-center gap-3 p-3 rounded-xl border ${i === 0 ? 'border-emerald-300 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${i === 0 ? 'bg-emerald-500' : 'bg-accent-primary'}`}><MapPin size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{g.name}{i === 0 && <span className="ml-2 text-[10px] font-semibold text-emerald-600">{tr('najbliżej')}</span>}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{g.address || g.location}{g.meeting_day ? ` · ${g.meeting_day} ${g.meeting_time || ''}` : ''}</div>
                  </div>
                  <div className="font-bold text-gray-700 dark:text-gray-200 shrink-0">{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
