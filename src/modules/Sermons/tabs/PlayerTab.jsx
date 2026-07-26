import React, { useMemo, useState, useEffect } from 'react';
import { PlayCircle } from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';
import SermonPlayer from '../components/SermonPlayer';
import { formatDate } from '../lib/sermonsApi';

export default function PlayerTab({ sermons, loading }) {
  const [selectedId, setSelectedId] = useState('');

  // Domyślnie wybierz pierwsze (najnowsze) kazanie
  useEffect(() => {
    if (!selectedId && (sermons || []).length > 0) {
      setSelectedId(sermons[0].id);
    }
  }, [sermons, selectedId]);

  const options = useMemo(() => (sermons || []).map(s => ({
    value: s.id,
    label: `${s.title}${s.sermon_date ? ' — ' + formatDate(s.sermon_date) : ''}${s.is_published ? '' : ' (szkic)'}`,
  })), [sermons]);

  const selected = useMemo(() => (sermons || []).find(s => s.id === selectedId) || null, [sermons, selectedId]);

  if (loading) {
    return <div className="p-10 text-center text-gray-400">Ładowanie...</div>;
  }

  if ((sermons || []).length === 0) {
    return (
      <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <PlayCircle size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Brak kazań do odtworzenia. Dodaj kazanie w zakładce „Kazania".</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <CustomSelect label="Wybierz kazanie" value={selectedId} onChange={setSelectedId} options={options} icon={PlayCircle} />
      </div>
      {selected && <SermonPlayer sermon={selected} />}
    </div>
  );
}
