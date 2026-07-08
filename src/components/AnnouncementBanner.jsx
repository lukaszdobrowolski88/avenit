import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Info, AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react';

// Baner ogłoszeń systemowych (z platformy). Pobiera aktywne ogłoszenia
// z /api/announcements i pokazuje na górze; odrzucone chowa (localStorage).
const STYLES = {
  info: { cls: 'bg-blue-500', icon: Info },
  success: { cls: 'bg-green-500', icon: CheckCircle },
  warning: { cls: 'bg-amber-500', icon: AlertTriangle },
  critical: { cls: 'bg-red-500', icon: AlertOctagon },
};

export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('avenit_dismissed_ann') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    let mounted = true;
    supabase._request('/api/announcements')
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((d) => { if (mounted) setItems(d.announcements || []); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem('avenit_dismissed_ann', JSON.stringify(next)); } catch {}
  };

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((a) => {
        const s = STYLES[a.level] || STYLES.info;
        const Icon = s.icon;
        return (
          <div key={a.id} className={`${s.cls} text-white px-4 py-2.5 flex items-center gap-3 text-sm`}>
            <Icon size={18} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">{a.title}</span>
              {a.body && <span className="opacity-90"> — {a.body}</span>}
            </div>
            <button onClick={() => dismiss(a.id)} className="shrink-0 opacity-80 hover:opacity-100" aria-label="Zamknij">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
