import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, MapPinOff } from 'lucide-react';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import { STATUS_COLORS } from '../../../components/ui/DataTable';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import { tr } from '../../../i18n';

// Geokodowanie adresów przez Nominatim (OSM), z cache w pamięci + localStorage (po adresie) —
// każdy adres pytamy raz, kolejne zmiany zadań biorą współrzędne z cache bez sieci.
const mem = {};
const geoKey = (address) => 'boardgeo:' + String(address).toLowerCase().trim();
function cachedGeo(address) {
  const key = geoKey(address);
  if (key in mem) return mem[key];
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) { const v = JSON.parse(raw); mem[key] = v; return v; }
  } catch { /* prywatne okno / zablokowany magazyn — zostaje cache w pamięci */ }
  return undefined; // undefined = jeszcze nie pytaliśmy; null = adres nieznaleziony
}
async function geocode(address) {
  const key = geoKey(address);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
    const data = await res.json();
    const v = data && data[0] ? { lat: +data[0].lat, lon: +data[0].lon } : null;
    mem[key] = v;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
    return v;
  } catch { return null; } // błąd sieci nie trafia do cache — spróbujemy następnym razem
}

// Kolor trafia do stylu przez CSSOM (el.style), nigdy przez HTML — i tylko poprawny hex.
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : STATUS_COLORS.neutral);

// Pinezka i dymek budowane z węzłów DOM, nie z łańcucha HTML: nazwy zadań przychodzą m.in.
// z anonimowego formularza publicznego, więc wklejenie ich do HTML byłoby zapisanym XSS.
function pinIcon(color) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    background: safeColor(color), width: '18px', height: '18px', borderRadius: '50% 50% 50% 0',
    transform: 'rotate(-45deg)', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)',
  });
  return L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 20], html: el });
}
function tooltipNode(text) {
  const span = document.createElement('span');
  span.textContent = text; // textContent = zawsze zwykły tekst
  return span;
}

// Widok Mapa — kafelki OSM (Leaflet) + markery zadań po adresie (kolumna Lokalizacja).
export default function MapView({ data, config, onOpenItem }) {
  const locCol = data.columns.find(c => c.type === 'location');
  const locColId = locCol?.id;
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fitKeyRef = useRef('');
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(0);
  // Najświeższe zadania i callback w refach — klik w marker otwiera aktualną wersję zadania,
  // a nowa tożsamość funkcji/obiektów przy każdym renderze nie przebudowuje mapy.
  const itemsRef = useRef(data.items);
  itemsRef.current = data.items;
  const openRef = useRef(onOpenItem);
  openRef.current = onOpenItem;

  const located = useMemo(() => {
    if (!locColId) return [];
    return applyView(data.items, data.columns, config).filter(it => String(it.cells?.[locColId] || '').trim());
  }, [data.items, data.columns, config, locColId]);
  const hasAny = located.length > 0;

  // Markery zależą tylko od tego, co widać na mapie (id, nazwa, adres, kolor) — zmiana innych pól
  // zadania nie odpala ponownie geokodowania ani kadrowania mapy.
  const markersKey = useMemo(() => JSON.stringify(located.map((it) => {
    const l = statusCol ? findLabel(statusCol, it.cells?.[statusCol.id]) : null;
    return { id: it.id, name: it.name || tr('Bez nazwy'), addr: String(it.cells[locColId]).trim(), color: boardColor(l?.color) };
  })), [located, statusCol, locColId]);

  // Inicjalizacja mapy — zależna od id kolumny (nie od tożsamości obiektu kolumny, która zmienia
  // się przy każdym odświeżeniu danych) i od tego, czy jest co pokazać (czy kontener istnieje).
  useEffect(() => {
    if (!locColId || !hasAny || mapRef.current || !containerRef.current) return undefined;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([52.0, 19.4], 6); // Polska
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    fitKeyRef.current = '';
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, [locColId, hasAny]);

  // Markery: najpierw wszystko, co jest w cache (od razu), brakujące adresy geokodujemy po kolei
  // (limit Nominatim ~1/s). Kadrowanie tylko, gdy zmienił się zbiór adresów.
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return undefined;
    let alive = true;
    const list = JSON.parse(markersKey);
    const draw = () => {
      const layer = layerRef.current;
      if (!layer) return [];
      layer.clearLayers();
      const pts = [];
      let miss = 0;
      for (const m of list) {
        const g = cachedGeo(m.addr);
        if (g === null) { miss++; continue; }
        if (!g) continue;
        L.marker([g.lat, g.lon], { icon: pinIcon(m.color), title: m.name, alt: m.name, keyboard: true })
          .bindTooltip(tooltipNode(m.name), { direction: 'top' })
          .on('click', () => { const it = itemsRef.current.find(x => x.id === m.id); if (it) openRef.current?.(it); })
          .addTo(layer);
        pts.push([g.lat, g.lon]);
      }
      setMissing(miss);
      return pts;
    };
    const fit = (pts) => {
      const key = [...new Set(list.map(m => m.addr.toLowerCase()))].sort().join('|');
      if (pts.length && key !== fitKeyRef.current && mapRef.current) {
        fitKeyRef.current = key;
        mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      }
    };
    const pending = [...new Set(list.map(m => m.addr))].filter(a => cachedGeo(a) === undefined);
    const pts = draw();
    if (!pending.length) { fit(pts); setLoading(false); return () => { alive = false; }; }
    (async () => {
      setLoading(true);
      for (let i = 0; i < pending.length; i++) {
        await geocode(pending[i]);
        if (!alive) return;
        if (i < pending.length - 1) await new Promise(r => setTimeout(r, 1100)); // limit Nominatim
        if (!alive) return;
      }
      fit(draw());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [markersKey, hasAny, locColId]);

  if (!locCol) {
    return <EmptyState icon={MapPin} title={tr('Dodaj kolumnę typu „Lokalizacja”, aby zobaczyć mapę.')} />;
  }
  if (!hasAny) {
    return (
      <EmptyState icon={MapPinOff} title={tr('Nikt jeszcze nie wpisał adresu')}
        subtitle={tr('Wpisz adres w kolumnie „{name}”, a pinezka pojawi się na mapie.', { name: locCol.name })} />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
        <MapPin size={15} aria-hidden="true" /> {tr('Z adresem: {n}', { n: located.length })}
        {loading && <Spinner size={14} label={tr('Szukanie adresów…')} />}
        {!loading && missing > 0 && <span>· {tr('{n} bez współrzędnych', { n: missing })}</span>}
      </div>
      {/* isolate: panele Leafleta mają z-index 400+ — bez własnego kontekstu warstw przykrywały
          okno zadania (Modal z-100) otwierane kliknięciem w marker. */}
      <div ref={containerRef} role="region" aria-label={tr('Mapa')}
        className="isolate w-full h-[60vh] sm:h-[560px] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700" />
    </div>
  );
}
