import React, { useState, useEffect, useCallback } from 'react';
import EmptyState from '../../../../components/EmptyState';
import Spinner from '../../../../components/Spinner';
import Button from '../../../../components/Button';
import { supabase, getCachedUser } from '../../../../lib/supabase';
import { Plus, Trash2, CalendarClock, Eraser } from 'lucide-react';
import { tr, appLocale } from '../../../../i18n';
import { toast } from '../../../../lib/toast';
import { DateInput, TimeField } from '../../../../components/pickers';
import { confirmDialog } from '../../../../lib/dialog';
import { localDateISO, parseLocalDate, pluralForm } from '../utils/kiosk';

const emptyForm = () => ({
  name: '',
  session_date: localDateISO(),
  start_time: '09:00',
  end_time: '13:00',
});

const checkinsLabel = (n) => pluralForm(n,
  tr('{n} meldowanie', { n }),
  tr('{n} meldowania', { n }),
  tr('{n} meldowań', { n }));

export default function SessionManager({ onSessionChange, onSessionRemoved }) {
  const [sessions, setSessions] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checkin_sessions')
        .select('*')
        .order('session_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      const list = data || [];
      setSessions(list);

      // Liczba meldowań w sesjach — puste sesje (np. dawne automatyczne) da się posprzątać.
      if (list.length > 0) {
        const { data: rows, error: cErr } = await supabase
          .from('checkins')
          .select('session_id')
          .in('session_id', list.map((s) => s.id));
        if (!cErr) {
          const c = {};
          (rows || []).forEach((r) => { c[r.session_id] = (c[r.session_id] || 0) + 1; });
          setCounts(c);
        }
      } else {
        setCounts({});
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      toast.error(tr('Nie udało się wczytać sesji.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.session_date) return;
    setSaving(true);
    try {
      const user = await getCachedUser();
      const { data, error } = await supabase
        .from('checkin_sessions')
        .insert({
          ...formData,
          name: formData.name.trim(),
          is_active: true,
          created_by: user?.email || 'system',
        })
        .select()
        .single();
      if (error) throw error;

      setSessions((prev) => [data, ...prev]);
      setShowForm(false);
      setFormData(emptyForm());
      toast.success(tr('Sesja utworzona'));
      if (onSessionChange && data.session_date === localDateISO()) onSessionChange(data);
    } catch (err) {
      console.error('Error creating session:', err);
      toast.error(tr('Nie udało się utworzyć sesji. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (session) => {
    setBusyId(session.id);
    try {
      const { data, error } = await supabase
        .from('checkin_sessions')
        .update({ is_active: !session.is_active })
        .eq('id', session.id)
        .select()
        .single();
      if (error) throw error;
      setSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      if (data.is_active) {
        if (onSessionChange && data.session_date === localDateISO()) onSessionChange(data);
      } else {
        onSessionRemoved?.(data.id);
      }
    } catch (err) {
      console.error('Error toggling session:', err);
      toast.error(tr('Nie udało się zmienić statusu sesji.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (session) => {
    const n = counts[session.id] || 0;
    const ok = await confirmDialog({
      title: tr('Usunąć sesję „{name}”?', { name: session.name }),
      message: n > 0
        ? tr('Usuniemy też jej meldowania ({count}). Tej operacji nie można cofnąć.', { count: checkinsLabel(n) })
        : tr('Sesja nie ma meldowań. Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń sesję'),
      danger: true,
    });
    if (!ok) return;

    setBusyId(session.id);
    try {
      const { error } = await supabase.from('checkin_sessions').delete().eq('id', session.id);
      if (error) throw error;
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      onSessionRemoved?.(session.id);
      toast.success(tr('Sesja usunięta'));
    } catch (err) {
      console.error('Error deleting session:', err);
      toast.error(tr('Nie udało się usunąć sesji.'));
    } finally {
      setBusyId(null);
    }
  };

  // Sprzątanie pustych sesji z przeszłości (np. tworzonych dawniej automatycznie przy samym
  // otwarciu zakładki). Dzisiejszej nie ruszamy.
  const today = localDateISO();
  const emptyPast = sessions.filter((s) => !(counts[s.id] > 0) && s.session_date < today);

  const handleCleanup = async () => {
    if (emptyPast.length === 0) return;
    const ok = await confirmDialog({
      title: tr('Usunąć puste sesje ({n})?', { n: emptyPast.length }),
      message: tr('Usuniemy minione sesje bez żadnego meldowania. Statystyki obecności się nie zmienią.'),
      confirmLabel: tr('Usuń puste sesje'),
      danger: true,
    });
    if (!ok) return;
    setCleaning(true);
    try {
      const ids = emptyPast.map((s) => s.id);
      const { error } = await supabase.from('checkin_sessions').delete().in('id', ids);
      if (error) throw error;
      setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
      toast.success(tr('Usunięto puste sesje: {n}', { n: ids.length }));
    } catch (err) {
      console.error('Error cleaning sessions:', err);
      toast.error(tr('Nie udało się usunąć pustych sesji.'));
    } finally {
      setCleaning(false);
    }
  };

  const inputClasses = 'w-full px-4 py-3 text-base border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-accent-primary focus:outline-none transition';

  return (
    <div>
      <div className="flex justify-between items-center mb-5 gap-3 flex-wrap">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{tr('Sesje meldowania')}</h3>
        <div className="flex gap-2 flex-wrap">
          {emptyPast.length > 0 && (
            <Button variant="outline" icon={Eraser} loading={cleaning} onClick={handleCleanup}>
              {tr('Usuń puste sesje ({n})', { n: emptyPast.length })}
            </Button>
          )}
          <Button icon={Plus} onClick={() => setShowForm(!showForm)}>
            {tr('Nowa sesja')}
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-2xl mb-5 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="session-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {tr('Nazwa sesji')} *
              </label>
              <input
                id="session-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={tr('np. Nabożeństwo niedzielne')}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {tr('Data')}
              </label>
              <DateInput
                value={formData.session_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, session_date: e.target.value }))}
                className={inputClasses}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {tr('Początek')}
                </label>
                <TimeField
                  value={formData.start_time}
                  onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
                  className={inputClasses}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {tr('Koniec')}
                </label>
                <TimeField
                  value={formData.end_time}
                  onChange={(e) => setFormData((prev) => ({ ...prev, end_time: e.target.value }))}
                  className={inputClasses}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="secondary" onClick={() => setShowForm(false)}>{tr('Anuluj')}</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!formData.name.trim() || !formData.session_date}>
              {tr('Utwórz sesję')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner center label={tr('Ładowanie...')} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tr('Nie ma jeszcze żadnej sesji')}
          subtitle={tr('Sesja na dziś powstanie sama przy pierwszym meldowaniu dziecka.')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const n = counts[session.id] || 0;
            const d = parseLocalDate(session.session_date);
            return (
              <div
                key={session.id}
                className={`flex justify-between items-center gap-3 p-4 bg-white dark:bg-gray-800 border-2 rounded-2xl transition
                  ${session.is_active ? 'border-accent-primary/60' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-base font-semibold text-gray-900 dark:text-white">
                    {session.name}
                    {session.is_active && (
                      <span className="inline-flex items-center gap-1.5 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-gray-800 dark:text-gray-100 px-2 py-0.5 rounded text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                        {tr('Aktywna')}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {d && !Number.isNaN(d.getTime())
                      ? d.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : session.session_date}
                    {session.start_time && ` • ${String(session.start_time).slice(0, 5)}${session.end_time ? `–${String(session.end_time).slice(0, 5)}` : ''}`}
                    {` • ${checkinsLabel(n)}`}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busyId === session.id}
                    onClick={() => handleToggleActive(session)}
                  >
                    {session.is_active ? tr('Zakończ') : tr('Wznów')}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(session)}
                    disabled={busyId === session.id}
                    aria-label={tr('Usuń sesję „{name}”', { name: session.name })}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
