import React, { useState, useEffect } from 'react';
import { Cake, Gift } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

const WINDOW_DAYS = 30;

function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function nextBirthday(bdStr, today) {
  const b = new Date(bdStr);
  if (isNaN(b.getTime())) return null;
  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
  return next;
}

export default function BirthdaysWidget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, birth_date')
          .not('birth_date', 'is', null);
        if (error) throw error;
        const today = startOfToday();
        const list = (data || [])
          .map((m) => {
            const next = nextBirthday(m.birth_date, today);
            if (!next) return null;
            const days = Math.round((next - today) / 86400000);
            return { ...m, next, days };
          })
          .filter((m) => m && m.days <= WINDOW_DAYS)
          .sort((a, b) => a.days - b.days)
          .slice(0, 8);
        if (active) setItems(list);
      } catch (e) {
        console.error('Birthdays widget error:', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-accent-primary-light border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
          <Cake size={24} className="text-pink-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{tr('Brak urodzin w najbliższym czasie')}</p>
      </div>
    );
  }

  const whenLabel = (days, next) => {
    if (days === 0) return tr('Dziś! 🎉');
    if (days === 1) return 'Jutro';
    return `za ${days} dni · ${next.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}`;
  };

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
      {items.map((m) => (
        <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
          <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${m.days === 0 ? 'bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {m.days === 0 ? <Gift size={16} /> : <Cake size={16} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{m.first_name} {m.last_name}</p>
            <p className="text-xs text-gray-400">{whenLabel(m.days, m.next)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
