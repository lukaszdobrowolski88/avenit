import React, { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

export default function AttendanceWidget() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_sessions')
          .select('id, title, session_date, headcount')
          .order('session_date', { ascending: false })
          .limit(8);
        if (error) throw error;
        if (active) setSessions((data || []).reverse());
      } catch (e) {
        if (active) setUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-accent-primary-light border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (unavailable || sessions.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><ClipboardCheck size={24} className="text-blue-500" /></div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{unavailable ? tr('Moduł Frekwencja nieaktywny') : tr('Brak danych o frekwencji')}</p>
      </div>
    );
  }

  const max = Math.max(1, ...sessions.map((s) => s.headcount || 0));
  const last = sessions[sessions.length - 1];

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs text-gray-400">{tr('Ostatnia frekwencja')}</span>
        <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{last?.headcount ?? 0}</span>
      </div>
      <div className="flex items-end justify-between gap-1 h-20">
        {sessions.map((s) => (
          <div key={s.id} className="flex-1 flex flex-col items-center gap-1 group" title={`${s.title || ''} · ${s.headcount || 0}`}>
            <div className="w-full flex items-end justify-center h-16">
              <div className="w-full max-w-[18px] rounded-t bg-gradient-to-t from-blue-500 to-indigo-400 transition-all group-hover:opacity-80" style={{ height: `${Math.max(4, Math.round(((s.headcount || 0) / max) * 100))}%` }} />
            </div>
            <span className="text-[9px] text-gray-400">{s.session_date ? new Date(s.session_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' }) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
