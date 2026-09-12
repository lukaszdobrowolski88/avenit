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
import Modal from '../components/Modal';
import { useModuleCalendar, useModuleLabel, useModuleColor } from '../hooks/useModuleLabel';
import { useCan } from '../components/Can';

const genToken = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID().replace(/-/g, '')
  : (Math.random().toString(36).slice(2) + Date.now().toString(36));

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
  const [campaign, setCampaign] = useState(null);
  const [campaignIds, setCampaignIds] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);

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
      const { data: camps } = await supabase.from('rsvp_campaigns').select('*').eq('event_id', id).order('created_at', { ascending: false });
      const ids = (camps || []).map((c) => c.id);
      setCampaign((camps && camps[0]) || null);
      setCampaignIds(ids);
      if (ids.length) {
        const { data: inv } = await supabase.from('rsvp_invitations')
          .select('id, member_id, name, email, status, sent_channels, guests_count').in('campaign_id', ids);
        setInvites(inv || []);
      } else setInvites([]);
    } catch { setInvites([]); setCampaign(null); setCampaignIds([]); }
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

  // Zapewnij kampanię RSVP powiązaną z wydarzeniem (utwórz szkic, jeśli brak) — wspólną dla
  // zaproszeń i automatyzacji przypomnień. Zwraca obiekt kampanii.
  const ensureCampaign = async () => {
    if (campaign) return campaign;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('rsvp_campaigns').insert({
      title: ev.title || 'Wydarzenie', event_type: ev.event_type || 'event',
      event_date: String(ev.date || '').slice(0, 10) || null, event_time: ev.time || null,
      location: ev.location || null, channels: ['email'], status: 'draft',
      created_by: user?.email || null, campus_id: ev.campus_id || null, event_id: ev.id,
    }).select().single();
    if (error) throw error;
    setCampaign(data);
    setCampaignIds((prev) => [data.id, ...prev]);
    return data;
  };

  // Ręczne przypomnienie osobom bez odpowiedzi (status pending) — teraz.
  const sendReminder = async () => {
    const ids = campaignIds.length ? campaignIds : (campaign ? [campaign.id] : []);
    if (!ids.length) return toast.info('Najpierw wyślij zaproszenia.');
    setRemindBusy(true);
    try {
      let total = 0;
      for (const cid of ids) {
        const { data, error } = await supabase.functions.invoke('rsvp-send', { body: { campaign_id: cid, mode: 'reminder' } });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        total += (data?.stats?.email || 0) + (data?.stats?.sms || 0) + (data?.stats?.push || 0);
      }
      toast.success(total ? `Wysłano przypomnienia (${total}).` : 'Brak osób do przypomnienia.');
      load();
    } catch (e) { toast.error('Nie udało się wysłać przypomnień: ' + (e.message || e)); }
    finally { setRemindBusy(false); }
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
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Formularz rejestracji (wewnętrzny)</label>
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
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">…lub link do zewnętrznego formularza</label>
            <div className="flex items-center gap-2">
              <input value={ev.form_url || ''} onChange={(e) => setEv({ ...ev, form_url: e.target.value })} onBlur={(e) => save({ form_url: e.target.value })} placeholder="https://forms.google.com/…" className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              {ev.form_url && <a href={ev.form_url} target="_blank" rel="noreferrer" className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-lg" title="Otwórz"><ExternalLink size={18} /></a>}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input type="checkbox" checked={!!ev.is_paid} onChange={(e) => save({ is_paid: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
              Wydarzenie płatne
            </label>
            {ev.is_paid && (
              <div className="mt-2 space-y-2">
                {(ev.prices || []).map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p.label || ''} onChange={(e) => setEv({ ...ev, prices: (ev.prices || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} onBlur={() => save({ prices: ev.prices || [] })} placeholder="Opis (np. Bilet normalny)" className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                    <input type="number" min="0" step="0.01" value={p.amount != null ? (p.amount / 100) : ''} onChange={(e) => setEv({ ...ev, prices: (ev.prices || []).map((x, j) => j === i ? { ...x, amount: e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 100) } : x) })} onBlur={() => save({ prices: ev.prices || [] })} placeholder="0.00" className="w-24 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" />
                    <span className="text-sm text-gray-500">zł</span>
                    <button onClick={() => save({ prices: (ev.prices || []).filter((_, j) => j !== i) })} className="p-1.5 text-gray-400 hover:text-red-500"><X size={16} /></button>
                  </div>
                ))}
                <button onClick={() => save({ prices: [...(ev.prices || []), { label: '', amount: null }] })} className="flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary"><span className="text-base leading-none">＋</span> Dodaj cenę</button>
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
        canManage && (
          <div className="flex items-center gap-2">
            {invCounts.pending > 0 && (
              <button onClick={sendReminder} disabled={remindBusy}
                className="text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 flex items-center gap-1.5 disabled:opacity-60">
                <Clock size={14} /> {remindBusy ? 'Wysyłanie…' : `Przypomnij oczekującym (${invCounts.pending})`}
              </button>
            )}
            <button onClick={() => setShowInvite(true)} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5"><Send size={14} /> Wyślij zaproszenia</button>
          </div>
        )
      }>
        {invites.length === 0 ? (
          <p className="text-sm text-gray-400">Brak wysłanych zaproszeń. Kliknij „Wyślij zaproszenia", aby zaprosić osoby — statusy odpowiedzi pojawią się tutaj.</p>
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

      {/* Automatyzacja przypomnień */}
      {canManage && (
        <ReminderAutomation campaign={campaign} campaignIds={campaignIds} ensureCampaign={ensureCampaign} onSaved={load} />
      )}

      {showInvite && (
        <EventInviteModal
          event={ev}
          ensureCampaign={ensureCampaign}
          existingMemberIds={invites.map((i) => i.member_id).filter(Boolean)}
          onClose={() => setShowInvite(false)}
          onSent={() => { setShowInvite(false); load(); }}
        />
      )}
    </div>
  );
}

// Modal: wyślij zaproszenia (kampania RSVP) pre-fill z danych wydarzenia.
// Reużywa jednej kampanii wydarzenia (ensureCampaign) i wysyła tylko nowe zaproszenia.
function EventInviteModal({ event, ensureCampaign, existingMemberIds = [], onClose, onSent }) {
  const invitedSet = new Set(existingMemberIds);
  const [members, setMembers] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [channels, setChannels] = useState({ email: true, push: false, sms: false });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('members').select('id, first_name, last_name, email, phone').order('last_name', { ascending: true })
      .then(({ data }) => setMembers(data || [])).catch(() => setMembers([]));
  }, []);

  const name = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || '—';
  const filtered = members.filter((m) => {
    const s = search.trim().toLowerCase();
    return !s || name(m).toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s);
  });
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = filtered.length > 0 && filtered.every((m) => sel.has(m.id));
  const toggleAll = () => setSel((p) => { const n = new Set(p); if (allShownSelected) filtered.forEach((m) => n.delete(m.id)); else filtered.forEach((m) => n.add(m.id)); return n; });

  const send = async () => {
    const recips = members.filter((m) => sel.has(m.id));
    if (!recips.length) return toast.error('Wybierz odbiorców.');
    const chans = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (!chans.length) return toast.error('Wybierz co najmniej jeden kanał.');
    // Pomiń już zaproszonych (dedup po member_id) — wyślemy tylko nowym.
    const newRecips = recips.filter((m) => !invitedSet.has(m.id));
    if (!newRecips.length) return toast.info('Wybrane osoby są już zaproszone.');
    setBusy(true);
    try {
      const camp = await ensureCampaign();
      // Zaktualizuj kanały/treść kampanii pod tę wysyłkę.
      await supabase.from('rsvp_campaigns').update({ channels: chans, message: message || null }).eq('id', camp.id);
      const invites = newRecips.map((m) => ({
        campaign_id: camp.id, member_id: m.id, name: name(m),
        email: m.email || null, phone: m.phone || null, token: genToken(),
        status: 'pending', campus_id: event.campus_id || null,
      }));
      const insertedIds = [];
      for (let i = 0; i < invites.length; i += 500) {
        const { data: ins, error: e2 } = await supabase.from('rsvp_invitations').insert(invites.slice(i, i + 500)).select('id');
        if (e2) throw e2;
        (ins || []).forEach((r) => insertedIds.push(r.id));
      }
      const { data: sres, error: serr } = await supabase.functions.invoke('rsvp-send', {
        body: { campaign_id: camp.id, channels: chans, invitation_ids: insertedIds },
      });
      if (serr || sres?.error) throw new Error(sres?.error || serr?.message);
      const s = sres?.stats || {};
      toast.success(`Wysłano zaproszenia. E-mail: ${s.email || 0}, SMS: ${s.sms || 0}, Push: ${s.push || 0}${s.failed ? `, niepowodzeń: ${s.failed}` : ''}.`);
      onSent();
    } catch (e) { toast.error('Nie udało się wysłać: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="md" title={`Wyślij zaproszenia — ${event.title || ''}`}>
      <div className="p-5 space-y-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
          {fmtDate(event.date) || '—'}{event.time ? `, ${event.time}` : ''}{event.location ? ` · ${event.location}` : ''}
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Kanały</label>
          <div className="flex items-center gap-4">
            {[['email', 'E-mail'], ['push', 'Push'], ['sms', 'SMS']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={!!channels[k]} onChange={(e) => setChannels((c) => ({ ...c, [k]: e.target.checked }))} className="w-4 h-4 rounded accent-accent-primary" /> {l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Wiadomość (opcjonalnie)</label>
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Zapraszamy na…" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm resize-none" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Odbiorcy ({sel.size})</label>
            <button onClick={toggleAll} className="text-xs text-accent-primary hover:text-accent-secondary">{allShownSelected ? 'Odznacz widoczne' : 'Zaznacz widoczne'}</button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj osoby…" className="w-full mb-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 ? <div className="p-3 text-sm text-gray-400 text-center">Brak osób.</div> : filtered.map((m) => {
              const invited = invitedSet.has(m.id);
              return (
                <label key={m.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${invited ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <input type="checkbox" checked={invited || sel.has(m.id)} disabled={invited} onChange={() => toggle(m.id)} className="w-4 h-4 rounded accent-accent-primary" />
                  <span className="text-gray-800 dark:text-gray-100 truncate">{name(m)}</span>
                  {invited && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">zaproszony</span>}
                  {m.email && <span className="text-xs text-gray-400 truncate ml-auto">{m.email}</span>}
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Anuluj</button>
        <button onClick={send} disabled={busy || sel.size === 0} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60 flex items-center gap-1.5"><Send size={15} /> Wyślij ({sel.size})</button>
      </div>
    </Modal>
  );
}

// Automatyzacja przypomnień: sekwencja kroków (dni przed + kanały + opcjonalna treść) + auto-zamknięcie zapisów.
const CHANNELS = [['email', 'E-mail'], ['push', 'Push'], ['sms', 'SMS']];
function ReminderAutomation({ campaign, campaignIds, ensureCampaign, onSaved }) {
  const fromCampaign = () => {
    const s = campaign?.reminder_steps;
    if (Array.isArray(s) && s.length) {
      return s.map((x) => ({
        days: Number(x?.days) || 0,
        channels: Array.isArray(x?.channels) && x.channels.length ? x.channels : ['email'],
        message: x?.message || '',
      }));
    }
    return [{ days: 1, channels: ['email'], message: '' }];
  };
  const [enabled, setEnabled] = useState(!!campaign?.reminder_enabled);
  const [autoClose, setAutoClose] = useState(!!campaign?.auto_close);
  const [steps, setSteps] = useState(fromCampaign);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(!!campaign?.reminder_enabled);
    setAutoClose(!!campaign?.auto_close);
    setSteps(fromCampaign());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]);

  const setStep = (i, patch) => setSteps((st) => st.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const toggleChannel = (i, ch) => setSteps((st) => st.map((s, idx) => {
    if (idx !== i) return s;
    const has = s.channels.includes(ch);
    const channels = has ? s.channels.filter((c) => c !== ch) : [...s.channels, ch];
    return { ...s, channels: channels.length ? channels : s.channels };
  }));
  const addStep = () => setSteps((st) => [...st, { days: 1, channels: ['email'], message: '' }]);
  const removeStep = (i) => setSteps((st) => st.filter((_, idx) => idx !== i));
  const applyPreset = () => setSteps([
    { days: 7, channels: ['email'], message: '' },
    { days: 3, channels: ['email', 'push'], message: '' },
    { days: 1, channels: ['email', 'push', 'sms'], message: '' },
  ]);

  const save = async () => {
    setSaving(true);
    try {
      const cleanSteps = steps
        .map((s) => ({
          days: Math.max(0, Number(s.days) || 0),
          channels: s.channels.length ? s.channels : ['email'],
          ...(s.message?.trim() ? { message: s.message.trim() } : {}),
        }))
        .sort((a, b) => b.days - a.days);
      const camp = await ensureCampaign();
      const ids = campaignIds && campaignIds.length ? campaignIds : [camp.id];
      const payload = { reminder_enabled: enabled, reminder_steps: cleanSteps, auto_close: autoClose };
      for (const cid of ids) {
        const { error } = await supabase.from('rsvp_campaigns').update(payload).eq('id', cid);
        if (error) throw error;
      }
      toast.success('Zapisano automatyzację przypomnień.');
      onSaved?.();
    } catch (e) { toast.error('Nie udało się zapisać: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  return (
    <Card icon={Clock} title="Automatyzacja przypomnień" actions={
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded accent-accent-primary" />
        Włączone
      </label>
    }>
      {!enabled ? (
        <p className="text-sm text-gray-400">Automatyczne przypomnienia wyłączone. Włącz, aby system sam wysyłał ponaglenia osobom bez odpowiedzi w wybranych terminach przed wydarzeniem.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">Kroki wysyłane osobom bez odpowiedzi (na X dni przed wydarzeniem):</p>
            <button onClick={applyPreset} className="text-xs text-accent-primary hover:underline">Ustaw 7 / 3 / 1 (eskalacja)</button>
          </div>

          {steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="number" min="0" max="60" value={s.days}
                  onChange={(e) => setStep(i, { days: e.target.value })}
                  className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center" />
                <span className="text-sm text-gray-600 dark:text-gray-300">dni przed</span>
                <div className="flex gap-1.5 ml-auto">
                  {CHANNELS.map(([k, lbl]) => (
                    <button key={k} type="button" onClick={() => toggleChannel(i, k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${s.channels.includes(k) ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      {lbl}
                    </button>
                  ))}
                  <button type="button" onClick={() => removeStep(i)} className="p-1.5 text-gray-400 hover:text-red-500" title="Usuń krok"><X size={15} /></button>
                </div>
              </div>
              <input value={s.message} onChange={(e) => setStep(i, { message: e.target.value })}
                placeholder="Treść przypomnienia (opcjonalnie — domyślnie jak w kampanii)"
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            </div>
          ))}

          <button onClick={addStep} className="text-sm text-accent-primary hover:underline">+ Dodaj krok</button>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <input type="checkbox" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} className="w-4 h-4 rounded accent-accent-primary" />
            Automatycznie zamknij zapisy po dacie wydarzenia
          </label>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60">
          {saving ? 'Zapisywanie…' : 'Zapisz automatyzację'}
        </button>
      </div>
    </Card>
  );
}
