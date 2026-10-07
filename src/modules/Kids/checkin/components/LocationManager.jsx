import React, { useState, useEffect, useCallback, useRef } from 'react';
import EmptyState from '../../../../components/EmptyState';
import Spinner from '../../../../components/Spinner';
import Button from '../../../../components/Button';
import { supabase } from '../../../../lib/supabase';
import { Plus, Pencil, Trash2, DoorOpen } from 'lucide-react';
import { tr } from '../../../../i18n';
import { toast } from '../../../../lib/toast';
import { confirmDialog } from '../../../../lib/dialog';
import { formatAgeRange } from '../utils/ageCalculator';

const emptyForm = (sortOrder = 0) => ({
  name: '',
  room_number: '',
  min_age: '',
  max_age: '',
  capacity: '',
  sort_order: sortOrder,
});

export default function LocationManager({ onLocationsChange }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [nameError, setNameError] = useState('');

  // Callback rodzica przez ref — inline funkcja nie może restartować pobierania sal.
  const onChangeRef = useRef(onLocationsChange);
  onChangeRef.current = onLocationsChange;
  const publish = useCallback((list) => {
    setLocations(list);
    onChangeRef.current?.(list);
  }, []);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checkin_locations')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      publish(data || []);
    } catch (err) {
      console.error('Error fetching locations:', err);
      toast.error(tr('Nie udało się wczytać sal.'));
    } finally {
      setLoading(false);
    }
  }, [publish]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const resetForm = () => {
    setFormData(emptyForm(locations.length));
    setEditingId(null);
    setNameError('');
    setShowForm(false);
  };

  const handleEdit = (location) => {
    setFormData({
      name: location.name,
      room_number: location.room_number || '',
      min_age: location.min_age?.toString() || '',
      max_age: location.max_age?.toString() || '',
      capacity: location.capacity?.toString() || '',
      sort_order: location.sort_order || 0,
    });
    setEditingId(location.id);
    setNameError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setNameError(tr('Podaj nazwę sali'));
      return;
    }
    const payload = {
      name: formData.name.trim(),
      room_number: formData.room_number || null,
      min_age: formData.min_age !== '' ? parseInt(formData.min_age, 10) : null,
      max_age: formData.max_age !== '' ? parseInt(formData.max_age, 10) : null,
      capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
      sort_order: formData.sort_order || 0,
      is_active: true,
    };

    setSaving(true);
    try {
      if (editingId) {
        const { data, error } = await supabase
          .from('checkin_locations').update(payload).eq('id', editingId).select().single();
        if (error) throw error;
        publish(locations.map((l) => (l.id === data.id ? data : l)));
        toast.success(tr('Zapisano salę'));
      } else {
        const { data, error } = await supabase
          .from('checkin_locations').insert(payload).select().single();
        if (error) throw error;
        publish([...locations, data]);
        toast.success(tr('Dodano salę'));
      }
      resetForm();
    } catch (err) {
      console.error('Error saving location:', err);
      toast.error(tr('Nie udało się zapisać sali. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (location) => {
    setBusyId(location.id);
    try {
      const { data, error } = await supabase
        .from('checkin_locations')
        .update({ is_active: !location.is_active })
        .eq('id', location.id)
        .select()
        .single();
      if (error) throw error;
      publish(locations.map((l) => (l.id === data.id ? data : l)));
    } catch (err) {
      console.error('Error toggling location:', err);
      toast.error(tr('Nie udało się zmienić statusu sali.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (location) => {
    const ok = await confirmDialog({
      title: tr('Usunąć salę „{name}”?', { name: location.name }),
      message: tr('Sala zniknie z meldowania. Jeśli były w niej meldowania, lepiej ją wyłączyć. Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń salę'),
      danger: true,
    });
    if (!ok) return;

    setBusyId(location.id);
    try {
      const { error } = await supabase.from('checkin_locations').delete().eq('id', location.id);
      if (error) throw error;
      publish(locations.filter((l) => l.id !== location.id));
      toast.success(tr('Sala usunięta'));
    } catch (err) {
      console.error('Error deleting location:', err);
      toast.error(tr('Nie można usunąć sali — możliwe, że ma meldowania. Zamiast tego ją wyłącz.'));
    } finally {
      setBusyId(null);
    }
  };

  const inputClasses = 'w-full px-4 py-3 text-base border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-accent-primary focus:outline-none transition';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div>
      <div className="flex justify-between items-center mb-5 gap-3 flex-wrap">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{tr('Sale')}</h3>
        <Button icon={Plus} onClick={() => { resetForm(); setShowForm(true); }}>
          {tr('Dodaj salę')}
        </Button>
      </div>

      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-2xl mb-5 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="loc-name" className={labelClass}>{tr('Nazwa sali')} *</label>
              <input
                id="loc-name"
                type="text"
                value={formData.name}
                onChange={(e) => { setFormData((prev) => ({ ...prev, name: e.target.value })); setNameError(''); }}
                placeholder={tr('np. Przedszkolaki')}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'loc-name-error' : undefined}
                className={`${inputClasses} ${nameError ? '!border-red-500' : ''}`}
              />
              {nameError && <div id="loc-name-error" className="text-sm text-red-600 dark:text-red-400 mt-1">{nameError}</div>}
            </div>
            <div>
              <label htmlFor="loc-room" className={labelClass}>{tr('Numer pokoju')}</label>
              <input id="loc-room" type="text" value={formData.room_number} onChange={(e) => setFormData((prev) => ({ ...prev, room_number: e.target.value }))} placeholder={tr('np. {example}', { example: '101' })} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="loc-min" className={labelClass}>{tr('Wiek od (lat)')}</label>
              <input id="loc-min" type="number" value={formData.min_age} onChange={(e) => setFormData((prev) => ({ ...prev, min_age: e.target.value }))} placeholder={tr('np. {example}', { example: '3' })} min="0" max="18" className={inputClasses} />
            </div>
            <div>
              <label htmlFor="loc-max" className={labelClass}>{tr('Wiek do (lat)')}</label>
              <input id="loc-max" type="number" value={formData.max_age} onChange={(e) => setFormData((prev) => ({ ...prev, max_age: e.target.value }))} placeholder={tr('np. {example}', { example: '5' })} min="0" max="18" className={inputClasses} />
            </div>
            <div>
              <label htmlFor="loc-cap" className={labelClass}>{tr('Pojemność')}</label>
              <input id="loc-cap" type="number" value={formData.capacity} onChange={(e) => setFormData((prev) => ({ ...prev, capacity: e.target.value }))} placeholder={tr('np. {example}', { example: '15' })} min="1" className={inputClasses} />
            </div>
            <div>
              <label htmlFor="loc-order" className={labelClass}>{tr('Kolejność na liście')}</label>
              <input id="loc-order" type="number" value={formData.sort_order} onChange={(e) => setFormData((prev) => ({ ...prev, sort_order: parseInt(e.target.value, 10) || 0 }))} min="0" className={inputClasses} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="secondary" onClick={resetForm}>{tr('Anuluj')}</Button>
            <Button onClick={handleSave} loading={saving}>
              {editingId ? tr('Zapisz zmiany') : tr('Dodaj salę')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner center label={tr('Ładowanie...')} />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={tr('Nie ma jeszcze sal')}
          subtitle={tr('Sale nie są wymagane, ale pomagają przydzielać dzieci według wieku i drukować salę na naklejce.')}
          action={!showForm && <Button icon={Plus} onClick={() => { resetForm(); setShowForm(true); }}>{tr('Dodaj pierwszą salę')}</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {locations.map((location) => (
            <div
              key={location.id}
              className={`flex justify-between items-center gap-3 p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl transition ${location.is_active ? '' : 'opacity-60'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold text-gray-900 dark:text-white">{location.name}</span>
                  {location.room_number && (
                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs">
                      {tr('Pokój {n}', { n: location.room_number })}
                    </span>
                  )}
                  {!location.is_active && (
                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-xs font-semibold">
                      {tr('Wyłączona')}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {formatAgeRange(location)}
                  {location.capacity ? ` • ${tr('Pojemność: {n}', { n: location.capacity })}` : ''}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(location)}
                  aria-label={tr('Edytuj salę „{name}”', { name: location.name })}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  <Pencil size={18} />
                </button>
                <Button variant="outline" size="sm" loading={busyId === location.id} onClick={() => handleToggleActive(location)}>
                  {location.is_active ? tr('Wyłącz') : tr('Włącz')}
                </Button>
                <button
                  type="button"
                  onClick={() => handleDelete(location)}
                  disabled={busyId === location.id}
                  aria-label={tr('Usuń salę „{name}”', { name: location.name })}
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
