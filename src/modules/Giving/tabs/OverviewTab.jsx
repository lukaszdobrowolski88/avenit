import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, Calendar, Users, Receipt, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatMoney, formatDate, donorLabel, methodLabel } from '../lib/givingApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';

export default function OverviewTab({ funds, membersById, withCampusFilter, onNavigate }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const year = new Date().getFullYear();
  const month = new Date().getMonth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('donations').select('*')
        .gte('donation_date', `${year}-01-01`).lte('donation_date', `${year}-12-31`)
        .eq('status', 'completed')
        .order('donation_date', { ascending: false });
      q = withCampusFilter(q);
      const { data } = await q;
      setDonations(data || []);
    } catch (err) {
      console.error('Overview load error:', err);
    } finally { setLoading(false); }
  }, [withCampusFilter, year]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const totalYear = donations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const totalMonth = donations.filter(d => new Date(d.donation_date).getMonth() === month).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const donors = new Set(donations.map(d => d.member_id || d.donor_name || d.id)).size;
    return { totalYear, totalMonth, donors, count: donations.length };
  }, [donations, month]);

  const byFund = useMemo(() => {
    const map = {};
    donations.forEach(d => { const k = d.fund_id || '__none'; map[k] = (map[k] || 0) + (Number(d.amount) || 0); });
    const fundsById = {}; (funds || []).forEach(f => { fundsById[f.id] = f; });
    const total = stats.totalYear || 1;
    return Object.entries(map)
      .map(([k, v]) => ({ id: k, name: k === '__none' ? 'Bez funduszu' : (fundsById[k]?.name || '—'), color: k === '__none' ? '#94a3b8' : (fundsById[k]?.color || '#94a3b8'), amount: v, pct: Math.round((v / total) * 100) }))
      .sort((a, b) => b.amount - a.amount);
  }, [donations, funds, stats.totalYear]);

  // Miesięczny trend (12 miesięcy)
  const monthly = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    donations.forEach(d => { const m = new Date(d.donation_date).getMonth(); arr[m] += (Number(d.amount) || 0); });
    const max = Math.max(1, ...arr);
    return arr.map((v, i) => ({ m: i, v, h: Math.round((v / max) * 100) }));
  }, [donations]);

  const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
  const recent = donations.slice(0, 6);

  const cards = [
    { label: `Suma ${year}`, value: formatMoney(stats.totalYear), icon: TrendingUp, tint: 'from-emerald-500 to-teal-500' },
    { label: 'Ten miesiąc', value: formatMoney(stats.totalMonth), icon: Calendar, tint: 'from-blue-500 to-indigo-500' },
    { label: 'Darczyńcy', value: stats.donors, icon: Users, tint: 'from-violet-500 to-purple-500' },
    { label: 'Darowizn', value: stats.count, icon: Receipt, tint: 'from-amber-500 to-orange-500' },
  ];

  if (loading) return <Spinner center />;

  const giveUrl = `${window.location.origin}/give`;
  const copyGiveLink = () => {
    try { navigator.clipboard.writeText(giveUrl); toast.success('Skopiowano link do dawania online.'); }
    catch { window.prompt('Link do dawania online:', giveUrl); }
  };

  return (
    <div className="space-y-5">
      {/* Dawanie online — link publiczny */}
      <div className="bg-gradient-to-r from-accent-primary to-accent-secondary rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-white">
        <div>
          <div className="font-semibold">Dawanie online (Przelewy24 / BLIK)</div>
          <div className="text-sm text-white/80">Udostępnij link, aby przyjmować darowizny online: <span className="font-mono">{giveUrl}</span></div>
        </div>
        <div className="flex gap-2">
          <button onClick={copyGiveLink} className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium">Kopiuj link</button>
          <a href={giveUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-white text-accent-primary text-sm font-semibold">Otwórz</a>
        </div>
      </div>

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
        {/* Trend miesięczny */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Dawanie w {year}</h3>
          <div className="flex items-end justify-between gap-1.5 h-40">
            {monthly.map(mo => (
              <div key={mo.m} className="flex-1 flex flex-col items-center gap-1.5 group">
                <div className="w-full flex items-end justify-center h-32">
                  <div className="w-full max-w-[24px] rounded-t-md bg-gradient-to-t from-accent-primary to-accent-secondary transition-all group-hover:opacity-80" style={{ height: `${Math.max(2, mo.h)}%` }} title={formatMoney(mo.v)} />
                </div>
                <span className={`text-[10px] ${mo.m === month ? 'text-accent-primary font-bold' : 'text-gray-400'}`}>{MONTHS[mo.m]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Podział na fundusze */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Podział na fundusze</h3>
          {byFund.length === 0 ? <p className="text-sm text-gray-400">Brak danych.</p> : (
            <div className="space-y-3">
              {byFund.slice(0, 6).map(f => (
                <div key={f.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />{f.name}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white tabular-nums">{formatMoney(f.amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: f.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ostatnie darowizny */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Ostatnie darowizny</h3>
          <button onClick={() => onNavigate?.('donations')} className="text-sm text-accent-primary dark:text-accent-primary-light flex items-center gap-1 hover:underline">Wszystkie <ArrowRight size={14} /></button>
        </div>
        {recent.length === 0 ? <p className="text-sm text-gray-400">Brak darowizn w tym roku.</p> : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {recent.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{donorLabel(d, membersById)}</div>
                  <div className="text-xs text-gray-400">{formatDate(d.donation_date)} · {methodLabel(d.method)}</div>
                </div>
                <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{formatMoney(d.amount, d.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
