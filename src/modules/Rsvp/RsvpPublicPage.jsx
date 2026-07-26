import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, HelpCircle, Calendar, MapPin, Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const STATUS_LABEL = { yes: 'Będę', no: 'Nie będę', maybe: 'Może', pending: 'Oczekuje' };

export default function RsvpPublicPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [guests, setGuests] = useState(0);

  const fetchInvite = useCallback(async (answer) => {
    const body = { token };
    if (answer) { body.answer = answer; body.guests = guests; }
    const { data: res, error: err } = await supabase.functions.invoke('rsvp-respond', { body });
    if (err || res?.error) throw new Error(res?.error || err?.message || 'Błąd');
    return res;
  }, [token, guests]);

  useEffect(() => {
    (async () => {
      try {
        // Jednym kliknięciem z maila/SMS: /rsvp/:token?a=yes|no
        const a = new URLSearchParams(window.location.search).get('a');
        const auto = ['yes', 'no', 'maybe'].includes(a) ? a : null;
        const res = await fetchInvite(auto);
        setData(res);
      } catch (err) {
        setError(err.message || 'Nie udało się wczytać zaproszenia.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (answer) => {
    setSaving(true); setError('');
    try {
      const res = await fetchInvite(answer);
      setData(res);
    } catch (err) {
      setError(err.message || 'Nie udało się zapisać odpowiedzi.');
    } finally {
      setSaving(false);
    }
  };

  const wrap = (children) => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full">{children}</div>
    </div>
  );

  if (loading) return wrap(<div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-accent-primary" size={32} /></div>);
  if (error && !data) return wrap(<p className="text-center text-red-500">{error}</p>);

  const c = data.campaign;
  const inv = data.invitation;
  const answered = inv.status && inv.status !== 'pending';

  return wrap(
    <>
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{c.title}</h1>
        {inv.name && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cześć, {inv.name}!</p>}
      </div>

      <div className="space-y-2 mb-5 text-sm text-gray-600 dark:text-gray-300">
        {c.event_date && <div className="flex items-center gap-2"><Calendar size={16} className="text-accent-primary" />{new Date(c.event_date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>}
        {c.event_time && <div className="flex items-center gap-2"><Clock size={16} className="text-accent-primary" />{c.event_time}</div>}
        {c.location && <div className="flex items-center gap-2"><MapPin size={16} className="text-accent-primary" />{c.location}</div>}
      </div>

      {c.description && <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">{c.description}</p>}

      {answered ? (
        <div className="text-center py-4">
          <CheckCircle2 size={44} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-gray-900 dark:text-white font-semibold">Twoja odpowiedź: {STATUS_LABEL[inv.status]}</p>
          {inv.status === 'yes' && inv.guests_count > 0 && <p className="text-sm text-gray-500 dark:text-gray-400">+ {inv.guests_count} os. towarzyszących</p>}
          <p className="text-xs text-gray-400 mt-2">Możesz zmienić odpowiedź poniżej.</p>
        </div>
      ) : (
        <p className="text-center text-gray-700 dark:text-gray-200 font-medium mb-4">Czy będziesz obecny/a?</p>
      )}

      {/* Osoby towarzyszące */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">Osoby towarzyszące:</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setGuests(g => Math.max(0, g - 1))} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">−</button>
          <span className="w-6 text-center font-semibold text-gray-900 dark:text-white">{guests}</span>
          <button onClick={() => setGuests(g => Math.min(20, g + 1))} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">+</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => respond('yes')} disabled={saving}
          className={`flex flex-col items-center gap-1 py-4 rounded-2xl font-semibold transition ${inv.status === 'yes' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100'}`}>
          <Check size={22} /> Będę
        </button>
        <button onClick={() => respond('maybe')} disabled={saving}
          className={`flex flex-col items-center gap-1 py-4 rounded-2xl font-semibold transition ${inv.status === 'maybe' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100'}`}>
          <HelpCircle size={22} /> Może
        </button>
        <button onClick={() => respond('no')} disabled={saving}
          className={`flex flex-col items-center gap-1 py-4 rounded-2xl font-semibold transition ${inv.status === 'no' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100'}`}>
          <X size={22} /> Nie będę
        </button>
      </div>

      {error && <p className="text-sm text-red-500 text-center mt-3">{error}</p>}
      {saving && <p className="text-xs text-gray-400 text-center mt-3">Zapisywanie...</p>}
    </>
  );
}
