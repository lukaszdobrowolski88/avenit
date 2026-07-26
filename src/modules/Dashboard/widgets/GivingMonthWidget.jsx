import React, { useState, useEffect } from 'react';
import { Gift, TrendingUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

function money(n) {
  try { return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(Number(n) || 0); }
  catch { return `${Math.round(Number(n) || 0)} zł`; }
}

export default function GivingMonthWidget() {
  const [data, setData] = useState({ month: 0, year: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const { data: rows, error } = await supabase
          .from('donations')
          .select('amount, donation_date, status')
          .gte('donation_date', `${year}-01-01`)
          .eq('status', 'completed');
        if (error) throw error;
        const m = now.getMonth();
        let month = 0, yr = 0, count = 0;
        (rows || []).forEach((d) => {
          const amt = Number(d.amount) || 0;
          yr += amt; count++;
          if (new Date(d.donation_date).getMonth() === m) month += amt;
        });
        if (active) setData({ month, year: yr, count });
      } catch (e) {
        if (active) setData({ month: 0, year: 0, count: 0, unavailable: true });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-accent-primary-light border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (data.unavailable) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><Gift size={24} className="text-emerald-500" /></div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{tr('Moduł Dawania nieaktywny')}</p>
      </div>
    );
  }
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center"><Gift size={18} className="text-white" /></span>
        <span className="text-xs text-gray-400">{tr('Dawanie w tym miesiącu')}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">{money(data.month)}</div>
      <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-500 dark:text-gray-400">
        <TrendingUp size={14} className="text-emerald-500" />
        {tr('W tym roku')}: <b className="text-gray-700 dark:text-gray-200">{money(data.year)}</b>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        {data.count} {tr('darowizn')}
      </div>
    </div>
  );
}
