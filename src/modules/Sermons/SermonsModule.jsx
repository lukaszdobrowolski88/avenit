import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
import { Podcast, List, PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import SermonsTab from './tabs/SermonsTab';
import PlayerTab from './tabs/PlayerTab';

const TABS = [
  { id: 'list', label: 'Kazania', icon: List },
  { id: 'player', label: 'Podgląd / Odtwarzacz', icon: PlayCircle },
];

// embedded=true → renderowany jako zakładka w innym module (np. Nauczanie): bez nagłówka i wrappera.
export default function SermonsModule({ embedded = false }) {
  const [activeTab, setActiveTab] = useState('list');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [sermons, setSermons] = useState([]);
  const [teachingSeries, setTeachingSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSermons = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('sermons').select('*').order('sermon_date', { ascending: false, nullsFirst: false });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setSermons(data || []);
    } catch (err) {
      console.error('Sermons load error:', err);
      setSermons([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  // Serie nauczania (do wyboru przy kazaniu). Filtr aktywnych robimy po stronie klienta,
  // żeby nie wykluczyć starych wierszy z is_active = NULL.
  const loadSeries = useCallback(async () => {
    try {
      const { data } = await supabase.from('teaching_series').select('id, name, is_active').order('name');
      setTeachingSeries(data || []);
    } catch { setTeachingSeries([]); }
  }, []);

  useEffect(() => { loadSermons(); }, [loadSermons, selectedCampusId]);
  useEffect(() => { loadSeries(); }, [loadSeries]);

  const shared = { sermons, loading, campusIdForInsert, withCampusFilter, refresh: loadSermons, teachingSeries };

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-7xl mx-auto space-y-6'}>
      {/* Nagłówek (pomijany przy osadzeniu) */}
      {!embedded && (
        <PageHeader moduleKey="sermons" icon={Podcast} title="Kazania" subtitle="Publiczne archiwum kazań — audio, wideo i odnośniki biblijne" />
      )}

      {/* Zakładki */}
      <ResponsiveTabs moduleKey="sermons" tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'list' && <SermonsTab {...shared} />}
        {activeTab === 'player' && <PlayerTab {...shared} />}
      </div>
    </div>
  );
}
