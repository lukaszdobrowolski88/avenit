import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin } from 'lucide-react';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';

// Geokodowanie adresów przez Nominatim (OSM), z cache w localStorage + pamięci.
const mem = {};
async function geocode(address) {
  const key = 'boardgeo:' + address.toLowerCase().trim();
  if (key in mem) return mem[key];
  const cached = localStorage.getItem(key);
  if (cached !== null) { const v = JSON.parse(cached); mem[key] = v; return v; }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
    const data = await res.json();
    const v = data && data[0] ? { lat: +data[0].lat, lon: +data[0].lon } : null;
    localStorage.setItem(key, JSON.stringify(v)); mem[key] = v; return v;
  } catch { return null; }
}
const pinIcon = (color) => L.divIcon({
  className: '', iconSize: [20, 20], iconAnchor: [10, 20],
  html: `<div style="background:${color};width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
});

// Widok Mapa — kafelki OSM (Leaflet) + markery elementów po adresie (kolumna Lokalizacja).
export default function MapView({ data, config, onOpenItem }) {
  const locCol = data.columns.find(c => c.type === 'location');
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(0);

  const located = useMemo(() => {
    if (!locCol) return [];
    return applyView(data.items, data.columns, config).filter(it => (it.cells?.[locCol.id] || '').trim());
  }, [data.items, data.columns, config, locCol]);

  // Inicjalizacja mapy raz
  useEffect(() => {
    if (!locCol || mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([52.0, 19.4], 6); // Polska
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [locCol]);

  // Markery po zmianie danych (geokodowanie sekwencyjne, cache-first)
  useEffect(() => {
    if (!mapRef.current || !layerRef.current || !locCol) return;
    let alive = true;
    (async () => {
      setLoading(true); setMissing(0);
      layerRef.current.clearLayers();
      const pts = [];
      let miss = 0;
      for (const it of located) {
        const addr = it.cells[locCol.id];
        const cachedKey = 'boardgeo:' + addr.toLowerCase().trim();
        const wasCached = (cachedKey in mem) || localStorage.getItem(cachedKey) !== null;
        const g = await geocode(addr);
        if (!alive) return;
        if (g) {
          const l = statusCol ? findLabel(statusCol, it.cells?.[statusCol.id]) : null;
          const m = L.marker([g.lat, g.lon], { icon: pinIcon(l ? l.color : '#6366f1') })
            .bindTooltip(it.name || 'Element', { direction: 'top' })
            .on('click', () => onOpenItem?.(it));
          m.addTo(layerRef.current);
          pts.push([g.lat, g.lon]);
        } else miss++;
        if (!wasCached) await new Promise(r => setTimeout(r, 1100)); // limit Nominatim
      }
      if (!alive) return;
      if (pts.length) mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      setMissing(miss); setLoading(false);
    })();
    return () => { alive = false; };
  }, [located, locCol, statusCol]);

  if (!locCol) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu „Lokalizacja", aby zobaczyć elementy na mapie.</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
        <MapPin size={15} /> {located.length} elementów z adresem
        {loading && <span className="flex items-center gap-1 text-accent-primary"><Loader2 size={13} className="animate-spin" /> geokodowanie…</span>}
        {!loading && missing > 0 && <span className="text-amber-500">· {missing} bez współrzędnych</span>}
      </div>
      <div ref={containerRef} className="w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 560 }} />
    </div>
  );
}
