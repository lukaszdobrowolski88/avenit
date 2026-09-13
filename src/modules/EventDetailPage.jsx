import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Link as LinkIcon, ExternalLink, Trash2, Calendar, Clock, MapPin,
  Ticket, FileText, Users, Send, Copy, Check, X,
  Paperclip, Upload, Download, Image as ImageIcon, File as FileIcon, ClipboardList, Eye, Search,
  Music, Type, MoreHorizontal, User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import SimpleRichEditor from '../components/SimpleRichEditor';
import EventRSVP from '../components/EventRSVP';
import EventTeamsTab from './Events/EventTeamsTab';
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
const fmtDur = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};
// Typy elementów planu programu — odwzorowanie z modułu Programy (ikony/kolory).
const PROG_ITEM_TYPES = {
  item: { label: 'Element', icon: Type, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
  header: { label: 'Nagłówek', icon: MoreHorizontal, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  song: { label: 'Pieśń', icon: Music, color: 'text-accent-primary dark:text-accent-primary-light', bg: 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30' },
  media: { label: 'Media', icon: ImageIcon, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
};

// Widoczność wydarzenia — presety (PR B). Zaawansowany builder (służby/grupy/osoby) w PR C.
// module_key wydarzenia → klucz służby (dla presetu „Ta służba").
const MODULE_TO_MINISTRY = { media: 'media_team', worship: 'worship_team', atmosfera: 'atmosfera_team', kids: 'kids_ministry' };
const STAFF_ROLES = ['rada_starszych', 'koordynator', 'lider'];
const presetToSegments = (id, ministryKey) => {
  switch (id) {
    case 'all': return null; // brak ograniczeń = widoczne dla wszystkich (default)
    case 'ministry': return ministryKey ? [{ type: 'ministry', values: [ministryKey] }] : null;
    case 'elders': return [{ type: 'role', values: ['rada_starszych'] }];
    case 'staff': return [{ type: 'role', values: STAFF_ROLES }];
    case 'owner': return [{ type: 'owner' }];
    case 'invited': return [{ type: 'invited' }];
    default: return null;
  }
};
const detectPreset = (segs, ministryKey) => {
  if (!Array.isArray(segs) || segs.length === 0) return 'all';
  if (segs.length === 1) {
    const s = segs[0];
    if (s.type === 'owner') return 'owner';
    if (s.type === 'invited') return 'invited';
    if (s.type === 'role') {
      const v = [...(s.values || [])].sort().join(',');
      if (v === 'rada_starszych') return 'elders';
      if (v === [...STAFF_ROLES].sort().join(',')) return 'staff';
    }
    if (s.type === 'ministry' && ministryKey && (s.values || []).length === 1 && s.values[0] === ministryKey) return 'ministry';
  }
  return 'custom'; // ustawione zaawansowanym builderem (PR C) — nie nadpisujemy w tle
};
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
  const [programs, setPrograms] = useState([]);
  const [programDetail, setProgramDetail] = useState(null);
  const [songs, setSongs] = useState([]);
  const [typeTabs, setTypeTabs] = useState([]); // konfiguracja zakładek wg typu (app_settings)
  const [typeTeams, setTypeTeams] = useState([]); // konfiguracja służb wg typu (app_settings)
  const [fields, setFields] = useState([]);
  const [invites, setInvites] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [campaignIds, setCampaignIds] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showVisBuilder, setShowVisBuilder] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);
  const [tab, setTab] = useState('szczegoly');
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef(null);

  const canManage = useCan('module:calendar');
  const moduleTitle = useModuleLabel(ev?.module_key, ev?.module_key || 'Wydarzenie');
  const moduleColor = useModuleColor(ev?.module_key);
  const calCfg = useModuleCalendar(ev?.module_key || 'general'); // brak modułu → typy kalendarza „Ogólne"
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
    supabase.from('programs').select('id, title, type, date').order('date', { ascending: false })
      .then(({ data }) => setPrograms(data || [])).catch(() => {});
    supabase.from('songs').select('id, title, key')
      .then(({ data }) => setSongs(data || [])).catch(() => {});
    supabase.from('app_settings').select('value').eq('key', 'event_type_tabs').maybeSingle()
      .then(({ data }) => { try { const a = data?.value ? JSON.parse(data.value) : []; setTypeTabs(Array.isArray(a) ? a : []); } catch { setTypeTabs([]); } })
      .catch(() => {});
    supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle()
      .then(({ data }) => { try { const a = data?.value ? JSON.parse(data.value) : []; setTypeTeams(Array.isArray(a) ? a : []); } catch { setTypeTeams([]); } })
      .catch(() => {});
  }, []);

  // Podgląd podpiętego programu (plan/pieśni) — do zakładki „Program".
  useEffect(() => {
    if (!ev?.program_id) { setProgramDetail(null); return; }
    supabase.from('programs').select('id, title, date, schedule, song_ids').eq('id', ev.program_id).maybeSingle()
      .then(({ data }) => setProgramDetail(data || null)).catch(() => setProgramDetail(null));
  }, [ev?.program_id]);

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

  // Załączniki: upload do bucketa public-assets, zapis listy w events.attachments (jsonb).
  const uploadAttachments = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const file of files) {
        const safe = (file.name || 'plik').replace(/[^\w.\-]+/g, '_');
        const path = `events/${id}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from('public-assets').upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
        added.push({ name: file.name, url: data?.publicUrl, path, type: file.type || '', size: file.size || 0 });
      }
      save({ attachments: [...(ev.attachments || []), ...added] });
      toast.success(added.length > 1 ? `Wgrano ${added.length} plików.` : 'Wgrano plik.');
    } catch (e) { toast.error('Nie udało się wgrać: ' + (e.message || e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removeAttachment = async (idx) => {
    const list = ev.attachments || [];
    const att = list[idx];
    if (!att) return;
    if (att.path) { try { await supabase.storage.from('public-assets').remove([att.path]); } catch { /* plik mógł już nie istnieć */ } }
    save({ attachments: list.filter((_, i) => i !== idx) });
  };

  // Utwórz nowy program z modułu Programy prefillowany danymi wydarzenia, podepnij i otwórz edytor.
  const createProgram = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('programs').insert([{
        date: String(ev.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        title: ev.title || null,
        schedule: [],
        song_ids: [],
        campus_id: ev.campus_id || null,
        created_by: user?.email || null,
      }]).select().single();
      if (error) throw error;
      setPrograms((prev) => [{ id: data.id, title: data.title, type: data.type, date: data.date }, ...prev]);
      save({ program_id: data.id });
      toast.success('Utworzono program — otwieram edytor.');
      navigate(`/programs/${data.id}?event=${id}`);
    } catch (e) { toast.error('Nie udało się utworzyć programu: ' + (e.message || e)); }
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

  const progItems = Array.isArray(programDetail?.schedule) ? programDetail.schedule : [];
  const progTotal = progItems.reduce((s, it) => s + (Number(it?.duration) || 0), 0);
  const progSongs = progItems.filter((it) => it?.type === 'song').length;

  // Służby dla tej zakładki. Priorytet: override per wydarzenie (events.team_types, CSV) →
  // reguła event_type_teams (module_key+event_type) → fallback moduł-służba.
  const KNOWN_TEAM_MODULES = ['worship', 'media', 'atmosfera', 'kids'];
  const teamRule = (typeTeams || []).find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type && r.event_type === ev.event_type);
  const defaultTeamTypes = (teamRule && Array.isArray(teamRule.teams) && teamRule.teams.length)
    ? teamRule.teams
    : (ev.module_key && KNOWN_TEAM_MODULES.includes(ev.module_key) ? [ev.module_key] : []);
  const teamTypes = (typeof ev.team_types === 'string')
    ? ev.team_types.split(',').map((s) => s.trim()).filter(Boolean)
    : defaultTeamTypes;

  // Dodatkowe zakładki wg typu wydarzenia (konfiguracja w Ustawieniach wydarzeń).
  const extraTabs = [];
  (typeTabs || []).forEach((rule) => {
    if ((rule?.module_key || '') === (ev.module_key || '') && rule?.event_type && rule.event_type === ev.event_type) {
      (rule.tabs || []).forEach((tb) => { if (tb?.id) extraTabs.push({ id: `custom:${tb.id}`, label: tb.label || 'Zakładka' }); });
    }
  });

  const TABS = [
    { id: 'szczegoly', label: 'Szczegóły', icon: FileText },
    { id: 'program', label: 'Program', icon: ClipboardList, badge: ev.program_id ? '●' : null },
    { id: 'rejestracja', label: 'Rejestracja i płatność', icon: Ticket, badge: (ev.registration_required || ev.is_paid) ? '●' : null },
    { id: 'sluzby', label: 'Służby', icon: Users, badge: teamTypes.length ? '●' : null },
    { id: 'uczestnicy', label: 'Uczestnicy', icon: Users, badge: invites.length || null },
    { id: 'zalaczniki', label: 'Załączniki', icon: Paperclip, badge: (ev.attachments?.length) || null },
    ...extraTabs.map((x) => ({ id: x.id, label: x.label, icon: FileText })),
    ...(canManage ? [{ id: 'widocznosc', label: 'Widoczność', icon: Eye }] : []),
  ];

  return (
    <div className="w-full space-y-5 pb-16">
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

      {/* Zakładki */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === tb.id ? 'border-accent-primary text-accent-primary' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <tb.icon size={16} /> {tb.label}
            {tb.badge != null && (
              <span className={`text-[10px] ${tb.badge === '●' ? 'text-accent-primary' : 'px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>{tb.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* SZCZEGÓŁY */}
      {tab === 'szczegoly' && (<div className="space-y-5">
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
      </div>)}

      {/* WIDOCZNOŚĆ */}
      {tab === 'widocznosc' && canManage && (
        <Card icon={Eye} title="Kto widzi wydarzenie">
          {(() => {
            const ministryKey = MODULE_TO_MINISTRY[ev.module_key];
            const current = detectPreset(ev.visibility_segments, ministryKey);
            const presets = [
              { id: 'all', label: 'Wszyscy' },
              ...(ministryKey ? [{ id: 'ministry', label: 'Ta służba' }] : []),
              { id: 'elders', label: 'Rada Starszych' },
              { id: 'staff', label: 'Kadra (liderzy)' },
              { id: 'owner', label: 'Tylko organizatorzy' },
              { id: 'invited', label: 'Zaproszeni' },
            ];
            const HINTS = {
              all: 'Widoczne dla wszystkich z dostępem do kalendarza.',
              ministry: 'Widoczne tylko dla członków tej służby (oraz administratorów).',
              elders: 'Widoczne tylko dla Rady Starszych (oraz administratorów).',
              staff: 'Widoczne dla liderów, koordynatorów i Rady Starszych (oraz administratorów).',
              owner: 'Widoczne tylko dla organizatorów / twórcy (oraz administratorów).',
              invited: 'Widoczne tylko dla osób zaproszonych lub zapisanych na to wydarzenie.',
              custom: 'Ustawiono zaawansowane audytorium (służby / grupy / osoby).',
            };
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {current === 'custom' && (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-primary text-white">Zaawansowane (własne)</span>
                  )}
                  {presets.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => save({ visibility_segments: presetToSegments(p.id, ministryKey) })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${current === p.id ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}>
                      {p.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowVisBuilder(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-accent-primary hover:bg-accent-primary/5">
                    Zaawansowane…
                  </button>
                </div>
                <p className="text-xs text-gray-400">{HINTS[current] || HINTS.all}</p>
              </div>
            );
          })()}
        </Card>
      )}

      {/* PROGRAM */}
      {tab === 'program' && (<div className="space-y-5">
      <Card icon={ClipboardList} title="Program" actions={
        canManage && (
          <div className="flex items-center gap-2">
            <button onClick={createProgram} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1.5">
              <ClipboardList size={14} /> Nowy program
            </button>
            {ev.program_id && (
              <button onClick={() => navigate(`/programs/${ev.program_id}?event=${ev.id}`)} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5">
                <ExternalLink size={14} /> Otwórz / edytuj
              </button>
            )}
          </div>
        )
      }>
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-md">
            <CustomSelect value={ev.program_id || ''} onChange={(v) => save({ program_id: v || null })}
              placeholder="— brak —"
              options={[{ value: '', label: '— brak —' }, ...programs.map((p) => ({
                value: p.id,
                label: `${p.title || p.type || 'Program'}${p.date ? ` · ${fmtDate(p.date)}` : ''}`,
              }))]} />
          </div>
          {ev.program_id && (
            <button onClick={() => save({ program_id: null })} className="text-sm text-gray-400 hover:text-red-500">Odepnij</button>
          )}
        </div>
        {!programs.length && <p className="mt-1 text-xs text-gray-400">Brak programów. Kliknij „Nowy program", aby utworzyć i podpiąć.</p>}

        {/* Podgląd planu podpiętego programu */}
        {ev.program_id && programDetail && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
              <span className="font-semibold text-gray-800 dark:text-gray-100">{programDetail.title || 'Program'}</span>
              {programDetail.date && <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"><Calendar size={13} /> {fmtDate(programDetail.date)}</span>}
              <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"><Clock size={13} /> {fmtDur(progTotal)} łącznie</span>
              <span className="text-gray-500 dark:text-gray-400">{progItems.length} elementów</span>
              <span className="text-gray-500 dark:text-gray-400">{progSongs} pieśni</span>
            </div>
            {progItems.length === 0 ? (
              <p className="text-sm text-gray-400">Program nie ma jeszcze elementów. Kliknij „Otwórz / edytuj", aby dodać plan.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {progItems.map((it, idx) => {
                  if (it?.type === 'header') {
                    return <div key={it.id || idx} className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">{it.title || 'Sekcja'}</div>;
                  }
                  const tdef = PROG_ITEM_TYPES[it?.type] || PROG_ITEM_TYPES.item;
                  const Icon = tdef.icon;
                  const song = it?.type === 'song' && it?.songId ? songs.find((s) => s.id === it.songId) : null;
                  const itemTitle = it?.type === 'song' ? (it?.title || song?.title || 'Pieśń') : (it?.title || 'Element');
                  const songKey = it?.songKey || song?.key;
                  return (
                    <div key={it.id || idx} className="flex items-start gap-3 px-3 py-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tdef.bg}`}><Icon size={14} className={tdef.color} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{itemTitle}</div>
                        {(it?.person || (it?.timing && it.timing !== 'during') || (it?.type === 'song' && songKey)) && (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {it?.person && <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1"><User size={10} className="text-gray-400" /> {it.person}</span>}
                            {it?.timing && it.timing !== 'during' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${it.timing === 'before' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>{it.timing === 'before' ? 'Przed' : 'Po'}</span>
                            )}
                            {it?.type === 'song' && songKey && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary font-semibold">{songKey}</span>}
                          </div>
                        )}
                        {it?.details && <div className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-pre-line mt-0.5 leading-snug">{it.details}</div>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums mt-1">{fmtDur(it?.duration)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
      </div>)}

      {/* ZAŁĄCZNIKI */}
      {tab === 'zalaczniki' && (<div className="space-y-5">
      <Card icon={Paperclip} title="Załączniki i grafiki" actions={
        canManage && (
          <>
            <input ref={fileRef} type="file" multiple onChange={(e) => uploadAttachments(e.target.files)} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5 disabled:opacity-60">
              <Upload size={14} /> {uploading ? 'Wgrywanie…' : 'Dodaj pliki'}
            </button>
          </>
        )
      }>
        {(ev.attachments || []).length === 0 ? (
          <p className="text-sm text-gray-400">Brak załączników. Dodaj grafiki (plakat, harmonogram) lub pliki (PDF, dokumenty).</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(ev.attachments || []).map((a, i) => {
              const isImg = (a.type || '').startsWith('image/');
              return (
                <div key={a.path || i} className="group relative rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800/50">
                  <a href={a.url} target="_blank" rel="noreferrer" className="block">
                    {isImg ? (
                      <img src={a.url} alt={a.name} className="w-full h-28 object-cover" />
                    ) : (
                      <div className="w-full h-28 flex items-center justify-center text-gray-400">
                        <FileIcon size={30} />
                      </div>
                    )}
                    <div className="px-2 py-1.5 flex items-center gap-1.5">
                      {isImg ? <ImageIcon size={13} className="text-accent-primary shrink-0" /> : <Download size={13} className="text-accent-primary shrink-0" />}
                      <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{a.name}</span>
                    </div>
                  </a>
                  {canManage && (
                    <button onClick={() => removeAttachment(i)} title="Usuń"
                      className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-white/90 dark:bg-gray-900/90 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      </div>)}

      {/* REJESTRACJA */}
      {tab === 'rejestracja' && (<div className="space-y-5">
      <Card icon={Ticket} title="Rejestracja i płatność">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={!!ev.registration_required} onChange={(e) => save({ registration_required: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
            Wymaga rejestracji
          </label>
          {ev.registration_required && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Rejestracja do (termin)</label>
              <input type="date" value={String(ev.registration_deadline || '').slice(0, 10)}
                onChange={(e) => save({ registration_deadline: e.target.value || null })}
                className="w-full sm:w-56 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
            </div>
          )}
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
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Płatność do (termin)</label>
                  <input type="date" value={String(ev.payment_deadline || '').slice(0, 10)}
                    onChange={(e) => save({ payment_deadline: e.target.value || null })}
                    className="w-full sm:w-56 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
      </div>)}

      {/* SZCZEGÓŁY — pola własne */}
      {tab === 'szczegoly' && fields.length > 0 && (
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

      {/* UCZESTNICY */}
      {tab === 'uczestnicy' && (<div className="space-y-5">
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
      </div>)}

      {/* Służby — przypisania służb per team_type (override per wydarzenie / config / fallback) */}
      {tab === 'sluzby' && (
        <EventTeamsTab
          event={ev}
          teamTypes={teamTypes}
          defaultTeamTypes={defaultTeamTypes}
          canManage={canManage}
          onSaveAssignments={(a) => save({ assignments: a })}
          onSaveTeams={(csv) => save({ team_types: csv })}
        />
      )}

      {/* Zakładki wg typu (konfigurowalne) — na razie notatki/informacje na zakładkę */}
      {tab.startsWith('custom:') && (() => {
        const key = `tabhtml_${tab.slice('custom:'.length)}`;
        const label = extraTabs.find((x) => x.id === tab)?.label || 'Zakładka';
        return (
          <div className="space-y-5">
            <Card icon={FileText} title={label}>
              <SimpleRichEditor content={ev.custom?.[key] || ''} onChange={(html) => setEv({ ...ev, custom: { ...(ev.custom || {}), [key]: html } })} placeholder={`Notatki / informacje — ${label}…`} />
              <div className="mt-2 flex justify-end">
                <button onClick={() => save({ custom: { ...(ev.custom || {}), [key]: ev.custom?.[key] || '' } })} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium">Zapisz</button>
              </div>
            </Card>
          </div>
        );
      })()}

      {showInvite && (
        <EventInviteModal
          event={ev}
          ensureCampaign={ensureCampaign}
          existingMemberIds={invites.map((i) => i.member_id).filter(Boolean)}
          onClose={() => setShowInvite(false)}
          onSent={() => { setShowInvite(false); load(); }}
        />
      )}

      {showVisBuilder && (
        <VisibilityBuilderModal
          initial={ev.visibility_segments}
          onClose={() => setShowVisBuilder(false)}
          onSave={(segs) => { save({ visibility_segments: segs }); setShowVisBuilder(false); }}
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

// ---------------- Zaawansowany builder audytorium (widoczność) ----------------
const VIS_ROLES = [
  { value: 'rada_starszych', label: 'Rada Starszych' },
  { value: 'koordynator', label: 'Koordynatorzy' },
  { value: 'lider', label: 'Liderzy' },
  { value: 'czlonek', label: 'Członkowie' },
];
const VIS_MINISTRY_LABELS = { worship_team: 'Zespół Uwielbienia', media_team: 'Media Team', atmosfera_team: 'Atmosfera Team', kids_ministry: 'Małe Avenit' };
const prettyMin = (k) => VIS_MINISTRY_LABELS[k] || String(k || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const memName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Osoba';

function VisChips({ options, selected, onToggle, empty }) {
  if (!options.length) return <p className="text-xs text-gray-400 italic">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button key={o.value} type="button" onClick={() => onToggle(o.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${on ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function fromSegments(arr) {
  const s = { everyone: false, invited: false, owner: false, roles: [], ministries: [], groups: [], campuses: [], tags: [], members: [] };
  if (!Array.isArray(arr)) return s;
  for (const x of arr) {
    if (x?.type === 'everyone') s.everyone = true;
    else if (x?.type === 'invited') s.invited = true;
    else if (x?.type === 'owner') s.owner = true;
    else if (x?.type === 'role') s.roles = (x.values || []).map(String);
    else if (x?.type === 'ministry') s.ministries = (x.values || []).map(String);
    else if (x?.type === 'home_group') s.groups = (x.values || []).map(String);
    else if (x?.type === 'campus') s.campuses = (x.values || []).map(String);
    else if (x?.type === 'tag') s.tags = (x.values || []).map(String);
    else if (x?.type === 'member') s.members = (x.values || []).map(String);
  }
  return s;
}
function toSegments(s) {
  if (s.everyone) return null; // wszyscy = brak ograniczeń
  const out = [];
  if (s.roles.length) out.push({ type: 'role', values: s.roles });
  if (s.ministries.length) out.push({ type: 'ministry', values: s.ministries });
  if (s.groups.length) out.push({ type: 'home_group', values: s.groups });
  if (s.campuses.length) out.push({ type: 'campus', values: s.campuses });
  if (s.tags.length) out.push({ type: 'tag', values: s.tags });
  if (s.members.length) out.push({ type: 'member', values: s.members });
  if (s.invited) out.push({ type: 'invited' });
  if (s.owner) out.push({ type: 'owner' });
  return out.length ? out : null;
}

function VisibilityBuilderModal({ initial, onClose, onSave }) {
  const [s, setS] = useState(() => fromSegments(initial));
  const [members, setMembers] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('members').select('id, first_name, last_name, email, ministries, tags').order('last_name', { ascending: true })
      .then(({ data }) => setMembers(data || [])).catch(() => setMembers([]));
    supabase.from('home_groups').select('id, name').order('name', { ascending: true })
      .then(({ data }) => setHomeGroups(data || [])).catch(() => setHomeGroups([]));
    supabase.from('campuses').select('id, name').order('name', { ascending: true })
      .then(({ data }) => setCampuses(data || [])).catch(() => setCampuses([]));
  }, []);

  const ministryOptions = React.useMemo(() => {
    const set = new Set();
    members.forEach((m) => (m.ministries || []).forEach((x) => x && set.add(x)));
    return [...set].map((v) => ({ value: String(v), label: prettyMin(v) }));
  }, [members]);
  const tagOptions = React.useMemo(() => {
    const set = new Set();
    members.forEach((m) => (m.tags || []).forEach((x) => x && set.add(x)));
    return [...set].map((v) => ({ value: String(v), label: String(v) }));
  }, [members]);
  const groupOptions = homeGroups.map((g) => ({ value: String(g.id), label: g.name }));
  const campusOptions = campuses.map((c) => ({ value: String(c.id), label: c.name }));

  const toggle = (key, val) => setS((prev) => ({ ...prev, [key]: prev[key].includes(val) ? prev[key].filter((x) => x !== val) : [...prev[key], val] }));
  const memberFiltered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? members.filter((m) => memName(m).toLowerCase().includes(q)) : members;
  }, [members, search]);

  return (
    <Modal isOpen onClose={onClose} size="md" title="Zaawansowane audytorium — kto widzi">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
          Wydarzenie zobaczy osoba pasująca do <b>któregokolwiek</b> z zaznaczonych kryteriów. Administratorzy widzą zawsze.
        </p>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5">
          <input type="checkbox" checked={s.everyone} onChange={(e) => setS({ ...s, everyone: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
          Wszyscy (bez ograniczeń) — nadrzędne wobec pozostałych
        </label>

        {!s.everyone && (
          <>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Role</p>
              <VisChips options={VIS_ROLES} selected={s.roles} onToggle={(v) => toggle('roles', v)} empty="—" /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Służby</p>
              <VisChips options={ministryOptions} selected={s.ministries} onToggle={(v) => toggle('ministries', v)} empty="Brak przypisanych służb" /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Grupy domowe</p>
              <VisChips options={groupOptions} selected={s.groups} onToggle={(v) => toggle('groups', v)} empty="Brak grup domowych" /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Kampusy</p>
              <VisChips options={campusOptions} selected={s.campuses} onToggle={(v) => toggle('campuses', v)} empty="Brak kampusów" /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Tagi</p>
              <VisChips options={tagOptions} selected={s.tags} onToggle={(v) => toggle('tags', v)} empty="Brak tagów" /></div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={s.invited} onChange={(e) => setS({ ...s, invited: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" /> Zaproszeni/zapisani
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={s.owner} onChange={(e) => setS({ ...s, owner: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" /> Organizatorzy
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Pojedyncze osoby ({s.members.length})</p>
              <div className="relative mb-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj osoby…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
                {memberFiltered.slice(0, 100).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <input type="checkbox" checked={s.members.includes(String(m.id))} onChange={() => toggle('members', String(m.id))} className="w-4 h-4 rounded accent-accent-primary" />
                    <span className="text-gray-800 dark:text-gray-100 truncate">{memName(m)}</span>
                  </label>
                ))}
                {memberFiltered.length > 100 && <p className="px-3 py-2 text-xs text-gray-400">Pokazano 100 z {memberFiltered.length} — zawęź wyszukiwaniem.</p>}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Anuluj</button>
        <button onClick={() => onSave(toSegments(s))} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium">Zapisz widoczność</button>
      </div>
    </Modal>
  );
}
