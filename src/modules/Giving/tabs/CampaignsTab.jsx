import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Target, Heart } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { formatMoney, formatDate, memberName } from '../lib/givingApi';

const emptyForm = { name: '', description: '', goal_amount: '', fund_id: '', start_date: '', end_date: '', is_active: true };
const emptyPledge = { member_id: '', donor_name: '', pledge_amount: '', note: '' };

export default function CampaignsTab({ funds, members, membersById, campusIdForInsert, withCampusFilter }) {
  const [campaigns, setCampaigns] = useState([]);
  const [raisedByCampaign, setRaisedByCampaign] = useState({});
  const [pledgedByCampaign, setPledgedByCampaign] = useState({});
  const [pledges, setPledges] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [pledgeModal, setPledgeModal] = useState(null); // campaign obj
  const [pledgeForm, setPledgeForm] = useState(emptyPledge);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('giving_campaigns').select('*').order('created_at', { ascending: false });
      q = withCampusFilter(q);
      const { data: camps } = await q;
      setCampaigns(camps || []);

      // Zebrane (z darowizn)
      const { data: dons } = await supabase.from('donations').select('campaign_id, amount').not('campaign_id', 'is', null);
      const raised = {};
      (dons || []).forEach(d => { if (d.campaign_id) raised[d.campaign_id] = (raised[d.campaign_id] || 0) + (Number(d.amount) || 0); });
      setRaisedByCampaign(raised);

      // Deklaracje (pledge)
      const { data: pl } = await supabase.from('giving_pledges').select('*').order('created_at', { ascending: false });
      setPledges(pl || []);
      const pledged = {};
      (pl || []).forEach(p => { pledged[p.campaign_id] = (pledged[p.campaign_id] || 0) + (Number(p.pledge_amount) || 0); });
      setPledgedByCampaign(pledged);
    } catch (err) {
      console.error('Load campaigns error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const fundOptions = useMemo(() => [
    { value: '', label: '— bez funduszu —' },
    ...(funds || []).map(f => ({ value: f.id, label: f.name })),
  ], [funds]);
  const memberOptions = useMemo(() => [
    { value: '', label: '— osoba spoza bazy —' },
    ...(members || []).map(m => ({ value: m.id, label: memberName(m) })),
  ], [members]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name || '', description: c.description || '', goal_amount: String(c.goal_amount ?? ''), fund_id: c.fund_id || '', start_date: c.start_date || '', end_date: c.end_date || '', is_active: c.is_active !== false });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { alert('Podaj nazwę kampanii.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), description: form.description || null, goal_amount: Number(form.goal_amount) || 0,
        fund_id: form.fund_id || null, start_date: form.start_date || null, end_date: form.end_date || null, is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from('giving_campaigns').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        const { error } = await supabase.from('giving_campaigns').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert('Nie udało się zapisać kampanii: ' + (err.message || err));
    } finally { setSaving(false); }
  };

  const remove = async (c) => {
    if (!confirm(`Usunąć kampanię „${c.name}"? Deklaracje zostaną usunięte.`)) return;
    try {
      const { error } = await supabase.from('giving_campaigns').delete().eq('id', c.id);
      if (error) throw error;
      load();
    } catch (err) { alert('Nie udało się usunąć: ' + (err.message || err)); }
  };

  const openPledge = (c) => { setPledgeModal(c); setPledgeForm(emptyPledge); };
  const savePledge = async () => {
    if (!pledgeForm.pledge_amount || Number(pledgeForm.pledge_amount) <= 0) { alert('Podaj kwotę deklaracji.'); return; }
    try {
      const { error } = await supabase.from('giving_pledges').insert({
        campaign_id: pledgeModal.id, member_id: pledgeForm.member_id || null,
        donor_name: pledgeForm.donor_name || null, pledge_amount: Number(pledgeForm.pledge_amount),
        note: pledgeForm.note || null, campus_id: campusIdForInsert,
      });
      if (error) throw error;
      setPledgeModal(null);
      load();
    } catch (err) { alert('Nie udało się zapisać deklaracji: ' + (err.message || err)); }
  };
  const removePledge = async (p) => {
    if (!confirm('Usunąć deklarację?')) return;
    try { await supabase.from('giving_pledges').delete().eq('id', p.id); load(); }
    catch (err) { alert('Błąd: ' + (err.message || err)); }
  };

  const pledgeName = (p) => p.member_id && membersById?.[p.member_id] ? memberName(membersById[p.member_id]) : (p.donor_name || '—');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Zbiórki z celem kwotowym i deklaracjami wsparcia.</p>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md"><Plus size={16} /> Nowa kampania</button>
      </div>

      {loading ? <div className="p-10 text-center text-gray-400">Ładowanie...</div>
      : campaigns.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <Target size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak kampanii. Utwórz pierwszą zbiórkę.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map(c => {
            const raised = raisedByCampaign[c.id] || 0;
            const pledged = pledgedByCampaign[c.id] || 0;
            const goal = Number(c.goal_amount) || 0;
            const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
            const campaignPledges = pledges.filter(p => p.campaign_id === c.id);
            return (
              <div key={c.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{c.name}</h3>
                      {c.is_active === false && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">zakończona</span>}
                    </div>
                    {c.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{c.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(c)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                    <button onClick={() => remove(c)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(raised)}</span>
                    <span className="text-gray-400">z {formatMoney(goal)} ({pct}%)</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>Zadeklarowano: {formatMoney(pledged)}</span>
                    {(c.start_date || c.end_date) && <span>{formatDate(c.start_date)} – {formatDate(c.end_date)}</span>}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-gray-400">Deklaracje ({campaignPledges.length})</span>
                    <button onClick={() => openPledge(c)} className="text-xs text-accent-primary dark:text-accent-primary-light font-medium flex items-center gap-1 hover:underline"><Heart size={13} /> Dodaj</button>
                  </div>
                  {campaignPledges.length === 0 ? (
                    <p className="text-xs text-gray-400">Brak deklaracji.</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {campaignPledges.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-sm group">
                          <span className="text-gray-600 dark:text-gray-300 truncate">{pledgeName(p)}</span>
                          <span className="flex items-center gap-2">
                            <b className="text-gray-900 dark:text-white">{formatMoney(p.pledge_amount)}</b>
                            <button onClick={() => removePledge(p)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X size={13} /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal kampanii */}
      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj kampanię' : 'Nowa kampania'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwa</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Opis</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Cel (PLN)</label>
                  <input type="number" step="0.01" min="0" value={form.goal_amount} onChange={e => setForm(f => ({ ...f, goal_amount: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <CustomSelect label="Fundusz" value={form.fund_id} onChange={v => setForm(f => ({ ...f, fund_id: v }))} options={fundOptions} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Początek</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Koniec</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-emerald-500" /> Kampania aktywna
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal deklaracji */}
      <Modal isOpen={!!pledgeModal}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPledgeModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Deklaracja wsparcia</h3>
              <button onClick={() => setPledgeModal(null)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Kampania: <b className="text-gray-900 dark:text-white">{pledgeModal?.name}</b></p>
              <CustomSelect label="Osoba (członek)" value={pledgeForm.member_id} onChange={v => setPledgeForm(f => ({ ...f, member_id: v }))} options={memberOptions} />
              {!pledgeForm.member_id && (
                <input value={pledgeForm.donor_name} onChange={e => setPledgeForm(f => ({ ...f, donor_name: e.target.value }))} placeholder="Imię i nazwisko" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              )}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Kwota deklaracji (PLN)</label>
                <input type="number" step="0.01" min="0" value={pledgeForm.pledge_amount} onChange={e => setPledgeForm(f => ({ ...f, pledge_amount: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setPledgeModal(null)} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={savePledge} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md">Zapisz</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
