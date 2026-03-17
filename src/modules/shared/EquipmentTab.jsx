import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  Plus, Search, Trash2, X, Edit2, Package, Camera, User,
  DollarSign, Hash, Upload, AlertTriangle
} from 'lucide-react';

const CONDITIONS = [
  { value: 'nowy', label: 'Nowy', color: 'green' },
  { value: 'dobry', label: 'Dobry', color: 'blue' },
  { value: 'uszkodzony', label: 'Uszkodzony', color: 'yellow' },
  { value: 'do_naprawy', label: 'Do naprawy', color: 'red' }
];

export default function EquipmentTab({ ministryKey, currentUserEmail, canEdit = false }) {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    photo_url: '',
    quantity: 1,
    unit_value: 0,
    responsible_person: '',
    condition: 'dobry',
    purchase_date: '',
    notes: ''
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchEquipment();
  }, [ministryKey]);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('ministry_key', ministryKey)
        .order('name');

      if (error) throw error;
      setEquipment(data || []);
    } catch (err) {
      console.error('Error fetching equipment:', err);
    }
    setLoading(false);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${ministryKey}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('equipment')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('equipment').getPublicUrl(fileName);
      setForm(prev => ({ ...prev, photo_url: data.publicUrl }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Błąd przesyłania zdjęcia: ' + err.message);
    }
    setUploading(false);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setForm({
      name: '',
      description: '',
      photo_url: '',
      quantity: 1,
      unit_value: 0,
      responsible_person: '',
      condition: 'dobry',
      purchase_date: '',
      notes: ''
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name || '',
      description: item.description || '',
      photo_url: item.photo_url || '',
      quantity: item.quantity || 1,
      unit_value: item.unit_value || 0,
      responsible_person: item.responsible_person || '',
      condition: item.condition || 'dobry',
      purchase_date: item.purchase_date || '',
      notes: item.notes || ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Podaj nazwę wyposażenia');
      return;
    }

    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        photo_url: form.photo_url || null,
        quantity: parseInt(form.quantity) || 1,
        unit_value: parseFloat(form.unit_value) || 0,
        responsible_person: form.responsible_person || null,
        condition: form.condition,
        purchase_date: form.purchase_date || null,
        notes: form.notes || null,
        ministry_key: ministryKey
      };

      if (editingItem) {
        const { error } = await supabase
          .from('equipment')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('equipment')
          .insert([{ ...payload, created_by: currentUserEmail }]);
        if (error) throw error;
      }

      setShowModal(false);
      fetchEquipment();
    } catch (err) {
      console.error('Save error:', err);
      alert('Błąd zapisywania: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć ten przedmiot?')) return;

    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchEquipment();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Błąd usuwania: ' + err.message);
    }
  };

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.responsible_person?.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = equipment.reduce((sum, item) =>
    sum + (parseFloat(item.unit_value) || 0) * (parseInt(item.quantity) || 1), 0
  );

  const getConditionStyle = (condition) => {
    const styles = {
      nowy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      dobry: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      uszkodzony: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      do_naprawy: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    };
    return styles[condition] || styles.dobry;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-4 lg:p-6 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="text-pink-500" size={24} />
            Wyposażenie
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Łącznie: {equipment.length} przedmiotów | Wartość: {totalValue.toLocaleString('pl-PL')} zł
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Szukaj..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-gray-700 dark:text-gray-200"
            />
          </div>

          {/* Add button */}
          {canEdit && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition flex items-center gap-2 whitespace-nowrap font-medium"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Dodaj</span>
            </button>
          )}
        </div>
      </div>

      {/* Equipment Grid */}
      {filteredEquipment.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Package size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Brak wyposażenia</p>
          <p className="text-sm mt-1">Dodaj pierwszy przedmiot do listy</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredEquipment.map(item => (
            <div
              key={item.id}
              className="bg-gray-50 dark:bg-gray-800 rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition group"
            >
              {/* Photo */}
              <div className="relative aspect-square mb-3 rounded-lg lg:rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700">
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package size={48} className="text-gray-400 dark:text-gray-500" />
                  </div>
                )}

                {/* Condition badge */}
                <span className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${getConditionStyle(item.condition)}`}>
                  {CONDITIONS.find(c => c.value === item.condition)?.label || 'Dobry'}
                </span>
              </div>

              {/* Info */}
              <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate">{item.name}</h3>

              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Hash size={14} />
                  <span>Ilość: {item.quantity}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <DollarSign size={14} />
                  <span>Wartość: {((item.unit_value || 0) * (item.quantity || 1)).toLocaleString('pl-PL')} zł</span>
                </div>
                {item.responsible_person && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <User size={14} />
                    <span className="truncate">{item.responsible_person}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {canEdit && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex-1 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition flex items-center justify-center gap-1"
                  >
                    <Edit2 size={14} />
                    Edytuj
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex-1 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition flex items-center justify-center gap-1"
                  >
                    <Trash2 size={14} />
                    Usuń
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />

          <div className="relative bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 lg:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between z-10">
              <h3 className="text-lg lg:text-xl font-bold text-gray-800 dark:text-gray-100">
                {editingItem ? 'Edytuj wyposażenie' : 'Dodaj wyposażenie'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-4 lg:p-6 space-y-4">
              {/* Photo upload */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Zdjęcie</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
                    {form.photo_url ? (
                      <img src={form.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={24} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                    >
                      <Upload size={16} />
                      {uploading ? 'Przesyłanie...' : 'Wybierz zdjęcie'}
                    </button>
                    {form.photo_url && (
                      <button
                        onClick={() => setForm(prev => ({ ...prev, photo_url: '' }))}
                        className="mt-2 text-xs text-red-500 hover:text-red-600 w-full text-center"
                      >
                        Usuń zdjęcie
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nazwa *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-gray-700 dark:text-gray-200"
                  placeholder="np. Mikrofon Shure SM58"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 resize-none text-gray-700 dark:text-gray-200"
                  placeholder="Dodatkowy opis..."
                />
              </div>

              {/* Quantity & Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Ilość</label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-gray-700 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Wartość (zł)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_value}
                    onChange={(e) => setForm(prev => ({ ...prev, unit_value: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-gray-700 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Responsible person */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Osoba odpowiedzialna</label>
                <input
                  type="text"
                  value={form.responsible_person}
                  onChange={(e) => setForm(prev => ({ ...prev, responsible_person: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-gray-700 dark:text-gray-200"
                  placeholder="Imię i nazwisko"
                />
              </div>

              {/* Condition */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Stan</label>
                <div className="grid grid-cols-2 gap-2">
                  {CONDITIONS.map(cond => (
                    <button
                      key={cond.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, condition: cond.value }))}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition ${
                        form.condition === cond.value
                          ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {cond.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Notatki</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 resize-none text-gray-700 dark:text-gray-200"
                  placeholder="Dodatkowe notatki..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-900 px-4 lg:px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition"
              >
                {editingItem ? 'Zapisz zmiany' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
