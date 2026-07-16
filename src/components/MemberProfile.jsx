import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Edit2, Mail, Phone, MapPin, Home, Users, Calendar, FileText,
  CheckCircle, CalendarClock, UserCircle2, Cake, Tag, StickyNote, CalendarCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tr } from '../i18n';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pl-PL') : null);

function ageFrom(dateStr) {
  if (!dateStr) return null;
  const b = new Date(dateStr);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function Row({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={16} className="text-accent-primary-light mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
        <div className="text-sm text-gray-700 dark:text-gray-200 break-words">{children}</div>
      </div>
    </div>
  );
}

// Read-only profil członka. Samodzielnie dociąga nadchodzące zapisy na wydarzenia.
export default function MemberProfile({ member, members = [], homeGroups = [], households = [], getMinistryLabels, onClose, onEdit }) {
  const [events, setEvents] = useState([]);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!member?.id) { setAttendance([]); return; }
      try {
        const { data } = await supabase
          .from('attendance')
          .select('date, kind')
          .eq('member_id', member.id)
          .eq('present', true)
          .order('date', { ascending: false })
          .limit(60);
        if (active) setAttendance(data || []);
      } catch (e) { console.error('MemberProfile attendance error:', e); }
    })();
    return () => { active = false; };
  }, [member?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!member?.email) { setEvents([]); return; }
      try {
        const { data: regs } = await supabase
          .from('event_registrations')
          .select('event_id')
          .eq('user_email', member.email);
        const ids = (regs || []).map((r) => r.event_id);
        if (!ids.length) { if (active) setEvents([]); return; }
        const today = new Date().toISOString().split('T')[0];
        const { data: evs } = await supabase
          .from('events')
          .select('id, title, date, time')
          .in('id', ids)
          .gte('date', today)
          .order('date', { ascending: true });
        if (active) setEvents(evs || []);
      } catch (e) { console.error('MemberProfile events error:', e); }
    })();
    return () => { active = false; };
  }, [member?.email]);

  if (!member || !document.body) return null;

  const homeGroupName = member.home_group_id ? homeGroups.find((g) => g.id === member.home_group_id)?.name : null;
  const household = member.household_id ? households.find((h) => h.id === member.household_id) : null;
  const householdMembers = member.household_id
    ? members.filter((m) => m.household_id === member.household_id && m.id !== member.id)
    : [];
  const ministryLabels = getMinistryLabels ? getMinistryLabels(member.ministries) : (member.ministries || []);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onMouseDown={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[88vh] overflow-y-auto custom-scrollbar border border-gray-200 dark:border-gray-700"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="relative p-6 pb-5 bg-gradient-to-br from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/20">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-full transition">
            <X size={20} className="text-gray-500" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center text-accent-primary dark:text-accent-primary-light text-xl font-bold shadow border border-white dark:border-gray-700 shrink-0">
              {(member.first_name?.[0] || '') + (member.last_name?.[0] || '') || <UserCircle2 size={28} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white truncate">{member.first_name} {member.last_name}</h2>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200">
                  <CheckCircle size={12} /> {member.status || 'Gość'}
                </span>
                {ministryLabels.map((label, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Treść */}
        <div className="p-6 pt-4 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="pb-2">
            <Row icon={Mail} label="E-mail">{member.email && <a href={`mailto:${member.email}`} className="text-accent-primary dark:text-accent-primary-light hover:underline">{member.email}</a>}</Row>
            <Row icon={Phone} label="Telefon">{member.phone && <a href={`tel:${member.phone}`} className="hover:underline">{member.phone}</a>}</Row>
            <Row icon={MapPin} label="Adres">{member.address}</Row>
          </div>

          <div className="py-2">
            <Row icon={Home} label="Grupa domowa">{homeGroupName}</Row>
            <Row icon={Users} label="Rodzina">
              {household && (
                <div>
                  <span className="font-medium">{household.family_name}</span>
                  {householdMembers.length > 0 && (
                    <span className="text-gray-400"> · {householdMembers.map((m) => m.first_name).join(', ')}</span>
                  )}
                </div>
              )}
            </Row>
            <Row icon={Cake} label="Data urodzenia">
              {member.birth_date && (
                <span>{fmtDate(member.birth_date)}{ageFrom(member.birth_date) != null ? ` · ${ageFrom(member.birth_date)} lat` : ''}</span>
              )}
            </Row>
            <Row icon={Calendar} label="W kościele od">{fmtDate(member.join_date)}</Row>
            <Row icon={Calendar} label="Członek od">{member.status === 'Członek' ? fmtDate(member.membership_date) : null}</Row>
            <Row icon={FileText} label="Deklaracja członkowska">
              {member.membership_declaration_url && (
                <a href={member.membership_declaration_url} target="_blank" rel="noopener noreferrer" className="text-accent-primary dark:text-accent-primary-light hover:underline">Otwórz dokument</a>
              )}
            </Row>
          </div>

          {member.tags && member.tags.length > 0 && (
            <div className="py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-2">
                <Tag size={14} /> Tagi
              </div>
              <div className="flex flex-wrap gap-1.5">
                {member.tags.map((t) => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light">{t}</span>
                ))}
              </div>
            </div>
          )}

          {member.notes && (
            <div className="py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-2">
                <StickyNote size={14} /> Notatki
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{member.notes}</p>
            </div>
          )}

          {attendance.length > 0 && (() => {
            const now = Date.now();
            const last90 = attendance.filter((a) => (now - new Date(a.date).getTime()) <= 90 * 86400000).length;
            return (
              <div className="py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-2">
                  <CalendarCheck size={14} /> Frekwencja
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-200">
                  Ostatnie 90 dni: <b>{last90}</b> {last90 === 1 ? 'obecność' : 'obecności'} · łącznie {attendance.length}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {attendance.slice(0, 8).map((a, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300" title={a.kind}>
                      {fmtDate(a.date)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {events.length > 0 && (
            <div className="py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-2">
                <CalendarClock size={14} /> Nadchodzące zapisy
              </div>
              <div className="space-y-1.5">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-700 dark:text-gray-200 truncate">{ev.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {fmtDate(ev.date)}{ev.time ? `, ${String(ev.time).slice(0, 5)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition">{tr('Zamknij')}</button>
          {onEdit && (
            <button onClick={() => onEdit(member)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition">
              <Edit2 size={15} /> Edytuj
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
