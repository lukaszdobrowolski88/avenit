import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Tag as TagIcon } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { TAG_COLORS } from '../lib/careApi';

export default function TagsTab({ member, campusIdForInsert, withCampusFilter }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      let q = supabase.from('member_tags').select('*').eq('member_id', member.id).order('created_at', { ascending: true });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setTags(data || []);
    } catch (err) {
      console.error('Load tags error:', err);
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [member?.id, withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const t = tag.trim();
    if (!t) { alert('Wpisz nazwę tagu.'); return; }
    if (tags.some(x => (x.tag || '').toLowerCase() === t.toLowerCase())) { alert('Ten tag już istnieje.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('member_tags').insert({
        member_id: member.id,
        tag: t,
        color,
        campus_id: campusIdForInsert,
      });
      if (error) throw error;
      setTag('');
      load();
    } catch (err) {
      alert('Nie udało się dodać tagu: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    try {
      const { error } = await supabase.from('member_tags').delete().eq('id', item.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  };

  return (
    <div className="space-y-4">
      {/* Dodawanie */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={tag}
            onChange={e => setTag(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nazwa tagu (np. Nowy, Wolontariusz, Do kontaktu)..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
          <button onClick={add} disabled={saving} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60 shrink-0">
            <Plus size={16} /> Dodaj
          </button>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">Kolor</label>
          <div className="flex gap-2 flex-wrap">
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>

      {/* Lista tagów */}
      {loading ? (
        <div className="p-10 text-center text-gray-400">Ładowanie...</div>
      ) : tags.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <TagIcon size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak tagów. Dodaj pierwszy.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map(item => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-medium"
              style={{ background: `${item.color || '#10b981'}1a`, color: item.color || '#10b981' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: item.color || '#10b981' }} />
              {item.tag}
              <button onClick={() => remove(item)} className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition"><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
