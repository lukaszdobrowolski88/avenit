import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Link as LinkIcon, ExternalLink, Trash2, Calendar, Clock, MapPin,
  Ticket, FileText, Users, Send, Copy, Check, X,
  Paperclip, Upload, Download, Image as ImageIcon, File as FileIcon, ClipboardList, Eye, Search,
  Music, Type, MoreHorizontal, User, FolderOpen, AlertTriangle, Loader2, RefreshCw,
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
import EventMaterialsTab from './Events/EventMaterialsTab';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { useModuleCalendar, useModuleLabel, useModuleColor } from '../hooks/useModuleLabel';
import { useModules } from '../hooks/useModules';
import { useCan } from '../components/Can';
import { DateInput, TimeField } from '../components/pickers';
import { confirmDialog } from '../lib/dialog';
import { tr } from '../i18n';

const genToken = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID().replace(/-/g, '')
  : (Math.random().toString(36).slice(2) + Date.now().toString(36));

const DEFAULT_TYPES = [
  { value: 'nabożeństwo', label: 'Nabożeństwo' },
  { value: 'spotkanie', label: 'Spotkanie' },
  { value: 'wydarzenie', label: 'Wydarzenie' },
  { value: 'szkolenie', label: 'Szkolenie' },
  { value: 'inne', label: 'Inne' },
];
const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
// Godzina końca musi być po początku (porównanie HH:MM; '18:00:00' z bazy = '18:00').
const endNotAfterStart = (start, end) => {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  return !!(s && e && e <= s);
};
// Opóźnienie autozapisu opisu (ms) — zapis po chwili bez pisania, nie przy każdym znaku.
const AUTOSAVE_MS = 800;
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
  const [loadError, setLoadError] = useState(false);
  // Stan autozapisu (wskaźnik w nagłówku): idle | saving | saved | error.
  const [saveState, setSaveState] = useState('idle');
  const [timeError, setTimeError] = useState('');
  const inflight = useRef(0);
  const failedPatch = useRef(null); // ostatnie niezapisane zmiany (do „Ponów")
  const pending = useRef({}); // { [klucz]: { timer, patch } } — odłożone (debounce) zapisy opisów
  const savedTitle = useRef('');
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

  // Edycja = to samo, co egzekwuje serwer (moduł + res:events:update). Dawniej wystarczał
  // module:calendar, który ma też członek — widział edytor, a zapisy kończyły się cichym 403.
  const canOpenCalendar = useCan('module:calendar');
  const canUpdateEvents = useCan('res:events:update');
  const canManage = canOpenCalendar && canUpdateEvents;
  const moduleTitle = useModuleLabel(ev?.module_key, ev?.module_key || tr('Wydarzenie'));
  const moduleColor = useModuleColor(ev?.module_key);
  const calCfg = useModuleCalendar(ev?.module_key || 'general'); // brak modułu → typy kalendarza „Ogólne"
  const types = calCfg?.types?.length ? calCfg.types : DEFAULT_TYPES.map((dt) => ({ ...dt, label: tr(dt.label) }));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    // Błąd sieci/uprawnień to nie to samo co „nie ma takiego wydarzenia".
    if (error) { setLoadError(true); setEv(null); setLoading(false); return; }
    setEv(data || null);
    savedTitle.current = data?.title || '';
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

  // Autozapis pól wydarzenia. Zwraca true/false; błąd → czytelny komunikat z „Ponów",
  // a w nagłówku stan „Nie zapisano". Sprawdzamy też, czy wiersz faktycznie się zmienił
  // (0 zmienionych wierszy = brak uprawnień, a nie sukces).
  const save = useCallback(async (patch) => {
    setEv((e) => (e ? { ...e, ...patch } : e));
    inflight.current += 1;
    setSaveState('saving');
    const { data, error, status } = await supabase.from('events').update(patch).eq('id', id).select('id');
    inflight.current -= 1;
    const failed = !!error || (Array.isArray(data) && data.length === 0);
    if (failed) {
      failedPatch.current = { ...(failedPatch.current || {}), ...patch };
      setSaveState('error');
      const forbidden = status === 403 || error?.code === '403' || (!error && Array.isArray(data));
      toast.error({
        message: forbidden
          ? tr('Nie masz uprawnień do edycji tego wydarzenia — zmiana nie została zapisana.')
          : tr('Nie udało się zapisać zmian wydarzenia. Sprawdź połączenie.'),
        action: forbidden ? undefined : { label: tr('Ponów'), onClick: () => retryRef.current?.() },
      });
      return false;
    }
    if (failedPatch.current) {
      // Zapisany patch mógł zawierać pola z nieudanego zapisu — zdejmij je z kolejki ponowień.
      const rest = { ...failedPatch.current };
      Object.keys(patch).forEach((k) => { delete rest[k]; });
      failedPatch.current = Object.keys(rest).length ? rest : null;
    }
    if (inflight.current === 0) setSaveState(failedPatch.current ? 'error' : 'saved');
    return true;
  }, [id]);
  const retryRef = useRef(null);
  retryRef.current = () => { if (failedPatch.current) save(failedPatch.current); };

  // Odłożony zapis (opis rich text): zapis po AUTOSAVE_MS bez pisania; flushPending() zapisuje od razu.
  const saveLater = (key, patch) => {
    const cur = pending.current[key];
    if (cur?.timer) clearTimeout(cur.timer);
    setSaveState('saving');
    const timer = setTimeout(() => { delete pending.current[key]; save(patch); }, AUTOSAVE_MS);
    pending.current[key] = { timer, patch };
  };
  const flushPending = useCallback(async () => {
    const entries = Object.values(pending.current);
    pending.current = {};
    for (const { timer, patch } of entries) { clearTimeout(timer); await save(patch); }
  }, [save]);
  const flushRef = useRef(flushPending);
  flushRef.current = flushPending;

  // Nie gub opisu: zapis przy opuszczeniu strony w aplikacji i ostrzeżenie przy zamknięciu karty.
  useEffect(() => () => { flushRef.current?.(); }, []);
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (Object.keys(pending.current).length || inflight.current > 0 || failedPatch.current) {
        flushRef.current?.();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const saveCustom = (key, val) => save({ custom: { ...(ev?.custom || {}), [key]: val } });

  // Wstecz: po wejściu z linku (mail, powiadomienie) historia jest pusta — wtedy lista wydarzeń.
  const goBack = async () => {
    await flushPending();
    if (window.history.length > 1) navigate(-1); else navigate('/wydarzenia');
  };

  // Tytuł: pusty nie jest zapisywany — wraca poprzednia nazwa.
  const commitTitle = (value) => {
    const title = String(value || '').trim();
    if (!title) {
      setEv((e) => ({ ...e, title: savedTitle.current }));
      toast.error(tr('Nazwa wydarzenia nie może być pusta — przywrócono poprzednią.'));
      return;
    }
    if (title === savedTitle.current) return;
    savedTitle.current = title;
    save({ title });
  };

  // Data jest wymagana (wydarzenie bez daty znika z kalendarza i grafiku).
  const commitDate = (value) => {
    if (!value) { toast.error(tr('Wydarzenie musi mieć datę.')); return; }
    save({ date: value });
  };

  // Godziny: koniec musi być po początku. Błędna para zostaje tylko w formularzu (z komunikatem),
  // a zapisujemy dopiero poprawną.
  const commitTime = (field, value) => {
    const next = { time: ev?.time || '', end_time: ev?.end_time || '', [field]: value };
    setEv((e) => ({ ...e, [field]: value }));
    if (endNotAfterStart(next.time, next.end_time)) {
      setTimeError(tr('Godzina końca musi być późniejsza niż początek.'));
      return;
    }
    setTimeError('');
    save({ time: next.time || null, end_time: next.end_time || null });
  };

  const del = async () => {
    if (!await confirmDialog(tr('Usunąć wydarzenie „{name}”? Tej operacji nie można cofnąć.', { name: ev?.title || tr('Wydarzenie') }))) return;
    Object.values(pending.current).forEach(({ timer }) => clearTimeout(timer));
    pending.current = {};
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) return toast.error(tr('Nie udało się usunąć wydarzenia. Sprawdź, czy masz uprawnienia.'));
    toast.success(tr('Wydarzenie usunięte'));
    if (window.history.length > 1) navigate(-1); else navigate('/wydarzenia');
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
    if (!ids.length) return toast.info(tr('Najpierw wyślij zaproszenia.'));
    setRemindBusy(true);
    try {
      let total = 0;
      for (const cid of ids) {
        const { data, error } = await supabase.functions.invoke('rsvp-send', { body: { campaign_id: cid, mode: 'reminder' } });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        total += (data?.stats?.email || 0) + (data?.stats?.sms || 0) + (data?.stats?.push || 0);
      }
      toast.success(total ? tr('Wysłano przypomnienia ({n}).', { n: total }) : tr('Brak osób do przypomnienia.'));
      load();
    } catch (e) { toast.error(tr('Nie udało się wysłać przypomnień: {msg}', { msg: e.message || e })); }
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
      if (await save({ attachments: [...(ev.attachments || []), ...added] })) {
        toast.success(added.length > 1 ? tr('Wgrano {n} plików.', { n: added.length }) : tr('Wgrano plik.'));
      }
    } catch (e) { toast.error(tr('Nie udało się wgrać: {msg}', { msg: e.message || e })); }
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
      if (!await save({ program_id: data.id })) return;
      toast.success(tr('Utworzono program — otwieram edytor.'));
      navigate(`/programs/${data.id}?event=${id}`);
    } catch (e) { toast.error(tr('Nie udało się utworzyć programu: {msg}', { msg: e.message || e })); }
  };

  if (loading) return <Spinner center size={28} />;
  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <EmptyState icon={AlertTriangle} title={tr('Nie udało się wczytać wydarzenia')} subtitle={tr('Sprawdź połączenie z internetem albo uprawnienia i spróbuj ponownie.')}
          action={<div className="flex gap-2"><Button variant="outline" icon={ArrowLeft} onClick={() => navigate('/wydarzenia')}>{tr('Wróć do wydarzeń')}</Button><Button icon={RefreshCw} onClick={load}>{tr('Spróbuj ponownie')}</Button></div>} />
      </div>
    );
  }
  if (!ev) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <EmptyState icon={Calendar} title={tr('Nie znaleziono wydarzenia')} subtitle={tr('Mogło zostać usunięte.')}
          action={<Button variant="outline" icon={ArrowLeft} onClick={() => navigate('/wydarzenia')}>{tr('Wróć do wydarzeń')}</Button>} />
      </div>
    );
  }

  const formLink = ev.form_id ? `${window.location.origin}/form/${ev.form_id}` : null;
  const invCounts = {
    yes: invites.filter((i) => i.status === 'yes').length,
    maybe: invites.filter((i) => i.status === 'maybe').length,
    no: invites.filter((i) => i.status === 'no').length,
    pending: invites.filter((i) => i.status === 'pending').length,
  };
  const STATUS_META = {
    yes: { label: tr('Potwierdził'), cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
    maybe: { label: tr('Może'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
    no: { label: tr('Odmówił'), cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
    pending: { label: tr('Oczekuje'), cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
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

  // Konfiguracja zakładek wg typu (Ustawienia): własne zakładki + włączanie/wyłączanie wbudowanych.
  const tabRule = (typeTabs || []).find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type && r.event_type === ev.event_type) || null;
  const tabBi = tabRule?.builtins || null;
  const tabOn = (id, def) => (tabBi && id in tabBi) ? tabBi[id] === true : def;
  const materialsEnabled = tabBi && 'materialy' in tabBi ? tabBi.materialy === true : (tabRule?.materials === true);
  const extraTabs = [];
  (tabRule?.tabs || []).forEach((tb) => { if (tb?.id) extraTabs.push({ id: `custom:${tb.id}`, label: tb.label || tr('Zakładka') }); });

  const TABS = [
    { id: 'szczegoly', label: tr('Szczegóły'), icon: FileText },
    ...(tabOn('program', true) ? [{ id: 'program', label: tr('Program'), icon: ClipboardList, badge: ev.program_id ? '●' : null }] : []),
    ...(tabOn('rejestracja', true) ? [{ id: 'rejestracja', label: tr('Rejestracja i płatność'), icon: Ticket, badge: (ev.registration_required || ev.is_paid) ? '●' : null }] : []),
    ...(tabOn('sluzby', true) ? [{ id: 'sluzby', label: tr('Służby'), icon: Users, badge: (teamTypes.length || Object.keys(ev.assignments || {}).length || (ev.team_layout?.sections?.length)) ? '●' : null }] : []),
    ...(tabOn('uczestnicy', true) ? [{ id: 'uczestnicy', label: tr('Uczestnicy'), icon: Users, badge: invites.length || null }] : []),
    ...(materialsEnabled ? [{ id: 'materialy', label: tr('Materiały'), icon: FolderOpen }] : []),
    ...extraTabs.map((x) => ({ id: x.id, label: x.label, icon: FileText })),
    ...(canManage && tabOn('widocznosc', true) ? [{ id: 'widocznosc', label: tr('Widoczność'), icon: Eye }] : []),
  ];
  // Kolejność zakładek wg konfiguracji (Zakładki wg typu). Zakładki spoza order → na końcu (domyślnie).
  if (tabRule?.order?.length) {
    const oi = (id) => { const k = tabRule.order.indexOf(id); return k === -1 ? 999 : k; };
    TABS.sort((a, b) => oi(a.id) - oi(b.id));
  }

  return (
    <div className="w-full space-y-5 pb-16">
      {/* Nagłówek */}
      <div className="flex items-start gap-3">
        <button onClick={goBack} aria-label={tr('Wróć')} title={tr('Wróć')} className="mt-1 p-1.5 -ml-1.5 shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ArrowLeft size={20} /></button>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary" style={moduleColor ? { background: moduleColor } : undefined}>
          <Calendar className="text-white w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <input value={ev.title || ''} readOnly={roField}
            aria-label={tr('Nazwa wydarzenia')}
            onChange={(e) => { const v = e.target.value; setEv((cur) => ({ ...cur, title: v })); }}
            onBlur={(e) => { if (!roField) commitTitle(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            placeholder={tr('Nazwa wydarzenia')}
            className={`w-full text-2xl font-bold bg-transparent text-gray-900 dark:text-white outline-none rounded-lg px-1 -mx-1 focus:ring-2 focus:ring-accent-primary/30 ${roField ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-text'}`} />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1"><Calendar size={14} aria-hidden="true" /> {fmtDate(ev.date) || '—'}</span>
            <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden="true" /> {ev.time || '—'}{ev.end_time ? `–${ev.end_time}` : ''}</span>
            {ev.location && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" /> {ev.location}</span>}
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs">{moduleTitle}</span>
            {canManage && saveState !== 'idle' && (
              <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 text-xs ${saveState === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {saveState === 'saving' && <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> {tr('Zapisywanie…')}</>}
                {saveState === 'saved' && <><Check size={12} className="text-green-600 dark:text-green-400" aria-hidden="true" /> {tr('Zapisano')}</>}
                {saveState === 'error' && (
                  <>
                    <AlertTriangle size={12} aria-hidden="true" /> {tr('Nie zapisano')}
                    <button type="button" onClick={() => retryRef.current?.()} className="ml-1 font-semibold underline hover:no-underline">{tr('Ponów')}</button>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <button onClick={del} className="mt-1 p-2 shrink-0 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title={tr('Usuń wydarzenie')} aria-label={tr('Usuń wydarzenie')}><Trash2 size={18} /></button>
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
      <Card icon={Calendar} title={tr('Termin i miejsce')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Data')}</label>
            <CustomDatePicker value={String(ev.date || '').slice(0, 10)} onChange={commitDate} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Początek')}</label>
            <TimeField value={ev.time || ''} onChange={(e) => commitTime('time', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Koniec')}</label>
            <TimeField value={ev.end_time || ''} onChange={(e) => commitTime('end_time', e.target.value)} aria-invalid={timeError ? true : undefined} className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-sm ${timeError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Typ')}</label>
            <CustomSelect value={ev.event_type || ''} onChange={(v) => save({ event_type: v })} options={types} />
          </div>
        </div>
        {timeError && (
          <p role="alert" className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle size={13} aria-hidden="true" /> {timeError} {tr('Godziny nie zostały zapisane.')}
          </p>
        )}
        <div className="mt-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Lokalizacja')}</label>
          <input value={ev.location || ''} onChange={(e) => setEv({ ...ev, location: e.target.value })} onBlur={(e) => save({ location: e.target.value })} placeholder={tr('Sala główna, Kościół…')} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
        </div>
      </Card>

      {/* Szczegóły (rich text) */}
      <Card icon={FileText} title={tr('Szczegóły wydarzenia')}>
        {/* Opis zapisuje się sam (jak pozostałe pola) — chwilę po ostatnim znaku, przy wyjściu
            ze strony i przed zamknięciem karty. Dawniej wymagał „Zapisz szczegóły" i przepadał. */}
        <SimpleRichEditor content={ev.details_html || ev.description || ''}
          onChange={(html) => {
            setEv((cur) => ({ ...cur, details_html: html }));
            if (canManage) saveLater('details_html', { details_html: html });
          }}
          placeholder={tr('Opis, agenda, informacje dla uczestników…')} />
        {canManage && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{tr('Opis zapisuje się automatycznie.')}</p>}
      </Card>

      {/* Link */}
      <Card icon={LinkIcon} title={tr('Link')}>
        <div className="flex items-center gap-2">
          <input value={ev.link || ''} onChange={(e) => setEv({ ...ev, link: e.target.value })} onBlur={(e) => save({ link: e.target.value })} placeholder="https://…" className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          {ev.link && <a href={ev.link} target="_blank" rel="noreferrer" className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-lg" title={tr('Otwórz')}><ExternalLink size={18} /></a>}
        </div>
      </Card>
      </div>)}

      {/* WIDOCZNOŚĆ */}
      {tab === 'widocznosc' && canManage && (
        <Card icon={Eye} title={tr('Kto widzi wydarzenie')}>
          {(() => {
            const ministryKey = MODULE_TO_MINISTRY[ev.module_key];
            const current = detectPreset(ev.visibility_segments, ministryKey);
            const presets = [
              { id: 'all', label: tr('Wszyscy') },
              ...(ministryKey ? [{ id: 'ministry', label: tr('Ta służba') }] : []),
              { id: 'elders', label: tr('Rada Starszych') },
              { id: 'staff', label: tr('Kadra (liderzy)') },
              { id: 'owner', label: tr('Tylko organizatorzy') },
              { id: 'invited', label: tr('Zaproszeni') },
            ];
            const HINTS = {
              all: tr('Widoczne dla wszystkich z dostępem do kalendarza.'),
              ministry: tr('Widoczne tylko dla członków tej służby (oraz administratorów).'),
              elders: tr('Widoczne tylko dla Rady Starszych (oraz administratorów).'),
              staff: tr('Widoczne dla liderów, koordynatorów i Rady Starszych (oraz administratorów).'),
              owner: tr('Widoczne tylko dla organizatorów / twórcy (oraz administratorów).'),
              invited: tr('Widoczne tylko dla osób zaproszonych lub zapisanych na to wydarzenie.'),
              custom: tr('Ustawiono zaawansowane audytorium (służby / grupy / osoby).'),
            };
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {current === 'custom' && (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-primary text-white">{tr('Zaawansowane (własne)')}</span>
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
                    {tr('Zaawansowane…')}
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
      <Card icon={ClipboardList} title={tr('Program')} actions={
        canManage && (
          <div className="flex items-center gap-2">
            <button onClick={createProgram} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1.5">
              <ClipboardList size={14} /> {tr('Nowy program')}
            </button>
            {ev.program_id && (
              <button onClick={() => navigate(`/programs/${ev.program_id}?event=${ev.id}`)} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5">
                <ExternalLink size={14} /> {tr('Otwórz / edytuj')}
              </button>
            )}
          </div>
        )
      }>
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-md">
            <CustomSelect value={ev.program_id || ''} onChange={(v) => save({ program_id: v || null })}
              placeholder={tr('— brak —')}
              options={[{ value: '', label: tr('— brak —') }, ...programs.map((p) => ({
                value: p.id,
                label: `${p.title || p.type || tr('Program')}${p.date ? ` · ${fmtDate(p.date)}` : ''}`,
              }))]} />
          </div>
          {ev.program_id && (
            <button onClick={() => save({ program_id: null })} className="text-sm text-gray-400 hover:text-red-500">{tr('Odepnij')}</button>
          )}
        </div>
        {!programs.length && <p className="mt-1 text-xs text-gray-400">{tr('Brak programów. Kliknij „Nowy program", aby utworzyć i podpiąć.')}</p>}

        {/* Podgląd planu podpiętego programu */}
        {ev.program_id && programDetail && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
              <span className="font-semibold text-gray-800 dark:text-gray-100">{programDetail.title || tr('Program')}</span>
              {programDetail.date && <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"><Calendar size={13} /> {fmtDate(programDetail.date)}</span>}
              <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"><Clock size={13} /> {fmtDur(progTotal)} {tr('łącznie')}</span>
              <span className="text-gray-500 dark:text-gray-400">{tr('{n} elementów', { n: progItems.length })}</span>
              <span className="text-gray-500 dark:text-gray-400">{tr('{n} pieśni', { n: progSongs })}</span>
            </div>
            {progItems.length === 0 ? (
              <p className="text-sm text-gray-400">{tr('Program nie ma jeszcze elementów. Kliknij „Otwórz / edytuj", aby dodać plan.')}</p>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {progItems.map((it, idx) => {
                  if (it?.type === 'header') {
                    return <div key={it.id || idx} className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">{it.title || tr('Sekcja')}</div>;
                  }
                  const tdef = PROG_ITEM_TYPES[it?.type] || PROG_ITEM_TYPES.item;
                  const Icon = tdef.icon;
                  const song = it?.type === 'song' && it?.songId ? songs.find((s) => s.id === it.songId) : null;
                  const itemTitle = it?.type === 'song' ? (it?.title || song?.title || tr('Pieśń')) : (it?.title || tr('Element'));
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
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${it.timing === 'before' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>{it.timing === 'before' ? tr('Przed') : tr('Po')}</span>
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
      {/* REJESTRACJA */}
      {tab === 'rejestracja' && (<div className="space-y-5">
      <Card icon={Ticket} title={tr('Rejestracja i płatność')}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={!!ev.registration_required} onChange={(e) => save({ registration_required: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
            {tr('Wymaga rejestracji')}
          </label>
          {ev.registration_required && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Rejestracja do (termin)')}</label>
              <DateInput value={String(ev.registration_deadline || '').slice(0, 10)}
                onChange={(e) => save({ registration_deadline: e.target.value || null })}
                className="w-full sm:w-56 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Formularz rejestracji (wewnętrzny)')}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CustomSelect value={ev.form_id || ''} onChange={(v) => save({ form_id: v || null })}
                  placeholder={tr('— brak —')}
                  options={[{ value: '', label: tr('— brak —') }, ...forms.map((f) => ({ value: f.id, label: f.title }))]} />
              </div>
              {formLink && (
                <>
                  <a href={formLink} target="_blank" rel="noreferrer" className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-lg" title={tr('Otwórz formularz')}><ExternalLink size={18} /></a>
                  <button onClick={() => { navigator.clipboard.writeText(formLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title={tr('Kopiuj link')}>{copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}</button>
                </>
              )}
            </div>
            {formLink && <p className="mt-1 text-xs text-gray-400 truncate">{formLink}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('…lub link do zewnętrznego formularza')}</label>
            <div className="flex items-center gap-2">
              <input value={ev.form_url || ''} onChange={(e) => setEv({ ...ev, form_url: e.target.value })} onBlur={(e) => save({ form_url: e.target.value })} placeholder="https://forms.google.com/…" className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              {ev.form_url && <a href={ev.form_url} target="_blank" rel="noreferrer" className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-lg" title={tr('Otwórz')}><ExternalLink size={18} /></a>}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input type="checkbox" checked={!!ev.is_paid} onChange={(e) => save({ is_paid: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
              {tr('Wydarzenie płatne')}
            </label>
            {ev.is_paid && (
              <div className="mt-2 space-y-2">
                {(ev.prices || []).map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p.label || ''} onChange={(e) => setEv({ ...ev, prices: (ev.prices || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} onBlur={() => save({ prices: ev.prices || [] })} placeholder={tr('Opis (np. Bilet normalny)')} className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                    <input type="number" min="0" step="0.01" value={p.amount != null ? (p.amount / 100) : ''} onChange={(e) => setEv({ ...ev, prices: (ev.prices || []).map((x, j) => j === i ? { ...x, amount: e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 100) } : x) })} onBlur={() => save({ prices: ev.prices || [] })} placeholder="0.00" className="w-24 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" />
                    <span className="text-sm text-gray-500">{tr('zł')}</span>
                    <button onClick={() => save({ prices: (ev.prices || []).filter((_, j) => j !== i) })} className="p-1.5 text-gray-400 hover:text-red-500"><X size={16} /></button>
                  </div>
                ))}
                <button onClick={() => save({ prices: [...(ev.prices || []), { label: '', amount: null }] })} className="flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary"><span className="text-base leading-none">＋</span> {tr('Dodaj cenę')}</button>
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Płatność do (termin)')}</label>
                  <DateInput value={String(ev.payment_deadline || '').slice(0, 10)}
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
        <Card icon={FileText} title={tr('Pola własne')}>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.id || f.field_key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{f.label}</label>
                {f.field_type === 'dropdown' ? (
                  <CustomSelect value={ev.custom?.[f.field_key] || ''} onChange={(v) => saveCustom(f.field_key, v)} options={[{ value: '', label: '—' }, ...((f.options || []).map((o) => ({ value: o, label: o })))]} />
                ) : f.field_type === 'date' ? (
                  <DateInput value={ev.custom?.[f.field_key] || ''} onChange={(e) => { setEv({ ...ev, custom: { ...(ev.custom || {}), [f.field_key]: e.target.value } }); saveCustom(f.field_key, e.target.value); }} />
                ) : (
                  <input type={f.field_type === 'number' ? 'number' : 'text'} value={ev.custom?.[f.field_key] || ''} onChange={(e) => setEv({ ...ev, custom: { ...(ev.custom || {}), [f.field_key]: e.target.value } })} onBlur={(e) => saveCustom(f.field_key, e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* UCZESTNICY */}
      {tab === 'uczestnicy' && (<div className="space-y-5">
      <Card icon={Users} title={tr('Obecność / zapisani')}>
        <EventRSVP eventId={ev.id} maxParticipants={ev.max_participants} />
      </Card>

      {/* Zaproszenia (do kogo wysłaliśmy) */}
      <Card icon={Send} title={tr('Zaproszenia')} actions={
        canManage && (
          <div className="flex items-center gap-2">
            {invCounts.pending > 0 && (
              <button onClick={sendReminder} disabled={remindBusy}
                className="text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 flex items-center gap-1.5 disabled:opacity-60">
                <Clock size={14} /> {remindBusy ? tr('Wysyłanie…') : tr('Przypomnij oczekującym ({n})', { n: invCounts.pending })}
              </button>
            )}
            <button onClick={() => setShowInvite(true)} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5"><Send size={14} /> {tr('Wyślij zaproszenia')}</button>
          </div>
        )
      }>
        {invites.length === 0 ? (
          <p className="text-sm text-gray-400">{tr('Brak wysłanych zaproszeń. Kliknij „Wyślij zaproszenia", aby zaprosić osoby — statusy odpowiedzi pojawią się tutaj.')}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3 text-xs">
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 font-semibold">{tr('Potwierdzili:')} {invCounts.yes}</span>
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-semibold">{tr('Może:')} {invCounts.maybe}</span>
              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 font-semibold">{tr('Odmówili:')} {invCounts.no}</span>
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-semibold">{tr('Oczekuje:')} {invCounts.pending}</span>
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{tr('Wysłano:')} {invites.length}</span>
            </div>
            {/* Lista zaproszonych (imiona, e-maile) tylko dla organizatora — reszta widzi liczniki;
                serwer i tak wymazuje cudze dane osobowe. */}
            {canManage && (
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
            )}
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
          // Przypisania zapisuje sama zakładka atomowo (fn event-assignments-patch); tu tylko
          // odbieramy świeży stan z serwera — NIGDY nie wysyłamy całego events.assignments.
          onAssignmentsChange={(a) => setEv((cur) => (cur ? { ...cur, assignments: a } : cur))}
          onSaveTeams={(csv) => save({ team_types: csv })}
          onSaveLayout={(l) => save({ team_layout: l })}
        />
      )}

      {/* Materiały — upload + podpinanie materiałów grup domowych (event_materials) */}
      {tab === 'materialy' && (
        <EventMaterialsTab event={ev} canManage={canManage} />
      )}

      {/* Zakładki wg typu (konfigurowalne) — na razie notatki/informacje na zakładkę */}
      {tab.startsWith('custom:') && (() => {
        const key = `tabhtml_${tab.slice('custom:'.length)}`;
        const label = extraTabs.find((x) => x.id === tab)?.label || tr('Zakładka');
        return (
          <div className="space-y-5">
            <Card icon={FileText} title={label}>
              <SimpleRichEditor content={ev.custom?.[key] || ''}
                onChange={(html) => {
                  // Funkcyjny setEv: edytor może trzymać starą wersję callbacku — nie nadpisuj innych pól.
                  setEv((cur) => {
                    const custom = { ...(cur.custom || {}), [key]: html };
                    if (canManage) saveLater(`custom:${key}`, { custom });
                    return { ...cur, custom };
                  });
                }}
                placeholder={tr('Notatki / informacje — {label}…', { label })} />
              {canManage && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{tr('Zmiany zapisują się automatycznie.')}</p>}
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
    if (!recips.length) return toast.error(tr('Wybierz odbiorców.'));
    const chans = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (!chans.length) return toast.error(tr('Wybierz co najmniej jeden kanał.'));
    // Pomiń już zaproszonych (dedup po member_id) — wyślemy tylko nowym.
    const newRecips = recips.filter((m) => !invitedSet.has(m.id));
    if (!newRecips.length) return toast.info(tr('Wybrane osoby są już zaproszone.'));
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
      toast.success(s.failed
        ? tr('Wysłano zaproszenia. E-mail: {email}, SMS: {sms}, Push: {push}, niepowodzeń: {failed}.', { email: s.email || 0, sms: s.sms || 0, push: s.push || 0, failed: s.failed })
        : tr('Wysłano zaproszenia. E-mail: {email}, SMS: {sms}, Push: {push}.', { email: s.email || 0, sms: s.sms || 0, push: s.push || 0 }));
      onSent();
    } catch (e) { toast.error(tr('Nie udało się wysłać: {msg}', { msg: e.message || e })); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={`${tr('Wyślij zaproszenia')} — ${event.title || ''}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Send} onClick={send} loading={busy} disabled={sel.size === 0}>{tr('Wyślij')} ({sel.size})</Button>
      </>}
    >
      <div className="p-6 space-y-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
          {fmtDate(event.date) || '—'}{event.time ? `, ${event.time}` : ''}{event.location ? ` · ${event.location}` : ''}
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Kanały')}</label>
          <div className="flex items-center gap-4">
            {[['email', 'E-mail'], ['push', 'Push'], ['sms', 'SMS']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={!!channels[k]} onChange={(e) => setChannels((c) => ({ ...c, [k]: e.target.checked }))} className="w-4 h-4 rounded accent-accent-primary" /> {tr(l)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{tr('Wiadomość (opcjonalnie)')}</label>
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr('Zapraszamy na…')} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm resize-none" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{tr('Odbiorcy')} ({sel.size})</label>
            <button onClick={toggleAll} className="text-xs text-accent-primary hover:text-accent-secondary">{allShownSelected ? tr('Odznacz widoczne') : tr('Zaznacz widoczne')}</button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Szukaj osoby…')} className="w-full mb-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 ? <div className="p-3 text-sm text-gray-400 text-center">{tr('Brak osób.')}</div> : filtered.map((m) => {
              const invited = invitedSet.has(m.id);
              return (
                <label key={m.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${invited ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <input type="checkbox" checked={invited || sel.has(m.id)} disabled={invited} onChange={() => toggle(m.id)} className="w-4 h-4 rounded accent-accent-primary" />
                  <span className="text-gray-800 dark:text-gray-100 truncate">{name(m)}</span>
                  {invited && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{tr('zaproszony')}</span>}
                  {m.email && <span className="text-xs text-gray-400 truncate ml-auto">{m.email}</span>}
                </label>
              );
            })}
          </div>
        </div>
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
      toast.success(tr('Zapisano automatyzację przypomnień.'));
      onSaved?.();
    } catch (e) { toast.error(tr('Nie udało się zapisać: {msg}', { msg: e.message || e })); }
    finally { setSaving(false); }
  };

  return (
    <Card icon={Clock} title={tr('Automatyzacja przypomnień')} actions={
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded accent-accent-primary" />
        {tr('Włączone')}
      </label>
    }>
      {!enabled ? (
        <p className="text-sm text-gray-400">{tr('Automatyczne przypomnienia wyłączone. Włącz, aby system sam wysyłał ponaglenia osobom bez odpowiedzi w wybranych terminach przed wydarzeniem.')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Kroki wysyłane osobom bez odpowiedzi (na X dni przed wydarzeniem):')}</p>
            <button onClick={applyPreset} className="text-xs text-accent-primary hover:underline">{tr('Ustaw 7 / 3 / 1 (eskalacja)')}</button>
          </div>

          {steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="number" min="0" max="60" value={s.days}
                  onChange={(e) => setStep(i, { days: e.target.value })}
                  className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{tr('dni przed')}</span>
                <div className="flex gap-1.5 ml-auto">
                  {CHANNELS.map(([k, lbl]) => (
                    <button key={k} type="button" onClick={() => toggleChannel(i, k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${s.channels.includes(k) ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      {tr(lbl)}
                    </button>
                  ))}
                  <button type="button" onClick={() => removeStep(i)} className="p-1.5 text-gray-400 hover:text-red-500" title={tr('Usuń krok')}><X size={15} /></button>
                </div>
              </div>
              <input value={s.message} onChange={(e) => setStep(i, { message: e.target.value })}
                placeholder={tr('Treść przypomnienia (opcjonalnie — domyślnie jak w kampanii)')}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            </div>
          ))}

          <button onClick={addStep} className="text-sm text-accent-primary hover:underline">+ {tr('Dodaj krok')}</button>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <input type="checkbox" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} className="w-4 h-4 rounded accent-accent-primary" />
            {tr('Automatycznie zamknij zapisy po dacie wydarzenia')}
          </label>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60">
          {saving ? tr('Zapisywanie…') : tr('Zapisz automatyzację')}
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
// Klucz służby (members.ministries) → nazwa modułu nadana przez kościół (app_modules),
// a dopiero potem domyślna. Dawniej: „Małe Avenit”, „Home Groups”, „Administration”.
const VIS_MINISTRY_MODULE = { worship_team: 'worship', media_team: 'media', atmosfera_team: 'atmosfera', kids_ministry: 'kids', mc_team: 'mc' };
const VIS_MINISTRY_LABELS = { worship_team: 'Zespół Uwielbienia', media_team: 'Media Team', atmosfera_team: 'Atmosfera Team', kids_ministry: 'Dzieci', mc_team: 'Scena / MC', administration: 'Administracja', home_groups: 'Grupy domowe' };
const prettyMin = (k, moduleLabels = {}) => {
  const modKey = VIS_MINISTRY_MODULE[k] || (String(k || '').startsWith('custom_') ? String(k).slice(7) : null);
  if (modKey && moduleLabels[modKey]) return moduleLabels[modKey];
  if (VIS_MINISTRY_LABELS[k]) return tr(VIS_MINISTRY_LABELS[k]);
  const plain = String(k || '').replace(/_/g, ' ');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
};
const memName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || tr('Osoba');

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

  const { modules: appModules } = useModules();
  const ministryOptions = React.useMemo(() => {
    const labels = {};
    (appModules || []).forEach((m) => { if (m?.key && m.label) labels[m.key] = m.label; });
    const set = new Set();
    members.forEach((m) => (m.ministries || []).forEach((x) => x && set.add(x)));
    return [...set].map((v) => ({ value: String(v), label: prettyMin(v, labels) }));
  }, [members, appModules]);
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
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={tr('Zaawansowane audytorium — kto widzi')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button onClick={() => onSave(toSegments(s))}>{tr('Zapisz widoczność')}</Button>
      </>}
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
          {tr('Wydarzenie zobaczy osoba pasująca do')} <b>{tr('któregokolwiek')}</b> {tr('z zaznaczonych kryteriów. Administratorzy widzą zawsze.')}
        </p>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5">
          <input type="checkbox" checked={s.everyone} onChange={(e) => setS({ ...s, everyone: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
          {tr('Wszyscy (bez ograniczeń) — nadrzędne wobec pozostałych')}
        </label>

        {!s.everyone && (
          <>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{tr('Role')}</p>
              <VisChips options={VIS_ROLES.map((r) => ({ ...r, label: tr(r.label) }))} selected={s.roles} onToggle={(v) => toggle('roles', v)} empty="—" /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{tr('Służby')}</p>
              <VisChips options={ministryOptions} selected={s.ministries} onToggle={(v) => toggle('ministries', v)} empty={tr('Brak przypisanych służb')} /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{tr('Grupy domowe')}</p>
              <VisChips options={groupOptions} selected={s.groups} onToggle={(v) => toggle('groups', v)} empty={tr('Brak grup domowych')} /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{tr('Kampusy')}</p>
              <VisChips options={campusOptions} selected={s.campuses} onToggle={(v) => toggle('campuses', v)} empty={tr('Brak kampusów')} /></div>
            <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{tr('Tagi')}</p>
              <VisChips options={tagOptions} selected={s.tags} onToggle={(v) => toggle('tags', v)} empty={tr('Brak tagów')} /></div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={s.invited} onChange={(e) => setS({ ...s, invited: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" /> {tr('Zaproszeni/zapisani')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={s.owner} onChange={(e) => setS({ ...s, owner: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" /> {tr('Organizatorzy')}
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{tr('Pojedyncze osoby')} ({s.members.length})</p>
              <div className="relative mb-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Szukaj osoby…')} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
                {memberFiltered.slice(0, 100).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <input type="checkbox" checked={s.members.includes(String(m.id))} onChange={() => toggle('members', String(m.id))} className="w-4 h-4 rounded accent-accent-primary" />
                    <span className="text-gray-800 dark:text-gray-100 truncate">{memName(m)}</span>
                  </label>
                ))}
                {memberFiltered.length > 100 && <p className="px-3 py-2 text-xs text-gray-400">{tr('Pokazano 100 z {n} — zawęź wyszukiwaniem.', { n: memberFiltered.length })}</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
