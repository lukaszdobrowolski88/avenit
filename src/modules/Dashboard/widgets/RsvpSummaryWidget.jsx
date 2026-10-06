import React, { useState, useEffect } from 'react';
import { CalendarCheck, Check, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';

export default function RsvpSummaryWidget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: camps, error } = await supabase
          .from('rsvp_campaigns')
          .select('id, title, event_date')
          .eq('status', 'sent')
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(5);
        if (error) throw error;
        const list = camps || [];
        const ids = list.map((c) => c.id);
        const counts = {};
        if (ids.length) {
          const { data: invs } = await supabase.from('rsvp_invitations').select('campaign_id, status').in('campaign_id', ids);
          (invs || []).forEach((i) => {
            counts[i.campaign_id] = counts[i.campaign_id] || { yes: 0, pending: 0 };
            if (i.status === 'yes') counts[i.campaign_id].yes++;
            if (i.status === 'pending') counts[i.campaign_id].pending++;
          });
        }
        if (active) setItems(list.map((c) => ({ ...c, ...(counts[c.id] || { yes: 0, pending: 0 }) })));
      } catch (e) {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <Spinner center />;
  }
  if (items.length === 0) {
    return <EmptyState compact icon={CalendarCheck} title={tr('Brak nadchodzących zaproszeń')} />;
  }
  return (
    <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
      {items.map((c) => (
        <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{c.title}</p>
            <p className="text-xs text-gray-400">{c.event_date ? new Date(c.event_date).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' }) : ''}</p>
          </div>
          <span className="shrink-0 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm font-semibold"><Check size={14} />{c.yes}</span>
          <span className="shrink-0 flex items-center gap-1 text-gray-400 text-sm"><Clock size={13} />{c.pending}</span>
        </div>
      ))}
    </div>
  );
}
