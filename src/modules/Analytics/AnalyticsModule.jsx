import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
import { BarChart3, Users, UserPlus, UserCheck, UserCircle, Gift, CalendarCheck, Filter, TrendingUp, Music } from 'lucide-react';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import CcliTab from './CcliTab';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import CustomSelect from '../../components/CustomSelect';
import { formatMoney, formatNumber, MONTHS, MEMBER_STATUSES, aggregateMonthly, yearOptions } from './lib/analyticsApi';
import Spinner from '../../components/Spinner';
import { tr } from '../../i18n';

// Wykres słupkowy miesięczny (styl jak w Giving/OverviewTab)
function MonthlyBars({ data, format = (v) => v, highlightMonth = -1 }) {
  return (
    <div className="flex items-end justify-between gap-1.5 h-40">
      {data.map((mo) => (
        <div key={mo.m} className="flex-1 flex flex-col items-center gap-1.5 group">
          <div className="w-full flex items-end justify-center h-32">
            <div
              className="w-full max-w-[24px] rounded-t-md bg-gradient-to-t from-accent-primary to-accent-secondary transition-all group-hover:opacity-80"
              style={{ height: `${Math.max(2, mo.h)}%` }}
              title={format(mo.v)}
            />
          </div>
          <span className={`text-[10px] ${mo.m === highlightMonth ? 'text-accent-primary font-bold' : 'text-gray-400'}`}>{tr(MONTHS[mo.m])}</span>
        </div>
      ))}
    </div>
  );
}

// Ładowanie frekwencji: najpierw attendance_sessions (headcount),
// w razie braku tabeli/kolumny fallback do attendance (liczba obecności).
async function loadAttendance(start, end, withCampusFilter) {
  // 1) attendance_sessions — jedna sesja = headcount
  try {
    // Kolumna daty sesji to session_date (filtr po „date” kończył się błędem 42703 i pustym wykresem).
    let q = supabase.from('attendance_sessions').select('*').gte('session_date', start).lte('session_date', end);
    q = withCampusFilter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length) {
      const monthly = aggregateMonthly(
        data,
        (s) => s.date || s.session_date || s.created_at,
        (s) => Number(s.headcount ?? s.attendance_count ?? s.count ?? 0)
      );
      if (monthly.some((mo) => mo.v > 0)) return { available: true, monthly, mode: 'sessions' };
    }
  } catch { /* brak tabeli/kolumny — próbuj fallback */ }

  // 2) attendance — liczba rekordów obecności (present = true)
  try {
    let q = supabase.from('attendance').select('date, present').gte('date', start).lte('date', end).eq('present', true);
    q = withCampusFilter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data) {
      const monthly = aggregateMonthly(data, (r) => r.date, () => 1);
      return { available: true, monthly, mode: 'records' };
    }
  } catch { /* brak tabeli — sekcja nieaktywna */ }

  return { available: false };
}

// Raport CCLI (ewidencja wykonań pieśni) — przeniesiony z modułu Dostępność do Analityki.
function CcliPanel({ withCampusFilter, campusIdForInsert }) {
  const [songs, setSongs] = useState([]);
  const [programs, setPrograms] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from('songs').select('id, title, author').order('title', { ascending: true }),
        withCampusFilter(supabase.from('programs').select('id, title, date').order('date', { ascending: false })),
      ]);
      if (!alive) return;
      setSongs(s || []);
      setPrograms(p || []);
    })();
    return () => { alive = false; };
  }, [withCampusFilter]);
  const songsById = useMemo(() => Object.fromEntries(songs.map((x) => [x.id, x])), [songs]);
  const programsById = useMemo(() => Object.fromEntries(programs.map((x) => [x.id, x])), [programs]);
  return (
    <CcliTab songs={songs} songsById={songsById} programs={programs} programsById={programsById}
      campusIdForInsert={campusIdForInsert} withCampusFilter={withCampusFilter} />
  );
}

const TABS = [
  { id: 'overview', label: 'Przegląd', icon: BarChart3 },
  { id: 'ccli', label: 'Raport CCLI', icon: Music },
];

export default function AnalyticsModule() {
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [tab, setTab] = useState('overview');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const [members, setMembers] = useState([]);
  const [donations, setDonations] = useState([]);
  const [donationsAvailable, setDonationsAvailable] = useState(true);
  const [attendance, setAttendance] = useState(null);
  const [attendanceAvailable, setAttendanceAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const years = useMemo(() => yearOptions(5), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    // --- Członkowie (bazowa tabela, zawsze) ---
    try {
      let q = supabase.from('members').select('id, first_name, last_name, status, membership_date');
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Analytics members error:', err);
      setMembers([]);
    }

    // --- Dawanie (opcjonalnie — moduł Giving może nie istnieć) ---
    try {
      let q = supabase.from('donations')
        .select('amount, donation_date, status, fund_id, member_id')
        .gte('donation_date', start).lte('donation_date', end)
        .eq('status', 'completed');
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setDonations(data || []);
      setDonationsAvailable(true);
    } catch {
      setDonations([]);
      setDonationsAvailable(false);
    }

    // --- Frekwencja (opcjonalnie) ---
    const att = await loadAttendance(start, end, withCampusFilter);
    setAttendance(att.available ? att : null);
    setAttendanceAvailable(att.available);

    setLoading(false);
  }, [withCampusFilter, year]);

  useEffect(() => { loadData(); }, [loadData, selectedCampusId]);

  // --- Metryki ---
  const totalMembers = members.length;

  const statusCounts = useMemo(() => {
    const c = { 'Członek': 0, 'Sympatyk': 0, 'Gość': 0 };
    members.forEach((m) => { if (c[m.status] !== undefined) c[m.status] += 1; });
    return c;
  }, [members]);

  const newThisYear = useMemo(
    () => members.filter((m) => m.membership_date && new Date(m.membership_date).getFullYear() === year).length,
    [members, year]
  );

  const growthMonthly = useMemo(
    () => aggregateMonthly(
      members.filter((m) => m.membership_date && new Date(m.membership_date).getFullYear() === year),
      (m) => m.membership_date,
      () => 1
    ),
    [members, year]
  );

  const donationTotalYear = useMemo(() => donations.reduce((s, d) => s + (Number(d.amount) || 0), 0), [donations]);
  const donationMonthly = useMemo(
    () => aggregateMonthly(donations, (d) => d.donation_date, (d) => Number(d.amount) || 0),
    [donations]
  );

  const funnel = useMemo(() => {
    const rows = MEMBER_STATUSES.map((s) => ({ ...s, count: statusCounts[s.value] || 0 }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [statusCounts]);

  const highlightMonth = year === currentYear ? new Date().getMonth() : -1;

  const cards = [
    { key: 'total', label: tr('Wszyscy'), value: formatNumber(totalMembers), icon: Users, tint: 'from-violet-500 to-purple-500' },
    { key: 'czlonek', label: tr('Członkowie'), value: formatNumber(statusCounts['Członek']), icon: UserCheck, tint: 'from-emerald-500 to-teal-500' },
    { key: 'sympatyk', label: tr('Sympatycy'), value: formatNumber(statusCounts['Sympatyk']), icon: UserCircle, tint: 'from-blue-500 to-indigo-500' },
    { key: 'gosc', label: tr('Goście'), value: formatNumber(statusCounts['Gość']), icon: Users, tint: 'from-slate-400 to-slate-500' },
    { key: 'new', label: tr('Nowi w {year}', { year }), value: formatNumber(newThisYear), icon: UserPlus, tint: 'from-amber-500 to-orange-500' },
    { key: 'giving', label: tr('Dawanie {year}', { year }), value: donationsAvailable ? formatMoney(donationTotalYear) : '—', icon: Gift, tint: 'from-pink-500 to-rose-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        moduleKey="analytics"
        icon={BarChart3}
        title={tr('Analityka')}
        subtitle={tr('Strategiczny obraz wzrostu, dawania i zaangażowania')}
        actions={tab === 'overview' ? <div className="w-full sm:w-40"><CustomSelect value={year} onChange={setYear} options={years} icon={Filter} /></div> : null}
      />

      <ResponsiveTabs moduleKey="analytics" tabs={TABS.map((t) => ({ ...t, label: tr(t.label) }))} activeTab={tab} onChange={setTab} />

      {tab === 'ccli' ? (
        <CcliPanel withCampusFilter={withCampusFilter} campusIdForInsert={campusIdForInsert} />
      ) : loading ? (
        <Spinner center />
      ) : (
        <div className="space-y-5">
          {/* Karty statystyk */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => (
              <div key={c.key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.tint} flex items-center justify-center mb-3`}>
                  <c.icon size={18} className="text-white" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums truncate" title={String(c.value)}>{c.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Wzrost + Dawanie w czasie */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Nowi członkowie per miesiąc */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">{tr('Nowe osoby w {year}', { year })}</h3>
              </div>
              {growthMonthly.some((mo) => mo.v > 0)
                ? <MonthlyBars data={growthMonthly} format={(v) => `${formatNumber(v)} ${tr('os.')}`} highlightMonth={highlightMonth} />
                : <p className="text-sm text-gray-400 py-10 text-center">{tr('Brak dat członkostwa w tym roku.')}</p>}
            </div>

            {/* Dawanie miesięczne */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Gift size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">{tr('Dawanie w {year}', { year })}</h3>
              </div>
              {!donationsAvailable
                ? <p className="text-sm text-gray-400 py-10 text-center">{tr('Brak danych / moduł Dawania nieaktywny.')}</p>
                : donationMonthly.some((mo) => mo.v > 0)
                  ? <MonthlyBars data={donationMonthly} format={(v) => formatMoney(v)} highlightMonth={highlightMonth} />
                  : <p className="text-sm text-gray-400 py-10 text-center">{tr('Brak darowizn w tym roku.')}</p>}
            </div>
          </div>

          {/* Frekwencja + Lejek */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Frekwencja */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarCheck size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">{tr('Frekwencja w {year}', { year })}</h3>
                {attendanceAvailable && attendance?.mode === 'records' && (
                  <span className="text-[10px] text-gray-400">({tr('liczba obecności')})</span>
                )}
              </div>
              {!attendanceAvailable || !attendance?.monthly
                ? <p className="text-sm text-gray-400 py-10 text-center">{tr('Brak danych / moduł nieaktywny.')}</p>
                : attendance.monthly.some((mo) => mo.v > 0)
                  ? <MonthlyBars data={attendance.monthly} format={(v) => `${formatNumber(v)}`} highlightMonth={highlightMonth} />
                  : <p className="text-sm text-gray-400 py-10 text-center">{tr('Brak zarejestrowanej frekwencji w tym roku.')}</p>}
            </div>

            {/* Lejek gość → sympatyk → członek */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">{tr('Lejek zaangażowania')}</h3>
              </div>
              {totalMembers === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">{tr('Brak osób w bazie.')}</p>
              ) : (
                <div className="space-y-4">
                  {funnel.map((f) => (
                    <div key={f.value}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />{tr(f.label)}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white tabular-nums">{formatNumber(f.count)}</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, f.pct)}%`, background: f.color }} />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-1">
                    {tr('Łącznie {n} osób w wybranym kampusie.', { n: formatNumber(totalMembers) })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
