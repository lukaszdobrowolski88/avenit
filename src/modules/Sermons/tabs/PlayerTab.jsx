import React, { useMemo, useState, useEffect } from 'react';
import { PlayCircle } from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';
import SermonPlayer from '../components/SermonPlayer';
import { formatDate } from '../lib/sermonsApi';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';

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
    return <Spinner center />;
  }

  if ((sermons || []).length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <EmptyState icon={PlayCircle} title="Brak kazań do odtworzenia." subtitle={'Dodaj kazanie w zakładce „Kazania".'} />
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
