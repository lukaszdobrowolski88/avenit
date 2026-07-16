import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Plus, Edit3, Trash2, X, MapPin, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

export default function CampusManager({ onMessage }) {
  const t = useT();
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ id: null, name: '', address: '', city: '', timezone: 'Europe/Warsaw', is_active: true });

  const fetchCampuses = async () => {
    const { data, error } = await supabase
      .from('campuses')
      .select('*')
      .order('sort_order');
    if (!error) setCampuses(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCampuses(); }, []);

  const openNew = () => {
    setForm({ id: null, name: '', address: '', city: '', timezone: 'Europe/Warsaw', is_active: true });
    setShowModal(true);
  };

  const openEdit = (campus) => {
    setForm({ ...campus });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      onMessage?.({ type: 'error', text: 'Nazwa lokalizacji jest wymagana.' });
      return;
    }

    if (form.id) {
      const { error } = await supabase
        .from('campuses')
        .update({ name: form.name, address: form.address, city: form.city, timezone: form.timezone, is_active: form.is_active })
        .eq('id', form.id);
      if (error) {
        onMessage?.({ type: 'error', text: tr('Błąd zapisu: ') + error.message });
        return;
      }
    } else {
      const maxSort = campuses.length > 0 ? Math.max(...campuses.map(c => c.sort_order || 0)) + 1 : 0;
      const { error } = await supabase
        .from('campuses')
        .insert({ name: form.name, address: form.address, city: form.city, timezone: form.timezone, is_active: form.is_active, sort_order: maxSort });
      if (error) {
        onMessage?.({ type: 'error', text: tr('Błąd zapisu: ') + error.message });
        return;
      }
    }

    onMessage?.({ type: 'success', text: form.id ? 'Lokalizacja zaktualizowana.' : 'Lokalizacja dodana.' });
    setShowModal(false);
    fetchCampuses();
  };

  const deleteCampus = async (campus) => {
    if (!window.confirm(`Usunąć lokalizację "${campus.name}"? Powiązane rekordy stracą przypisanie do lokalizacji.`)) return;
    const { error } = await supabase.from('campuses').delete().eq('id', campus.id);
    if (error) {
      onMessage?.({ type: 'error', text: tr('Błąd usuwania: ') + error.message });
      return;
    }
    onMessage?.({ type: 'success', text: tr('Lokalizacja usunięta.') });
    fetchCampuses();
  };

  const toggleActive = async (campus) => {
    await supabase.from('campuses').update({ is_active: !campus.is_active }).eq('id', campus.id);
    fetchCampuses();
  };

  const moveUp = async (index) => {
    if (index === 0) return;
    const updated = [...campuses];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    await Promise.all(updated.map((c, i) => supabase.from('campuses').update({ sort_order: i }).eq('id', c.id)));
    fetchCampuses();
  };

  const moveDown = async (index) => {
    if (index >= campuses.length - 1) return;
    const updated = [...campuses];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    await Promise.all(updated.map((c, i) => supabase.from('campuses').update({ sort_order: i }).eq('id', c.id)));
    fetchCampuses();
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">{t('Ładowanie...')}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Lokalizacje / Kampusy</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('Zarządzaj lokalizacjami kościoła. Dane mogą być filtrowane po kampusie.')}</p>
        </div>
        <button onClick={openNew} className="bg-accent-primary text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:shadow-lg transition">
          <Plus size={18} /> Dodaj lokalizację
        </button>
      </div>

      {campuses.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <MapPin size={48} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Brak lokalizacji</p>
          <p className="text-sm mt-1">{t('Dodaj pierwszą lokalizację, aby włączyć tryb multi-campus.')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campuses.map((campus, index) => (
            <div key={campus.id} className={`flex items-center gap-3 p-4 rounded-xl border transition ${campus.is_active ? 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-60'}`}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveUp(index)} disabled={index === 0} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 p-0.5"><GripVertical size={14} /></button>
                <button onClick={() => moveDown(index)} disabled={index >= campuses.length - 1} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 p-0.5 rotate-180"><GripVertical size={14} /></button>
              </div>

              <MapPin size={18} className="text-accent-primary shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-800 dark:text-white">{campus.name}</div>
                {(campus.address || campus.city) && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {[campus.address, campus.city].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(campus)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition" title={campus.is_active ? 'Dezaktywuj' : 'Aktywuj'}>
                  {campus.is_active ? <ToggleRight size={20} className="text-green-500" /> : <ToggleLeft size={20} className="text-gray-400" />}
                </button>
                <button onClick={() => openEdit(campus)} className="text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-gray-600 p-2 rounded-lg transition">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => deleteCampus(campus)} className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-600 p-2 rounded-lg transition">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{form.id ? 'Edytuj lokalizację' : 'Nowa lokalizacja'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"><X /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Nazwa *')}</label>
                <input className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder="np. Kampus Centrum" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Adres')}</label>
                <input className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder={t('ul. Przykładowa 1')} value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">Miasto</label>
                <input className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder="Warszawa" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">Strefa czasowa</label>
                <select className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" value={form.timezone || 'Europe/Warsaw'} onChange={e => setForm({ ...form, timezone: e.target.value })}>
                  <option value="Europe/Warsaw">Europe/Warsaw</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                </select>
              </div>
              <button onClick={save} className="w-full py-3 bg-accent-primary text-white rounded-xl font-bold mt-2 hover:shadow-lg transition">
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
