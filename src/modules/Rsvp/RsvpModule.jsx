import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarCheck, Plus, X, Send, ArrowLeft, Check, HelpCircle, Users, Copy, Search, Trash2, ClipboardCheck,
} from 'lucide-react';
import { supabase, getCachedUser } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import CustomSelect from '../../components/CustomSelect';
import Modal from '../../components/Modal';

const EVENT_TYPES = [
  { value: 'service', label: 'Nabożeństwo' },
  { value: 'home_group', label: 'Grupa domowa' },
  { value: 'kids', label: 'Szkółka niedzielna' },
  { value: 'event', label: 'Wydarzenie' },
  { value: 'custom', label: 'Inne' },
];
const AUDIENCE = [
  { value: 'all', label: 'Wszyscy członkowie' },
  { value: 'home_group', label: 'Grupa domowa' },
  { value: 'status', label: 'Wg statusu' },
  { value: 'manual', label: 'Wybór ręczny' },
];
const STATUSES = [
  { value: 'Członek', label: 'Członkowie' },
  { value: 'Sympatyk', label: 'Sympatycy' },
  { value: 'Gość', label: 'Goście' },
];

const memberName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Członek';
function genToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'r' + crypto.randomUUID().replace(/-/g, '');
  return 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function RsvpModule() {
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();
  const [campaigns, setCampaigns] = useState([]);
  const [invByCampaign, setInvByCampaign] = useState({});
  const [members, setMembers] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // campaign obj
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let cq = supabase.from('rsvp_campaigns').select('*').order('created_at', { ascending: false });
      cq = withCampusFilter(cq);
      const { data: camps } = await cq;
      setCampaigns(camps || []);

      const ids = (camps || []).map(c => c.id);
      if (ids.length) {
        const { data: invs } = await supabase.from('rsvp_invitations').select('*').in('campaign_id', ids);
        const grouped = {};
        (invs || []).forEach(i => { (grouped[i.campaign_id] = grouped[i.campaign_id] || []).push(i); });
        setInvByCampaign(grouped);
      } else setInvByCampaign({});

      let mq = supabase.from('members').select('id, first_name, last_name, email, phone, status, home_group_id').order('last_name');
      mq = withCampusFilter(mq);
      const { data: mem } = await mq;
      setMembers(mem || []);

      try {
        let hq = supabase.from('home_groups').select('id, name').order('name');
        hq = withCampusFilter(hq);
        const { data: hg } = await hq;
        setHomeGroups(hg || []);
      } catch { setHomeGroups([]); }
    } catch (err) {
      console.error('RSVP load error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load, selectedCampusId]);

  const counts = (campId) => {
    const list = invByCampaign[campId] || [];
    const c = { total: list.length, yes: 0, no: 0, maybe: 0, pending: 0, guests: 0 };
    list.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; if (i.status === 'yes') c.guests += (i.guests_count || 0); });
    return c;
  };

  if (selected) {
    return <CampaignDetail campaign={selected} invitations={invByCampaign[selected.id] || []} onBack={() => { setSelected(null); load(); }} onChanged={load} />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <CalendarCheck className="text-white" size={24} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Obecność (RSVP)</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Zaproszenia „Będę / Nie będę" przez push, e-mail i SMS</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md">
          <Plus size={16} /> Nowa kampania
        </button>
      </div>

      {loading ? <div className="p-10 text-center text-gray-400">Ładowanie...</div>
      : campaigns.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <CalendarCheck size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak kampanii. Utwórz pierwsze zaproszenie na wydarzenie, grupę domową lub szkółkę.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map(c => {
            const ct = counts(c.id);
            return (
              <button key={c.id} onClick={() => setSelected(c)} className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:border-accent-primary-light transition">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white truncate">{c.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {EVENT_TYPES.find(e => e.value === c.event_type)?.label || c.event_type}
                      {c.event_date ? ` · ${new Date(c.event_date).toLocaleDateString('pl-PL')}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${c.status === 'sent' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {c.status === 'sent' ? 'Wysłane' : 'Szkic'}
                  </span>
                </div>
                <div className="flex gap-3 mt-4 text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"><Check size={14} />{ct.yes}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1"><HelpCircle size={14} />{ct.maybe}</span>
                  <span className="text-red-500 font-semibold flex items-center gap-1"><X size={14} />{ct.no}</span>
                  <span className="text-gray-400 font-medium ml-auto flex items-center gap-1"><Users size={14} />{ct.total}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <CreateCampaignModal
          members={members} homeGroups={homeGroups} campusIdForInsert={campusIdForInsert}
          onClose={() => setModalOpen(false)}
          onCreated={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ---------------- Tworzenie kampanii ----------------
function CreateCampaignModal({ members, homeGroups, campusIdForInsert, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', event_type: 'event', event_date: '', event_time: '', location: '', message: '',
  });
  const [channels, setChannels] = useState({ push: true, email: true, sms: false });
  const [audience, setAudience] = useState('all');
  const [homeGroupId, setHomeGroupId] = useState('');
  const [statusVal, setStatusVal] = useState('Członek');
  const [manualIds, setManualIds] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDays, setReminderDays] = useState(1);
  const [isSeries, setIsSeries] = useState(false);
  const [seriesInterval, setSeriesInterval] = useState(7);

  const recipients = useMemo(() => {
    if (audience === 'all') return members;
    if (audience === 'home_group') return members.filter(m => m.home_group_id === homeGroupId);
    if (audience === 'status') return members.filter(m => m.status === statusVal);
    if (audience === 'manual') return members.filter(m => manualIds.includes(m.id));
    return [];
  }, [audience, members, homeGroupId, statusVal, manualIds]);

  const manualFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? members.filter(m => memberName(m).toLowerCase().includes(s)) : members;
  }, [members, search]);

  const create = async () => {
    if (!form.title.trim()) { alert('Podaj tytuł.'); return; }
    const chans = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (!chans.length) { alert('Wybierz co najmniej jeden kanał.'); return; }
    if (!recipients.length) { alert('Brak odbiorców dla wybranej grupy.'); return; }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const payload = {
        title: form.title.trim(), event_type: form.event_type,
        event_date: form.event_date || null, event_time: form.event_time || null,
        location: form.location || null, message: form.message || null,
        channels: chans, status: 'draft', created_by: user?.email || null, campus_id: campusIdForInsert,
        reminder_enabled: reminderEnabled, reminder_days_before: Number(reminderDays) || 1,
      };
      if (isSeries) {
        // Szablon serii: nie tworzymy zaproszeń teraz — worker rsvp-series generuje
        // kolejne wystąpienia z zapisanej publiczności.
        payload.is_series = true;
        payload.recur_interval_days = Number(seriesInterval) || 7;
        payload.series_next_date = form.event_date || new Date().toISOString().slice(0, 10);
        payload.audience_member_ids = recipients.map(m => m.id);
      }
      const { data: camp, error } = await supabase.from('rsvp_campaigns').insert(payload).select().single();
      if (error) throw error;

      if (!isSeries) {
        const invites = recipients.map(m => ({
          campaign_id: camp.id, member_id: m.id, name: memberName(m),
          email: m.email || null, phone: m.phone || null, token: genToken(),
          status: 'pending', campus_id: campusIdForInsert,
        }));
        for (let i = 0; i < invites.length; i += 500) {
          const { error: e2 } = await supabase.from('rsvp_invitations').insert(invites.slice(i, i + 500));
          if (e2) throw e2;
        }
      }
      onCreated();
    } catch (err) {
      alert('Nie udało się utworzyć kampanii: ' + (err.message || err));
    } finally { setSaving(false); }
  };

  const toggleManual = (id) => setManualIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return (
    <Modal isOpen>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Nowa kampania RSVP</h3>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tytuł</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="np. Grupa domowa — wtorek" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
            </div>
            <CustomSelect label="Typ" value={form.event_type} onChange={v => setForm(f => ({ ...f, event_type: v }))} options={EVENT_TYPES} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data</label>
                <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Godzina</label>
                <input value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} placeholder="np. 18:00" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>
            </div>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Miejsce (opcjonalnie)" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={2} placeholder="Treść zaproszenia..." className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />

            {/* Kanały */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">Kanały</label>
              <div className="flex gap-2">
                {[['push', 'Push'], ['email', 'E-mail'], ['sms', 'SMS']].map(([k, lbl]) => (
                  <button key={k} onClick={() => setChannels(c => ({ ...c, [k]: !c[k] }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${channels[k] ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Przypomnienie */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 px-4 py-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} className="rounded accent-emerald-500" />
                Automatyczne przypomnienie niepotwierdzonym
              </label>
              {reminderEnabled && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <input type="number" min="0" max="14" value={reminderDays} onChange={e => setReminderDays(e.target.value)} className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-gray-900 dark:text-gray-100" />
                  <span>dni przed</span>
                </div>
              )}
            </div>

            {/* Cykliczność (seria) */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 px-4 py-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={isSeries} onChange={e => setIsSeries(e.target.checked)} className="rounded accent-emerald-500" />
                Powtarzaj cyklicznie (seria)
              </label>
              {isSeries && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  co <input type="number" min="1" max="60" value={seriesInterval} onChange={e => setSeriesInterval(e.target.value)} className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-gray-900 dark:text-gray-100" /> dni
                </div>
              )}
            </div>
            {isSeries && <p className="text-xs text-gray-400 -mt-2">Seria automatycznie wygeneruje kolejne zaproszenia dla wybranej publiczności (pierwsze wystąpienie w dniu wydarzenia).</p>}

            {/* Odbiorcy */}
            <CustomSelect label="Odbiorcy" value={audience} onChange={setAudience} options={AUDIENCE} />
            {audience === 'home_group' && (
              <CustomSelect label="Grupa domowa" value={homeGroupId} onChange={setHomeGroupId}
                options={[{ value: '', label: '— wybierz —' }, ...homeGroups.map(g => ({ value: g.id, label: g.name }))]} />
            )}
            {audience === 'status' && (
              <CustomSelect label="Status" value={statusVal} onChange={setStatusVal} options={STATUSES} />
            )}
            {audience === 'manual' && (
              <div>
                <div className="relative mb-2">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj osoby..." className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
                  {manualFiltered.slice(0, 100).map(m => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <input type="checkbox" checked={manualIds.includes(m.id)} onChange={() => toggleManual(m.id)} className="rounded accent-emerald-500" />
                      <span className="text-gray-700 dark:text-gray-200">{memberName(m)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/30 rounded-xl px-4 py-2">
              Odbiorców: <b className="text-gray-900 dark:text-white">{recipients.length}</b>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
            <button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
            <button onClick={create} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Tworzenie...' : 'Utwórz'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Szczegóły kampanii ----------------
const SESSION_TYPE = { service: 'service', home_group: 'group', kids: 'group', event: 'event', custom: 'event' };

function CampaignDetail({ campaign, invitations, onBack, onChanged }) {
  const [sending, setSending] = useState(false);
  const [creatingAtt, setCreatingAtt] = useState(false);
  const [invs, setInvs] = useState(invitations);

  useEffect(() => { setInvs(invitations); }, [invitations]);

  const ct = useMemo(() => {
    const c = { total: invs.length, yes: 0, no: 0, maybe: 0, pending: 0, guests: 0 };
    invs.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; if (i.status === 'yes') c.guests += (i.guests_count || 0); });
    return c;
  }, [invs]);

  const send = async () => {
    if (!confirm(`Wysłać zaproszenia do ${ct.total} osób kanałami: ${(campaign.channels || []).join(', ')}?`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('rsvp-send', { body: { campaign_id: campaign.id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const s = data.stats || {};
      alert(`Wysłano. E-mail: ${s.email || 0}, SMS: ${s.sms || 0}, Push: ${s.push || 0}${s.failed ? `, niepowodzeń: ${s.failed}` : ''}.`);
      onChanged();
    } catch (err) {
      alert('Nie udało się wysłać: ' + (err.message || err));
    } finally { setSending(false); }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/rsvp/${token}`;
    try { navigator.clipboard.writeText(url); alert('Skopiowano link.'); } catch { window.prompt('Link:', url); }
  };

  const createAttendance = async () => {
    const yes = invs.filter(i => i.status === 'yes');
    if (!yes.length) { alert('Brak odpowiedzi „Będę" — nie ma z czego utworzyć frekwencji.'); return; }
    if (!confirm(`Utworzyć sesję frekwencji i oznaczyć ${yes.length} obecnych (odpowiedzi „Będę")?`)) return;
    setCreatingAtt(true);
    try {
      const user = await getCachedUser();
      const guests = yes.reduce((s, i) => s + (i.guests_count || 0), 0);
      const { data: session, error } = await supabase.from('attendance_sessions').insert({
        title: campaign.title,
        session_date: campaign.event_date || new Date().toISOString().slice(0, 10),
        session_type: SESSION_TYPE[campaign.event_type] || 'event',
        headcount: yes.length + guests,
        note: 'Utworzono z RSVP',
        campus_id: campaign.campus_id || null,
        created_by: user?.email || null,
      }).select().single();
      if (error) throw error;
      const records = yes.filter(i => i.member_id).map(i => ({ session_id: session.id, member_id: i.member_id, present: true }));
      if (records.length) {
        const { error: e2 } = await supabase.from('attendance_records').insert(records);
        if (e2) throw e2;
      }
      alert(`Utworzono sesję frekwencji: ${yes.length} obecnych${guests ? ` (+${guests} osób)` : ''}. Znajdziesz ją w module Frekwencja.`);
    } catch (err) {
      alert('Nie udało się utworzyć frekwencji: ' + (err.message || err) + '\n(Wymagany aktywny moduł Frekwencja.)');
    } finally { setCreatingAtt(false); }
  };

  const badge = (s) => {
    const map = { yes: ['Będę', 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'], no: ['Nie będę', 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'], maybe: ['Może', 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'], pending: ['Oczekuje', 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'] };
    const [lbl, cls] = map[s] || map.pending;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{lbl}</span>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-accent-primary"><ArrowLeft size={16} /> Wróć</button>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{campaign.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {EVENT_TYPES.find(e => e.value === campaign.event_type)?.label}
              {campaign.event_date ? ` · ${new Date(campaign.event_date).toLocaleDateString('pl-PL')}` : ''}
              {campaign.event_time ? ` · ${campaign.event_time}` : ''}
              {campaign.location ? ` · ${campaign.location}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={createAttendance} disabled={creatingAtt} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium flex items-center gap-2 text-sm disabled:opacity-60">
              <ClipboardCheck size={16} /> {creatingAtt ? 'Tworzenie...' : 'Utwórz frekwencję'}
            </button>
            <button onClick={send} disabled={sending} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60">
              <Send size={16} /> {sending ? 'Wysyłanie...' : campaign.status === 'sent' ? 'Wyślij ponownie' : 'Wyślij zaproszenia'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-5">
          {[['Będę', ct.yes, 'text-emerald-600'], ['Może', ct.maybe, 'text-amber-600'], ['Nie będę', ct.no, 'text-red-500'], ['Oczekuje', ct.pending, 'text-gray-500'], ['+ osób', ct.guests, 'text-accent-primary']].map(([lbl, val, cls]) => (
            <div key={lbl} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3 text-center">
              <div className={`text-xl font-bold ${cls} dark:opacity-90`}>{val}</div>
              <div className="text-xs text-gray-400">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 font-semibold">Osoba</th>
                <th className="px-4 py-3 font-semibold">Kontakt</th>
                <th className="px-4 py-3 font-semibold">Odpowiedź</th>
                <th className="px-4 py-3 font-semibold text-right">Link</th>
              </tr>
            </thead>
            <tbody>
              {invs.map(i => (
                <tr key={i.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{i.name}{i.status === 'yes' && i.guests_count > 0 ? <span className="text-xs text-gray-400"> +{i.guests_count}</span> : ''}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{i.email || i.phone || '—'}</td>
                  <td className="px-4 py-2.5">{badge(i.status)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => copyLink(i.token)} className="p-1.5 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Copy size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
