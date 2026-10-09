import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, HeartHandshake, Phone, Mail, Heart, Users, Home, CalendarPlus, Save } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import CustomDatePicker from '../../../components/CustomDatePicker';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { CARE_TYPES, careTypeLabel, formatDate, memberName } from '../lib/careApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { DateInput } from '../../../components/pickers';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

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

const pad2 = (n) => String(n).padStart(2, '0');
const ymdIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

// Link do profilu osoby (otwiera kartotekę z zakładkami Opieki) — trafia do opisu zadania.
export const memberProfileUrl = (memberId) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/members?member=${encodeURIComponent(String(memberId))}`;
};

// Zadanie „na potem” po kontakcie: osobiste (user_tasks) bieżącego użytkownika, prywatne,
// z linkiem do profilu osoby. → payload do insertu.
export function followUpTask({ member, entry, title, due, userEmail }) {
  const lines = [
    entry ? `${tr(careTypeLabel(entry.care_type))} · ${formatDate(entry.care_date)}${entry.note ? `\n${entry.note}` : ''}` : '',
    tr('Profil: {url}', { url: memberProfileUrl(member.id) }),
  ].filter(Boolean);
  return {
    title: String(title || '').trim(),
    description: lines.join('\n\n'),
    due_date: due || null,
    status: 'todo',
    is_private: true,
    user_email: userEmail,
  };
}

function FollowUpModal({ member, entry, onClose }) {
  const [title, setTitle] = useState(() => tr('Odezwij się: {name}', { name: memberName(member) }));
  const [due, setDue] = useState(() => ymdIn(7));
  const save = async () => {
    if (!title.trim()) return;
    try {
      const user = await getCachedUser();
      if (!user?.email) throw new Error(tr('Brak sesji — zaloguj się ponownie.'));
      const { error } = await supabase.from('user_tasks').insert(followUpTask({ member, entry, title, due, userEmail: user.email }));
      if (error) throw error;
      toast.success(tr('Dodano zadanie do Twoich zadań na Pulpicie'));
      onClose();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się utworzyć zadania.') });
    }
  };
  return (
    <Modal isOpen onClose={onClose} icon={CalendarPlus} title={tr('Utwórz zadanie')} size="md" closeOnBackdrop={false}
      subtitle={tr('Zadanie osobiste (widzisz je tylko Ty) z linkiem do profilu osoby.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Save} onClick={save} disabled={!title.trim()}>{tr('Utwórz zadanie')}</Button>
      </>}>
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="care-followup-title" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tytuł')}</label>
          <input id="care-followup-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-300/60" />
        </div>
        <div>
          <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Termin')}</span>
          <CustomDatePicker value={due} onChange={(v) => setDue(v || '')} aria-label={tr('Termin')} />
        </div>
      </div>
    </Modal>
  );
}

export default function CareLogTab({ member, campusIdForInsert, withCampusFilter }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [followUp, setFollowUp] = useState(null); // wpis, z którego tworzymy zadanie

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
    if (!form.care_date) { toast.error(tr('Podaj datę kontaktu.')); return; }
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
      toast.error(tr('Nie udało się zapisać kontaktu: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!await confirmDialog(tr('Usunąć ten wpis?'))) return;
    try {
      const { error } = await supabase.from('member_care_log').delete().eq('id', item.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(tr('Nie udało się usunąć: {msg}', { msg: err.message || err }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Dodawanie */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomSelect label={tr('Typ kontaktu')} value={form.care_type} onChange={v => setForm(f => ({ ...f, care_type: v }))} options={CARE_TYPES.map((o) => ({ ...o, label: tr(o.label) }))} />
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Data')}</label>
            <DateInput value={form.care_date} onChange={e => setForm(f => ({ ...f, care_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          </div>
        </div>
        <textarea
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          placeholder={tr('Opis kontaktu (opcjonalnie)...')}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none"
        />
        <div className="flex justify-end">
          <button data-tour="care-add" onClick={add} disabled={saving} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60">
            <Plus size={16} /> {saving ? tr('Zapisywanie...') : tr('Dodaj kontakt')}
          </button>
        </div>
      </div>

      {/* Oś czasu */}
      {loading ? (
        <Spinner center />
      ) : log.length === 0 ? (
        <EmptyState icon={HeartHandshake} title={tr('Brak zarejestrowanych kontaktów.')} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700" />
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
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{tr(careTypeLabel(item.care_type))}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(item.care_date)}</span>
                  </div>
                  {item.note && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.note}</p>}
                  {item.created_by && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{tr('przez {name}', { name: item.created_by })}</p>}
                </div>
                <button type="button" onClick={() => setFollowUp(item)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                  title={tr('Utwórz zadanie')} aria-label={tr('Utwórz zadanie')}><CalendarPlus size={15} /></button>
                <button type="button" onClick={() => remove(item)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                  title={tr('Usuń')} aria-label={tr('Usuń')}><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
      {followUp && <FollowUpModal member={member} entry={followUp} onClose={() => setFollowUp(null)} />}
    </div>
  );
}
