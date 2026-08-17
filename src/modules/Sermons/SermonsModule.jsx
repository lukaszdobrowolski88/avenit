import React, { useState, useEffect, useCallback } from 'react';
import ModuleTitle from '../../components/ModuleTitle';
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

  useEffect(() => { loadSermons(); }, [loadSermons, selectedCampusId]);

  const shared = { sermons, loading, campusIdForInsert, withCampusFilter, refresh: loadSermons };

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-7xl mx-auto space-y-6'}>
      {/* Nagłówek (pomijany przy osadzeniu) */}
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
            <Podcast className="text-white" size={24} />
          </div>
          <div>
            <ModuleTitle moduleKey="sermons" fallback="Kazania" className="text-2xl font-bold text-gray-900 dark:text-white" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Publiczne archiwum kazań — audio, wideo i odnośniki biblijne</p>
          </div>
        </div>
      )}

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'list' && <SermonsTab {...shared} />}
        {activeTab === 'player' && <PlayerTab {...shared} />}
      </div>
    </div>
  );
}
