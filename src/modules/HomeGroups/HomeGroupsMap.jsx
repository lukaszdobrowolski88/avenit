import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Search, Navigation, LocateFixed } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import {
  inPoland, distanceKm, medianPoint, viewboxAround, nominatimSearchUrl, isOutlier, groupLeaders, plural, normalizeWeekday,
} from './homeGroupUtils';

// Geokodowanie adresów przez Nominatim (OSM) zawężone do Polski (countrycodes=pl) i z podpowiedzią
// okolicy kościoła (viewbox wokół już znanych grup). Wynik spoza Polski albo daleko od pozostałych
// grup traktujemy jak „nie znaleziono” — wcześniej „lokalizacja zmienna” lądowała w Kalifornii,
// a mapa oddalała się na cały Atlantyk. Cache w pamięci + localStorage (nowy prefiks — stare,
// niezawężone wyniki są ignorowane).
const CACHE_PREFIX = 'hggeo2:';
const mem = {};
const cacheKey = (a, vb) => `${CACHE_PREFIX}${String(a || '').trim().toLowerCase()}${vb ? `@${vb}` : ''}`;
const readCache = (key) => {
  if (key in mem) return { hit: true, value: mem[key] };
  try {
    const cached = localStorage.getItem(key);
    if (cached !== null) { const v = JSON.parse(cached); mem[key] = v; return { hit: true, value: v }; }
  } catch { /* prywatny tryb — bez cache */ }
  return { hit: false, value: null };
};
async function geocode(address, viewbox = null) {
  const a = String(address || '').trim();
  if (!a) return null;
  const key = cacheKey(a, viewbox);
  const c = readCache(key);
  if (c.hit) return c.value;
  try {
    const res = await fetch(nominatimSearchUrl(a, { viewbox }));
    const data = await res.json();
    const hit = data && data[0] ? { lat: +data[0].lat, lon: +data[0].lon } : null;
    const v = hit && inPoland(hit.lat, hit.lon) ? hit : null;
    mem[key] = v;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
    return v;
  } catch { return null; }
}
const wasCached = (address, viewbox) => readCache(cacheKey(address, viewbox)).hit;

// Zapisane współrzędne grupy (web: lat/lng, serwer mobilki: latitude/longitude) — tylko z Polski.
const storedPoint = (g) => {
  const lat = g.lat ?? g.latitude; const lon = g.lng ?? g.longitude;
  if (lat == null || lon == null) return null;
  return inPoland(lat, lon) ? { lat: Number(lat), lon: Number(lon) } : null;
};

// Pinezki w kolorach marki: słód (grupa) i kurkuma (najbliższa / Twój adres).
const SLOD = '#2A2312';
const KURKUMA = '#FFBE0B';
const groupIcon = (highlight) => L.divIcon({
  className: '', iconSize: [22, 22], iconAnchor: [11, 22],
  html: `<div style="background:${highlight ? KURKUMA : SLOD};width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
});
const userIcon = () => L.divIcon({
  className: '', iconSize: [18, 18], iconAnchor: [9, 9],
  html: `<div style="background:${KURKUMA};width:14px;height:14px;border-radius:50%;border:3px solid ${SLOD};box-shadow:0 0 0 3px rgba(255,190,11,.35)"></div>`,
});

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayText = (d) => { const n = normalizeWeekday(d); return n ? tr(n) : (d || ''); };

export default function HomeGroupsMap({ groups = [], leaders = [], members = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const groupLayerRef = useRef(null);
  const userLayerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState([]); // grupy bez rozpoznanego adresu (nazwy)
  const [coords, setCoords] = useState({});       // groupId -> {lat,lon}
  const [address, setAddress] = useState('');
  const [userPoint, setUserPoint] = useState(null);
  const [searching, setSearching] = useState(false);

  const withAddress = useMemo(() => groups.filter((g) => (g.address || g.location || '').trim()), [groups]);
  const leaderNames = (g) => groupLeaders(g, members, leaders).map((l) => l.full_name).filter(Boolean).join(', ');
  const tooltip = (g) => {
    const ln = leaderNames(g);
    return `<b>${escapeHtml(g.name)}</b>${g.meeting_day ? `<br>${escapeHtml(dayText(g.meeting_day))} ${escapeHtml(String(g.meeting_time || '').slice(0, 5))}` : ''}${ln ? `<br>${escapeHtml(tr('Lider'))}: ${escapeHtml(ln)}` : ''}`;
  };

  // Inicjalizacja mapy raz (widok startowy: Polska).
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
      setLoading(true); setMissing([]);
      groupLayerRef.current.clearLayers();
      const found = {};
      // 1) Zapisane współrzędne (tylko z Polski) → środek „okolicy kościoła” do podpowiedzi geokoderowi.
      withAddress.forEach((g) => { const p = storedPoint(g); if (p) found[g.id] = p; });
      const center = medianPoint(Object.values(found));
      const viewbox = viewboxAround(center);
      // 2) Brakujące (albo zapisane spoza Polski) — geokoduj i ZAPISZ.
      for (const g of withAddress) {
        if (found[g.id]) continue;
        const addr = g.address || g.location;
        const cachedBefore = wasCached(addr, viewbox);
        const geo = await geocode(addr, viewbox);
        if (!alive) return;
        if (geo) {
          found[g.id] = geo;
          supabase.from('home_groups').update({ lat: geo.lat, lng: geo.lon }).eq('id', g.id).then(() => {}, () => {}); // best-effort zapis
        } else if (g.lat != null || g.lng != null) {
          // Zapisana pomyłka (np. Kalifornia) — czyścimy, żeby nie wracała.
          supabase.from('home_groups').update({ lat: null, lng: null }).eq('id', g.id).then(() => {}, () => {});
        }
        if (!cachedBefore) await new Promise((r) => setTimeout(r, 1100));
      }
      if (!alive) return;
      // 3) Odrzuć punkty odstające (daleko od pozostałych grup) — zwykle źle rozpoznany wolny tekst.
      const pts = Object.entries(found);
      const accepted = {};
      pts.forEach(([id, p]) => { if (!isOutlier(p, pts.filter(([o]) => o !== id).map(([, q]) => q))) accepted[id] = p; });
      const miss = withAddress.filter((g) => !accepted[g.id]).map((g) => g.name);
      withAddress.forEach((g) => {
        const geo = accepted[g.id]; if (!geo) return;
        L.marker([geo.lat, geo.lon], { icon: groupIcon(false), title: g.name }).bindTooltip(tooltip(g), { direction: 'top' }).addTo(groupLayerRef.current);
      });
      setCoords(accepted); setMissing(miss); setLoading(false);
      const bounds = Object.values(accepted).map((p) => [p.lat, p.lon]);
      if (bounds.length && !userPoint) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
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

  const setUserAt = (geo, label) => {
    setUserPoint(geo);
    userLayerRef.current.clearLayers();
    L.marker([geo.lat, geo.lon], { icon: userIcon() }).bindTooltip(escapeHtml(label), { direction: 'top' }).addTo(userLayerRef.current);
  };
  const searchNearest = async () => {
    if (!address.trim()) return;
    setSearching(true);
    try {
      const geo = await geocode(address, viewboxAround(medianPoint(Object.values(coords))));
      if (!geo) { setUserPoint(null); toast.info(tr('Nie znaleźliśmy tego adresu w Polsce. Dopisz miasto, np. „Legnicka 10, Wrocław”.')); return; }
      setUserAt(geo, tr('Twój adres'));
    } finally { setSearching(false); }
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error(tr('Twoja przeglądarka nie wspiera lokalizacji.')); return; }
    setSearching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserAt({ lat: pos.coords.latitude, lon: pos.coords.longitude }, tr('Twoja lokalizacja')); setSearching(false); },
      () => { setSearching(false); toast.error(tr('Nie udało się pobrać lokalizacji.')); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      L.marker([geo.lat, geo.lon], { icon: groupIcon(g.id === closest.g.id), title: g.name })
        .bindTooltip(tooltip(g), { direction: 'top' })
        .addTo(groupLayerRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearest]);

  const n = withAddress.length;
  const groupsWithAddress = plural(n, tr('{n} grupa z adresem', { n }), tr('{n} grupy z adresem', { n }), tr('{n} grup z adresem', { n }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            aria-label={tr('Twój adres')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchNearest(); }}
            placeholder={tr('Wpisz swój adres, aby znaleźć najbliższą grupę…')}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <button type="button" onClick={searchNearest} disabled={searching} className="px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {searching ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Navigation size={16} aria-hidden="true" />} {tr('Znajdź najbliższą')}
        </button>
        <button type="button" onClick={useMyLocation} disabled={searching} title={tr('Użyj mojej lokalizacji')} aria-label={tr('Użyj mojej lokalizacji')} className="px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 disabled:opacity-60">
          <LocateFixed size={16} aria-hidden="true" /> <span className="sm:hidden lg:inline">{tr('Moja lokalizacja')}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <MapPin size={15} aria-hidden="true" /> {groupsWithAddress}
        {loading && <Spinner size={14} label={tr('Szukam adresów na mapie…')} />}
        {!loading && missing.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400" title={missing.join(', ')}>
            · {tr('nie znaleziono na mapie: {names}', { names: missing.join(', ') })}
          </span>
        )}
      </div>
      {!loading && missing.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{tr('Wpisz w edycji grupy pełny adres (ulica, numer, miasto) w polu „Adres (do mapy)”.')}</p>
      )}

      <div ref={containerRef} role="region" aria-label={tr('Mapa grup domowych')} className="w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 460 }} />

      {userPoint && (
        <div>
          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">{tr('Najbliższe grupy')}</h4>
          {nearest.length === 0 ? (
            <EmptyState compact icon={MapPin} title={tr('Brak grup z rozpoznanym adresem.')} />
          ) : (
            <div className="space-y-2">
              {nearest.slice(0, 5).map(({ g, km }, i) => (
                <div key={g.id} className={`flex items-center gap-3 p-3 rounded-xl border ${i === 0 ? 'border-accent-primary bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${i === 0 ? 'bg-accent-primary text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'}`}><MapPin size={18} aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{g.name}{i === 0 && <span className="ml-2 text-[11px] font-semibold text-accent-primary-dark dark:text-accent-primary-light">{tr('najbliżej')}</span>}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{g.address || g.location}{g.meeting_day ? ` · ${dayText(g.meeting_day)} ${String(g.meeting_time || '').slice(0, 5)}` : ''}</div>
                  </div>
                  <div className="font-bold text-gray-700 dark:text-gray-200 shrink-0 tabular-nums">{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
