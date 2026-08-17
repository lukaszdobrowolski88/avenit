import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, HeartHandshake, Phone, Mail, Heart, Users, Home } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { CARE_TYPES, careTypeLabel, formatDate } from '../lib/careApi';
import { toast } from '../../../lib/toast';

const CARE_ICONS = {
  wizyta: Home,
  telefon: Phone,
  email: Mail,
  modlitwa: Heart,
  spotkanie: Users,
};

const CARE_COLORS = {
  wizyta: '#3b82f6',
  telefon: '#10b981',
  email: '#8b5cf6',
  modlitwa: '#ec4899',
  spotkanie: '#f59e0b',
};

const emptyForm = () => ({ care_type: 'wizyta', care_date: new Date().toISOString().slice(0, 10), note: '' });

export default function CareLogTab({ member, campusIdForInsert, withCampusFilter }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      let q = supabase.from('member_care_log').select('*').eq('member_id', member.id)
        .order('care_date', { ascending: false }).order('created_at', { ascending: false });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setLog(data || []);
    } catch (err) {
      console.error('Load care log error:', err);
      setLog([]);
    } finally {
      setLoading(false);
    }
  }, [member?.id, withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.care_date) { toast.error('Podaj datę kontaktu.'); return; }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const { error } = await supabase.from('member_care_log').insert({
        member_id: member.id,
        care_type: form.care_type,
        care_date: form.care_date,
        note: form.note || null,
        created_by: user?.email || null,
        campus_id: campusIdForInsert,
      });
      if (error) throw error;
      setForm(emptyForm());
      load();
    } catch (err) {
      toast.error('Nie udało się zapisać kontaktu: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm('Usunąć ten wpis?')) return;
    try {
      const { error } = await supabase.from('member_care_log').delete().eq('id', item.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Dodawanie */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomSelect label="Typ kontaktu" value={form.care_type} onChange={v => setForm(f => ({ ...f, care_type: v }))} options={CARE_TYPES} />
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data</label>
            <input type="date" value={form.care_date} onChange={e => setForm(f => ({ ...f, care_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          </div>
        </div>
        <textarea
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          placeholder="Opis kontaktu (opcjonalnie)..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none"
        />
        <div className="flex justify-end">
          <button data-tour="care-add" onClick={add} disabled={saving} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60">
            <Plus size={16} /> {saving ? 'Zapisywanie...' : 'Dodaj kontakt'}
          </button>
        </div>
      </div>

      {/* Oś czasu */}
      {loading ? (
        <div className="p-10 text-center text-gray-400">Ładowanie...</div>
      ) : log.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <HeartHandshake size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak zarejestrowanych kontaktów.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {log.map(item => {
            const Icon = CARE_ICONS[item.care_type] || HeartHandshake;
            const color = CARE_COLORS[item.care_type] || '#64748b';
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>
                  <Icon size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{careTypeLabel(item.care_type)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(item.care_date)}</span>
                  </div>
                  {item.note && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.note}</p>}
                  {item.created_by && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">przez {item.created_by}</p>}
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
