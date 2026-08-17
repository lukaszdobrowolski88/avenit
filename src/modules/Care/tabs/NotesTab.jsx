import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, StickyNote, User } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import { formatDateTime } from '../lib/careApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';

export default function NotesTab({ member, campusIdForInsert, withCampusFilter }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      let q = supabase.from('member_notes').select('*').eq('member_id', member.id).order('created_at', { ascending: false });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Load notes error:', err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [member?.id, withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!body.trim()) { toast.error('Wpisz treść notatki.'); return; }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const { error } = await supabase.from('member_notes').insert({
        member_id: member.id,
        author_email: user?.email || null,
        body: body.trim(),
        campus_id: campusIdForInsert,
      });
      if (error) throw error;
      setBody('');
      load();
    } catch (err) {
      toast.error('Nie udało się zapisać notatki: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n) => {
    if (!confirm('Usunąć tę notatkę?')) return;
    try {
      const { error } = await supabase.from('member_notes').delete().eq('id', n.id);
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
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          placeholder="Nowa notatka duszpasterska..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
        />
        <div className="flex justify-end">
          <button onClick={add} disabled={saving} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60">
            <Plus size={16} /> {saving ? 'Zapisywanie...' : 'Dodaj notatkę'}
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <Spinner center />
      ) : notes.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <StickyNote size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak notatek dla tej osoby.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 group">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap flex-1">{n.body}</p>
                <button onClick={() => remove(n)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"><Trash2 size={15} /></button>
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 dark:text-gray-500">
                <span className="inline-flex items-center gap-1"><User size={13} /> {n.author_email || 'nieznany'}</span>
                <span>{formatDateTime(n.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
