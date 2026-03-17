import React, { useState, useEffect } from 'react';
import { supabase, getCachedUser } from '../../../../lib/supabase';
import { Plus, Trash2, Loader2 } from 'lucide-react';

export default function SessionManager({ onSessionChange }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    session_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '13:00'
  });

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checkin_sessions')
        .select('*')
        .order('session_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const user = await getCachedUser();
      const { data, error } = await supabase
        .from('checkin_sessions')
        .insert({
          ...formData,
          is_active: true,
          created_by: user?.email || 'system'
        })
        .select()
        .single();

      if (error) throw error;

      setSessions(prev => [data, ...prev]);
      setShowForm(false);
      setFormData({
        name: '',
        session_date: new Date().toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '13:00'
      });

      if (onSessionChange) onSessionChange(data);
    } catch (err) {
      console.error('Error creating session:', err);
      alert('Błąd podczas tworzenia sesji');
    }
  };

  const handleToggleActive = async (session) => {
    try {
      const { data, error } = await supabase
        .from('checkin_sessions')
        .update({ is_active: !session.is_active })
        .eq('id', session.id)
        .select()
        .single();

      if (error) throw error;

      setSessions(prev =>
        prev.map(s => (s.id === data.id ? data : s))
      );

      if (data.is_active && onSessionChange) {
        onSessionChange(data);
      }
    } catch (err) {
      console.error('Error toggling session:', err);
    }
  };

  const handleDelete = async (sessionId) => {
    if (!confirm('Czy na pewno chcesz usunąć tę sesję?')) return;

    try {
      const { error } = await supabase
        .from('checkin_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Błąd podczas usuwania sesji');
    }
  };

  const inputClasses = "w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition";

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Sesje Check-in</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
        >
          <Plus size={18} />
          Nowa sesja
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-2xl mb-5 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Nazwa sesji
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="np. Nabożeństwo niedzielne"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Data
              </label>
              <input
                type="date"
                value={formData.session_date}
                onChange={(e) => setFormData(prev => ({ ...prev, session_date: e.target.value }))}
                className={inputClasses}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Start
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                  className={inputClasses}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Koniec
                </label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                  className={inputClasses}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2.5 text-base font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Anuluj
            </button>
            <button
              onClick={handleCreate}
              disabled={!formData.name || !formData.session_date}
              className={`px-5 py-2.5 text-base font-medium rounded-xl transition
                ${formData.name && formData.session_date
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg cursor-pointer'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
            >
              Utwórz sesję
            </button>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-gray-500 dark:text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          Ładowanie...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
          Brak sesji. Utwórz pierwszą sesję check-in.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex justify-between items-center p-4 bg-white dark:bg-gray-800 border-2 rounded-2xl transition
                ${session.is_active
                  ? 'border-green-500 dark:border-green-400'
                  : 'border-gray-200 dark:border-gray-700'
                }`}
            >
              <div>
                <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                  {session.name}
                  {session.is_active && (
                    <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-xs font-semibold">
                      Aktywna
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {new Date(session.session_date).toLocaleDateString('pl-PL', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                  {session.start_time && ` • ${session.start_time} - ${session.end_time}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleActive(session)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition
                    ${session.is_active
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
                      : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
                    }`}
                >
                  {session.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                </button>
                <button
                  onClick={() => handleDelete(session.id)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
