import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Link as LinkIcon, ExternalLink, Trash2, Calendar, Clock, MapPin,
  Ticket, FileText, Users, Send, Copy, Check, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import SimpleRichEditor from '../components/SimpleRichEditor';
import EventRSVP from '../components/EventRSVP';
import { useModuleCalendar, useModuleLabel, useModuleColor } from '../hooks/useModuleLabel';
import { useCan } from '../components/Can';

const DEFAULT_TYPES = [
  { value: 'spotkanie', label: 'Spotkanie' },
  { value: 'wydarzenie', label: 'Wydarzenie' },
  { value: 'szkolenie', label: 'Szkolenie' },
  { value: 'inne', label: 'Inne' },
];
const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const Card = ({ icon: Icon, title, children, actions }) => (
  <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
    <div className="flex items-center justify-between mb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
        {Icon && <Icon size={16} className="text-accent-primary" />} {title}
      </h2>
      {actions}
    </div>
    {children}
  </section>
);

export default function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState([]);
  const [fields, setFields] = useState([]);
  const [invites, setInvites] = useState([]);
  const [copied, setCopied] = useState(false);

  const canManage = useCan('module:calendar');
  const moduleTitle = useModuleLabel(ev?.module_key, ev?.module_key || 'Wydarzenie');
  const moduleColor = useModuleColor(ev?.module_key);
  const calCfg = useModuleCalendar(ev?.module_key);
  const types = calCfg?.types?.length ? calCfg.types : DEFAULT_TYPES;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    setEv(data || null);
    setLoading(false);
    if (data?.module_key) {
      supabase.from('event_custom_fields').select('*').eq('module_key', data.module_key)
        .order('sort_order', { ascending: true }).then(({ data: f }) => setFields(f || [])).catch(() => {});
    }
    try {
      const { data: camps } = await supabase.from('rsvp_campaigns').select('id').eq('event_id', id);
      const ids = (camps || []).map((c) => c.id);
      if (ids.length) {
        const { data: inv } = await supabase.from('rsvp_invitations')
          .select('id, name, email, status, sent_channels, guests_count').in('campaign_id', ids);
        setInvites(inv || []);
      } else setInvites([]);
    } catch { setInvites([]); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from('forms').select('id, title').eq('is_active', true).order('title', { ascending: true })
      .then(({ data }) => setForms(data || [])).catch(() => {});
  }, []);

  const save = (patch) => {
    setEv((e) => ({ ...e, ...patch }));
    supabase.from('events').update(patch).eq('id', id).then(({ error }) => { if (error) toast.error(error.message); });
  };
  const saveCustom = (key, val) => save({ custom: { ...(ev?.custom || {}), [key]: val } });

  const del = async () => {
    if (!confirm('Usunąć to wydarzenie? Tej operacji nie można cofnąć.')) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Wydarzenie usunięte');
    navigate(-1);
  };

  if (loading) return <Spinner center size={28} />;
  if (!ev) return <div className="max-w-3xl mx-auto py-10"><EmptyState icon={Calendar} title="Nie znaleziono wydarzenia" subtitle="Mogło zostać usunięte." /></div>;

  const formLink = ev.form_id ? `${window.location.origin}/form/${ev.form_id}` : null;
  const invCounts = {
    yes: invites.filter((i) => i.status === 'yes').length,
    maybe: invites.filter((i) => i.status === 'maybe').length,
    no: invites.filter((i) => i.status === 'no').length,
    pending: invites.filter((i) => i.status === 'pending').length,
  };
  const STATUS_META = {
    yes: { label: 'Potwierdził', cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
    maybe: { label: 'Może', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
    no: { label: 'Odmówił', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
    pending: { label: 'Oczekuje', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  };
  const roField = !canManage;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      {/* Nagłówek */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="mt-1 p-1.5 -ml-1.5 shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ArrowLeft size={20} /></button>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary" style={moduleColor ? { background: moduleColor } : undefined}>
          <Calendar className="text-white w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <input value={ev.title || ''} readOnly={roField}
            onChange={(e) => setEv({ ...ev, title: e.target.value })}
            onBlur={(e) => save({ title: e.target.value })}
            placeholder="Nazwa wydarzenia"
            className="w-full text-2xl font-bold bg-transparent text-gray-900 dark:text-white outline-none rounded-lg px-1 -mx-1 focus:ring-2 focus:ring-accent-primary/30" />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1"><Calendar size={14} /> {fmtDate(ev.date) || '—'}</span>
            <span className="inline-flex items-center gap-1"><Clock size={14} /> {ev.time || '—'}{ev.end_time ? `–${ev.end_time}` : ''}</span>
            {ev.location && <span className="inline-flex items-center gap-1"><MapPin size={14} /> {ev.location}</span>}
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs">{moduleTitle}</span>
          </div>
        </div>
        {canManage && (
          <button onClick={del} className="mt-1 p-2 shrink-0 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Usuń wydarzenie"><Trash2 size={18} /></button>
        )}
      </div>

      {/* Podstawowe: data / godziny / lokalizacja / typ */}
      <Card icon={Calendar} title="Termin i miejsce">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Data</label>
            <CustomDatePicker value={String(ev.date || '').slice(0, 10)} onChange={(v) => save({ date: v })} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Początek</label>
            <input type="time" value={ev.time || ''} onChange={(e) => save({ time: e.target.value })} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Koniec</label>
            <input type="time" value={ev.end_time || ''} onChange={(e) => save({ end_time: e.target.value })} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Typ</label>
            <CustomSelect value={ev.event_type || ''} onChange={(v) => save({ event_type: v })} options={types} />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Lokalizacja</label>
          <input value={ev.location || ''} onChange={(e) => setEv({ ...ev, location: e.target.value })} onBlur={(e) => save({ location: e.target.value })} placeholder="Sala główna, Kościół…" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
        </div>
      </Card>

      {/* Szczegóły (rich text) */}
      <Card icon={FileText} title="Szczegóły wydarzenia">
        <SimpleRichEditor content={ev.details_html || ev.description || ''} onChange={(html) => setEv({ ...ev, details_html: html })} placeholder="Opis, agenda, informacje dla uczestników…" />
        <div className="mt-2 flex justify-end">
          <button onClick={() => save({ details_html: ev.details_html || '' })} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium">Zapisz szczegóły</button>
        </div>
      </Card>

      {/* Link */}
      <Card icon={LinkIcon} title="Link">
        <div className="flex items-center gap-2">
          <input value={ev.link || ''} onChange={(e) => setEv({ ...ev, link: e.target.value })} onBlur={(e) => save({ link: e.target.value })} placeholder="https://…" className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          {ev.link && <a href={ev.link} target="_blank" rel="noreferrer" className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-lg" title="Otwórz"><ExternalLink size={18} /></a>}
        </div>
      </Card>

      {/* Rejestracja + płatność */}
      <Card icon={Ticket} title="Rejestracja i płatność">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={!!ev.registration_required} onChange={(e) => save({ registration_required: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
            Wymaga rejestracji
          </label>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Podpięty formularz rejestracji</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CustomSelect value={ev.form_id || ''} onChange={(v) => save({ form_id: v || null })}
                  placeholder="— brak —"
                  options={[{ value: '', label: '— brak —' }, ...forms.map((f) => ({ value: f.id, label: f.title }))]} />
              </div>
              {formLink && (
                <>
                  <a href={formLink} target="_blank" rel="noreferrer" className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-lg" title="Otwórz formularz"><ExternalLink size={18} /></a>
                  <button onClick={() => { navigator.clipboard.writeText(formLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Kopiuj link">{copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}</button>
                </>
              )}
            </div>
            {formLink && <p className="mt-1 text-xs text-gray-400 truncate">{formLink}</p>}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input type="checkbox" checked={!!ev.is_paid} onChange={(e) => save({ is_paid: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
              Wydarzenie płatne
            </label>
            {ev.is_paid && (
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="0.01" value={ev.price != null ? (ev.price / 100) : ''} onChange={(e) => save({ price: e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 100) })} placeholder="0.00" className="w-28 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" />
                <span className="text-sm text-gray-500">zł</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Pola własne */}
      {fields.length > 0 && (
        <Card icon={FileText} title="Pola własne">
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.id || f.field_key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{f.label}</label>
                {f.field_type === 'dropdown' ? (
                  <CustomSelect value={ev.custom?.[f.field_key] || ''} onChange={(v) => saveCustom(f.field_key, v)} options={[{ value: '', label: '—' }, ...((f.options || []).map((o) => ({ value: o, label: o })))]} />
                ) : (
                  <input type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'} value={ev.custom?.[f.field_key] || ''} onChange={(e) => setEv({ ...ev, custom: { ...(ev.custom || {}), [f.field_key]: e.target.value } })} onBlur={(e) => saveCustom(f.field_key, e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Obecność (kto potwierdził / zapisani) */}
      <Card icon={Users} title="Obecność / zapisani">
        <EventRSVP eventId={ev.id} maxParticipants={ev.max_participants} />
      </Card>

      {/* Zaproszenia (do kogo wysłaliśmy) */}
      <Card icon={Send} title="Zaproszenia" actions={
        canManage && <button onClick={() => navigate('/rsvp')} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1.5"><Send size={14} /> Wyślij zaproszenia</button>
      }>
        {invites.length === 0 ? (
          <p className="text-sm text-gray-400">Brak wysłanych zaproszeń. Użyj „Wyślij zaproszenia" (moduł Obecność/RSVP), aby zaprosić osoby — statusy pojawią się tutaj.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3 text-xs">
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 font-semibold">Potwierdzili: {invCounts.yes}</span>
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-semibold">Może: {invCounts.maybe}</span>
              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 font-semibold">Odmówili: {invCounts.no}</span>
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-semibold">Oczekuje: {invCounts.pending}</span>
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Wysłano: {invites.length}</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {invites.map((i) => {
                const m = STATUS_META[i.status] || STATUS_META.pending;
                return (
                  <div key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{i.name || i.email || '—'}{i.guests_count ? <span className="text-accent-primary font-medium"> +{i.guests_count}</span> : null}</div>
                      {i.email && i.name && <div className="text-xs text-gray-400 truncate">{i.email}</div>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${m.cls}`}>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
