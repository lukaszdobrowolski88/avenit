import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Award, Flag, Droplets, BadgeCheck, Heart, Star } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { MILESTONE_TYPES, milestoneTypeLabel, formatDate } from '../lib/careApi';

const MILESTONE_ICONS = {
  'nawrócenie': Flag,
  'chrzest': Droplets,
  'członkostwo': BadgeCheck,
  'ślub': Heart,
  'inne': Star,
};

const MILESTONE_COLORS = {
  'nawrócenie': '#f59e0b',
  'chrzest': '#06b6d4',
  'członkostwo': '#10b981',
  'ślub': '#ec4899',
  'inne': '#64748b',
};

const emptyForm = () => ({ milestone_type: 'nawrócenie', milestone_date: new Date().toISOString().slice(0, 10), note: '' });

export default function MilestonesTab({ member, campusIdForInsert, withCampusFilter }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      let q = supabase.from('member_milestones').select('*').eq('member_id', member.id)
        .order('milestone_date', { ascending: false });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Load milestones error:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [member?.id, withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('member_milestones').insert({
        member_id: member.id,
        milestone_type: form.milestone_type,
        milestone_date: form.milestone_date || null,
        note: form.note || null,
        campus_id: campusIdForInsert,
      });
      if (error) throw error;
      setForm(emptyForm());
      load();
    } catch (err) {
      alert('Nie udało się zapisać kamienia milowego: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm('Usunąć ten kamień milowy?')) return;
    try {
      const { error } = await supabase.from('member_milestones').delete().eq('id', item.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Dodawanie */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomSelect label="Typ" value={form.milestone_type} onChange={v => setForm(f => ({ ...f, milestone_type: v }))} options={MILESTONE_TYPES} />
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data</label>
            <input type="date" value={form.milestone_date} onChange={e => setForm(f => ({ ...f, milestone_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          </div>
        </div>
        <textarea
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          placeholder="Opis / okoliczności (opcjonalnie)..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none"
        />
        <div className="flex justify-end">
          <button onClick={add} disabled={saving} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60">
            <Plus size={16} /> {saving ? 'Zapisywanie...' : 'Dodaj kamień milowy'}
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="p-10 text-center text-gray-400">Ładowanie...</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <Award size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak kamieni milowych.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const Icon = MILESTONE_ICONS[item.milestone_type] || Star;
            const color = MILESTONE_COLORS[item.milestone_type] || '#64748b';
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>
                  <Icon size={19} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{milestoneTypeLabel(item.milestone_type)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(item.milestone_date)}</span>
                  </div>
                  {item.note && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.note}</p>}
                </div>
                <button onClick={() => remove(item)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
