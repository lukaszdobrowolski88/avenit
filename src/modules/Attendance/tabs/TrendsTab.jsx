import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, Calendar, Users, Repeat, BarChart3 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SESSION_TYPES, sessionTypeLabel, sessionTypeColor, sessionAttendance, weekStart, shortDate } from '../lib/attendanceApi';
import Spinner from '../../../components/Spinner';

const WEEKS = 12;

export default function TrendsTab({ withCampusFilter }) {
  const [sessions, setSessions] = useState([]);
  const [recordCounts, setRecordCounts] = useState({});   // sessionId -> liczba obecnych
  const [recordMembers, setRecordMembers] = useState({}); // sessionId -> Set(member_id)
  const [loading, setLoading] = useState(true);

  const rangeStart = useMemo(() => {
    const d = weekStart(new Date());
    d.setDate(d.getDate() - 7 * (WEEKS - 1));
    return d;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = rangeStart.toISOString().slice(0, 10);
      let q = supabase.from('attendance_sessions').select('*')
        .gte('session_date', startStr)
        .order('session_date', { ascending: true });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      const list = data || [];
      setSessions(list);

      const ids = list.map(s => s.id);
      const counts = {};
      const membersMap = {};
      if (ids.length) {
        const { data: recs } = await supabase
          .from('attendance_records')
          .select('session_id, member_id')
          .in('session_id', ids)
          .eq('present', true);
        (recs || []).forEach(r => {
          counts[r.session_id] = (counts[r.session_id] || 0) + 1;
          if (r.member_id) {
            if (!membersMap[r.session_id]) membersMap[r.session_id] = new Set();
            membersMap[r.session_id].add(r.member_id);
          }
        });
      }
      setRecordCounts(counts);
      setRecordMembers(membersMap);
    } catch (err) {
      console.error('Attendance trends load error:', err);
      setSessions([]);
      setRecordCounts({});
      setRecordMembers({});
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, rangeStart]);

  useEffect(() => { load(); }, [load]);

  // Wykres tygodniowy — łączna frekwencja w każdym z ostatnich 12 tygodni
  const weekly = useMemo(() => {
    const buckets = Array.from({ length: WEEKS }, (_, i) => {
      const start = new Date(rangeStart);
      start.setDate(start.getDate() + i * 7);
      return { start, label: shortDate(start), value: 0 };
    });
    sessions.forEach(s => {
      const ws = weekStart(s.session_date).getTime();
      const idx = buckets.findIndex(b => b.start.getTime() === ws);
      if (idx >= 0) buckets[idx].value += sessionAttendance(s, recordCounts[s.id]);
    });
    const max = Math.max(1, ...buckets.map(b => b.value));
    return buckets.map(b => ({ ...b, h: Math.round((b.value / max) * 100) }));
  }, [sessions, recordCounts, rangeStart]);

  // Podział frekwencji wg typu sesji
  const byType = useMemo(() => {
    const map = {};
    sessions.forEach(s => { map[s.session_type] = (map[s.session_type] || 0) + sessionAttendance(s, recordCounts[s.id]); });
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return SESSION_TYPES
      .map(t => ({ value: t.value, name: t.label, color: t.color, amount: map[t.value] || 0, pct: Math.round(((map[t.value] || 0) / total) * 100) }))
      .filter(t => t.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [sessions, recordCounts]);

  const stats = useMemo(() => {
    const total = sessions.reduce((s, x) => s + sessionAttendance(x, recordCounts[x.id]), 0);
    const count = sessions.length;
    const avg = count ? Math.round(total / count) : 0;
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthSessions = sessions.filter(s => {
      const d = new Date(s.session_date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    // Retencja: unikalni członkowie obecni na ostatnich 4 sesjach
    const last4 = [...sessions].sort((a, b) => new Date(b.session_date) - new Date(a.session_date)).slice(0, 4);
    const uniq = new Set();
    last4.forEach(s => { (recordMembers[s.id] || new Set()).forEach(id => uniq.add(id)); });

    return { total, count, avg, monthSessions, retention: uniq.size, last4Count: last4.length };
  }, [sessions, recordCounts, recordMembers]);

  const cards = [
    { label: 'Śr. frekwencja / sesję', value: stats.avg, icon: TrendingUp, tint: 'from-emerald-500 to-teal-500' },
    { label: 'Sesji (12 tyg.)', value: stats.count, icon: BarChart3, tint: 'from-blue-500 to-indigo-500' },
    { label: 'Sesji w tym miesiącu', value: stats.monthSessions, icon: Calendar, tint: 'from-amber-500 to-orange-500' },
    { label: `Retencja (${stats.last4Count} sesje)`, value: stats.retention, icon: Repeat, tint: 'from-violet-500 to-purple-500' },
  ];

  if (loading) return <Spinner center />;

  if (sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
        <BarChart3 size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Brak sesji w ostatnich 12 tygodniach. Dodaj sesje w zakładce „Sesje”, aby zobaczyć trendy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Karty statystyk */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.tint} flex items-center justify-center mb-3`}>
              <c.icon size={18} className="text-white" />
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{c.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend tygodniowy */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Frekwencja tygodniowo (12 tyg.)</h3>
          <div className="flex items-end justify-between gap-1.5 h-40">
            {weekly.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                <div className="w-full flex items-end justify-center h-32">
                  <div className="w-full max-w-[24px] rounded-t-md bg-gradient-to-t from-accent-primary to-accent-secondary transition-all group-hover:opacity-80" style={{ height: `${Math.max(2, w.h)}%` }} title={`${w.label}: ${w.value}`} />
                </div>
                <span className="text-[10px] text-gray-400">{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Podział wg typu */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Frekwencja wg typu</h3>
          {byType.length === 0 ? <p className="text-sm text-gray-400">Brak danych.</p> : (
            <div className="space-y-3">
              {byType.map(t => (
                <div key={t.value}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.name}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white tabular-nums">{t.amount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: t.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Retencja — opis */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} className="text-accent-primary dark:text-accent-primary-light" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Retencja członków</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          W ostatnich <b className="text-gray-900 dark:text-white">{stats.last4Count}</b> sesjach obecnych było imiennie
          <b className="text-accent-primary dark:text-accent-primary-light"> {stats.retention}</b> unikalnych członków.
          Wskaźnik liczy tylko osoby odznaczone imiennie na liście obecności (nie szybką liczbę headcount).
        </p>
      </div>
    </div>
  );
}
