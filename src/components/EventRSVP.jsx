import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, UserMinus, Loader2, Check, X, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from '../hooks/useUserRole';

// Role mogące zarządzać listą zapisanych (organizatorzy).
const MANAGER_ROLES = ['superadmin', 'rada_starszych', 'koordynator', 'lider'];

// Panel zapisów (RSVP) na wydarzenie. Samodzielny — sam pobiera bieżącego
// użytkownika i listę zapisanych. Wpinany w modal wydarzenia w kalendarzu.
export default function EventRSVP({ eventId, maxParticipants }) {
  const { userRole } = useUserRole();
  const canManage = MANAGER_ROLES.includes(userRole);

  const [me, setMe] = useState(null);
  const [myName, setMyName] = useState('');
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState(0);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('event_registrations')
      .select('id, user_email, full_name, guests_count')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    setRegs(data || []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email || null;
        if (!active) return;
        setMe(email);
        if (email) {
          const { data: prof } = await supabase.from('app_users').select('full_name').eq('email', email).maybeSingle();
          if (active) setMyName(prof?.full_name || email.split('@')[0]);
        }
      } catch (e) { /* ignore */ }
      await load();
    })();
    return () => { active = false; };
  }, [eventId, load]);

  const myReg = me ? regs.find((r) => r.user_email === me) : null;
  const totalGoing = regs.reduce((s, r) => s + 1 + (r.guests_count || 0), 0);
  const cap = maxParticipants ? parseInt(maxParticipants) : null;
  const isFull = cap ? totalGoing >= cap : false;

  const signUp = async () => {
    if (!me || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('event_registrations')
        .insert([{ event_id: eventId, user_email: me, full_name: myName, guests_count: guests }]);
      if (error) throw error;
      await load();
    } catch (e) { console.error('RSVP signUp error:', e); } finally { setBusy(false); }
  };

  const removeReg = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('event_registrations').delete().eq('id', id);
      if (error) throw error;
      setGuests(0);
      await load();
    } catch (e) { console.error('RSVP remove error:', e); } finally { setBusy(false); }
  };

  const addManual = async () => {
    const name = addName.trim();
    if (!name || busy) return;
    const email = addEmail.trim() || `reczne:${name.toLowerCase().replace(/\s+/g, '-')}`;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('event_registrations')
        .insert([{ event_id: eventId, user_email: email, full_name: name, guests_count: 0 }]);
      if (error) throw error;
      setAddName(''); setAddEmail('');
      await load();
    } catch (e) { console.error('RSVP addManual error:', e); } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const rows = [['Imię i nazwisko', 'E-mail', 'Osoby towarzyszące']];
    regs.forEach((r) => rows.push([r.full_name || '', r.user_email || '', String(r.guests_count || 0)]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `zapisy-wydarzenie-${eventId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
          <Users size={16} className="text-accent-primary" />
          Zapisani: {totalGoing}{cap ? ` / ${cap}` : ''}
        </div>
        <div className="flex items-center gap-2">
          {isFull && !myReg && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300">
              Brak miejsc
            </span>
          )}
          {canManage && regs.length > 0 && (
            <button onClick={exportCsv} title="Eksport CSV" className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-accent-primary transition">
              <Download size={14} /> CSV
            </button>
          )}
        </div>
      </div>

      {cap ? (
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 mb-3 overflow-hidden">
          <div
            className={`h-full rounded-full ${isFull ? 'bg-red-500' : 'bg-accent-primary'}`}
            style={{ width: `${Math.min(100, Math.round((totalGoing / cap) * 100))}%` }}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <Loader2 size={16} className="animate-spin" /> Ładowanie…
        </div>
      ) : !me ? (
        <p className="text-sm text-gray-400 py-1">Zaloguj się, aby się zapisać.</p>
      ) : myReg ? (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
            <Check size={16} /> Jesteś zapisany/a{myReg.guests_count ? ` (+${myReg.guests_count})` : ''}
          </span>
          <button
            onClick={() => removeReg(myReg.id)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />} Wypisz się
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            Osoby towarzyszące:
            <select
              value={guests}
              onChange={(e) => setGuests(parseInt(e.target.value))}
              className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            onClick={signUp}
            disabled={busy || isFull}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Zapisz się
          </button>
        </div>
      )}

      {regs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-1.5">
          {regs.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              title={r.user_email}
            >
              {r.full_name || r.user_email?.split('@')[0]}
              {r.guests_count ? <span className="text-accent-primary font-bold">+{r.guests_count}</span> : null}
              {canManage && (
                <button onClick={() => removeReg(r.id)} disabled={busy} className="ml-0.5 text-gray-400 hover:text-red-500 transition" title="Usuń z listy">
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canManage && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Dopisz ręcznie</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Imię i nazwisko"
              className="flex-1 min-w-[130px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            />
            <input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="E-mail (opcjonalnie)"
              className="flex-1 min-w-[130px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            />
            <button
              onClick={addManual}
              disabled={busy || !addName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-800 dark:bg-gray-700 text-white hover:opacity-90 transition disabled:opacity-40"
            >
              <UserPlus size={15} /> Dopisz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
