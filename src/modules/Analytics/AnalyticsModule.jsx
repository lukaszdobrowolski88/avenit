import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, Users, UserPlus, UserCheck, UserCircle, Gift, CalendarCheck, Filter, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import CustomSelect from '../../components/CustomSelect';
import { formatMoney, formatNumber, MONTHS, MEMBER_STATUSES, aggregateMonthly, yearOptions } from './lib/analyticsApi';

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
          <span className={`text-[10px] ${mo.m === highlightMonth ? 'text-accent-primary font-bold' : 'text-gray-400'}`}>{MONTHS[mo.m]}</span>
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
    let q = supabase.from('attendance_sessions').select('*').gte('date', start).lte('date', end);
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

export default function AnalyticsModule() {
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
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
    { key: 'total', label: 'Wszyscy', value: formatNumber(totalMembers), icon: Users, tint: 'from-violet-500 to-purple-500' },
    { key: 'czlonek', label: 'Członkowie', value: formatNumber(statusCounts['Członek']), icon: UserCheck, tint: 'from-emerald-500 to-teal-500' },
    { key: 'sympatyk', label: 'Sympatycy', value: formatNumber(statusCounts['Sympatyk']), icon: UserCircle, tint: 'from-blue-500 to-indigo-500' },
    { key: 'gosc', label: 'Goście', value: formatNumber(statusCounts['Gość']), icon: Users, tint: 'from-slate-400 to-slate-500' },
    { key: 'new', label: `Nowi w ${year}`, value: formatNumber(newThisYear), icon: UserPlus, tint: 'from-amber-500 to-orange-500' },
    { key: 'giving', label: `Dawanie ${year}`, value: donationsAvailable ? formatMoney(donationTotalYear) : '—', icon: Gift, tint: 'from-pink-500 to-rose-500' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
            <BarChart3 className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analityka</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Strategiczny obraz wzrostu, dawania i zaangażowania</p>
          </div>
        </div>
        <div className="w-full sm:w-40">
          <CustomSelect value={year} onChange={setYear} options={years} icon={Filter} />
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">Ładowanie...</div>
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
                <h3 className="font-semibold text-gray-900 dark:text-white">Nowe osoby w {year}</h3>
              </div>
              {growthMonthly.some((mo) => mo.v > 0)
                ? <MonthlyBars data={growthMonthly} format={(v) => `${formatNumber(v)} os.`} highlightMonth={highlightMonth} />
                : <p className="text-sm text-gray-400 py-10 text-center">Brak dat członkostwa w tym roku.</p>}
            </div>

            {/* Dawanie miesięczne */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Gift size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Dawanie w {year}</h3>
              </div>
              {!donationsAvailable
                ? <p className="text-sm text-gray-400 py-10 text-center">Brak danych / moduł Dawania nieaktywny.</p>
                : donationMonthly.some((mo) => mo.v > 0)
                  ? <MonthlyBars data={donationMonthly} format={(v) => formatMoney(v)} highlightMonth={highlightMonth} />
                  : <p className="text-sm text-gray-400 py-10 text-center">Brak darowizn w tym roku.</p>}
            </div>
          </div>

          {/* Frekwencja + Lejek */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Frekwencja */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarCheck size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Frekwencja w {year}</h3>
                {attendanceAvailable && attendance?.mode === 'records' && (
                  <span className="text-[10px] text-gray-400">(liczba obecności)</span>
                )}
              </div>
              {!attendanceAvailable || !attendance?.monthly
                ? <p className="text-sm text-gray-400 py-10 text-center">Brak danych / moduł nieaktywny.</p>
                : attendance.monthly.some((mo) => mo.v > 0)
                  ? <MonthlyBars data={attendance.monthly} format={(v) => `${formatNumber(v)}`} highlightMonth={highlightMonth} />
                  : <p className="text-sm text-gray-400 py-10 text-center">Brak zarejestrowanej frekwencji w tym roku.</p>}
            </div>

            {/* Lejek gość → sympatyk → członek */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-accent-primary" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Lejek zaangażowania</h3>
              </div>
              {totalMembers === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">Brak osób w bazie.</p>
              ) : (
                <div className="space-y-4">
                  {funnel.map((f) => (
                    <div key={f.value}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />{f.label}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white tabular-nums">{formatNumber(f.count)}</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, f.pct)}%`, background: f.color }} />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-1">
                    Łącznie {formatNumber(totalMembers)} osób w wybranym kampusie.
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
