import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

export default function LocationManager({ onLocationsChange }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    room_number: '',
    min_age: '',
    max_age: '',
    capacity: '',
    sort_order: 0
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checkin_locations')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setLocations(data || []);
      if (onLocationsChange) onLocationsChange(data || []);
    } catch (err) {
      console.error('Error fetching locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      room_number: '',
      min_age: '',
      max_age: '',
      capacity: '',
      sort_order: locations.length
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (location) => {
    setFormData({
      name: location.name,
      room_number: location.room_number || '',
      min_age: location.min_age?.toString() || '',
      max_age: location.max_age?.toString() || '',
      capacity: location.capacity?.toString() || '',
      sort_order: location.sort_order || 0
    });
    setEditingId(location.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      room_number: formData.room_number || null,
      min_age: formData.min_age ? parseInt(formData.min_age) : null,
      max_age: formData.max_age ? parseInt(formData.max_age) : null,
      capacity: formData.capacity ? parseInt(formData.capacity) : null,
      sort_order: formData.sort_order || 0,
      is_active: true
    };

    try {
      if (editingId) {
        const { data, error } = await supabase
          .from('checkin_locations')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single();

        if (error) throw error;
        setLocations(prev => prev.map(l => (l.id === data.id ? data : l)));
      } else {
        const { data, error } = await supabase
          .from('checkin_locations')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setLocations(prev => [...prev, data]);
      }

      resetForm();
      fetchLocations();
    } catch (err) {
      console.error('Error saving location:', err);
      alert('Błąd podczas zapisywania sali');
    }
  };

  const handleToggleActive = async (location) => {
    try {
      const { data, error } = await supabase
        .from('checkin_locations')
        .update({ is_active: !location.is_active })
        .eq('id', location.id)
        .select()
        .single();

      if (error) throw error;

      setLocations(prev =>
        prev.map(l => (l.id === data.id ? data : l))
      );
    } catch (err) {
      console.error('Error toggling location:', err);
    }
  };

  const handleDelete = async (locationId) => {
    if (!confirm('Czy na pewno chcesz usunąć tę salę?')) return;

    try {
      const { error } = await supabase
        .from('checkin_locations')
        .delete()
        .eq('id', locationId);

      if (error) throw error;

      setLocations(prev => prev.filter(l => l.id !== locationId));
    } catch (err) {
      console.error('Error deleting location:', err);
      alert('Nie można usunąć sali - może być używana w check-inach');
    }
  };

  const inputClasses = "w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition";

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Sale / Lokalizacje</h3>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
        >
          <Plus size={18} />
          Nowa sala
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-2xl mb-5 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Nazwa sali *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="np. Przedszkolaki"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Numer pokoju
              </label>
              <input
                type="text"
                value={formData.room_number}
                onChange={(e) => setFormData(prev => ({ ...prev, room_number: e.target.value }))}
                placeholder="np. 101"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Wiek min.
              </label>
              <input
                type="number"
                value={formData.min_age}
                onChange={(e) => setFormData(prev => ({ ...prev, min_age: e.target.value }))}
                placeholder="np. 3"
                min="0"
                max="18"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Wiek max.
              </label>
              <input
                type="number"
                value={formData.max_age}
                onChange={(e) => setFormData(prev => ({ ...prev, max_age: e.target.value }))}
                placeholder="np. 5"
                min="0"
                max="18"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Pojemność
              </label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                placeholder="np. 15"
                min="1"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Kolejność
              </label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                min="0"
                className={inputClasses}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={resetForm}
              className="px-5 py-2.5 text-base font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.name}
              className={`px-5 py-2.5 text-base font-medium rounded-xl transition
                ${formData.name
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg cursor-pointer'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
            >
              {editingId ? 'Zapisz zmiany' : 'Dodaj salę'}
            </button>
          </div>
        </div>
      )}

      {/* Locations list */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-gray-500 dark:text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          Ładowanie...
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
          Brak sal. Dodaj pierwszą salę dla dzieci.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {locations.map((location) => (
            <div
              key={location.id}
              className={`flex justify-between items-center p-4 bg-white dark:bg-gray-800 border-2 rounded-2xl transition
                ${location.is_active
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-red-200 dark:border-red-800 opacity-60'
                }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold text-gray-900 dark:text-white">
                    {location.name}
                  </span>
                  {location.room_number && (
                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs">
                      Sala {location.room_number}
                    </span>
                  )}
                  {!location.is_active && (
                    <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs font-semibold">
                      Nieaktywna
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {location.min_age !== null || location.max_age !== null ? (
                    <>
                      Wiek:{' '}
                      {location.min_age !== null && location.max_age !== null
                        ? `${location.min_age}-${location.max_age} lat`
                        : location.min_age !== null
                        ? `od ${location.min_age} lat`
                        : `do ${location.max_age} lat`}
                    </>
                  ) : (
                    'Wszystkie wieki'
                  )}
                  {location.capacity && ` • Pojemność: ${location.capacity}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(location)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  <Pencil size={18} />
                </button>
                <button
                  onClick={() => handleToggleActive(location)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition
                    ${location.is_active
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
                      : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
                    }`}
                >
                  {location.is_active ? 'Wyłącz' : 'Włącz'}
                </button>
                <button
                  onClick={() => handleDelete(location.id)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
