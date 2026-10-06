import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
import { Podcast, List, PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import SermonsTab from './tabs/SermonsTab';
import PlayerTab from './tabs/PlayerTab';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

const TABS = [
  { id: 'list', label: 'Kazania', icon: List },
  { id: 'player', label: 'Podgląd / Odtwarzacz', icon: PlayCircle },
];

// embedded=true → renderowany jako zakładka w innym module (np. Nauczanie): bez nagłówka i wrappera.
// createPreset = { series, nonce } → od razu otwórz „Nowe kazanie” z wybraną serią („Dodaj kazanie do serii”).
// onChanged → powiadom rodzica (np. Nauczanie przelicza liczbę kazań w seriach).
export default function SermonsModule({ embedded = false, createPreset = null, onChanged = null }) {
  const [activeTab, setActiveTab] = useState('list');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [sermons, setSermons] = useState([]);
  const [teachingSeries, setTeachingSeries] = useState([]);
  const [speakers, setSpeakers] = useState([]);
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
      toast.error(err, { fallback: tr('Nie udało się wczytać kazań. Odśwież stronę.') });
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

  // Mówcy z zakładki „Mówcy” — podpowiedzi w polu „Mówca” (wpis dowolny dalej możliwy).
  const loadSpeakers = useCallback(async () => {
    try {
      const { data } = await supabase.from('teaching_speakers').select('id, name').order('name');
      setSpeakers(data || []);
    } catch { setSpeakers([]); }
  }, []);

  useEffect(() => { loadSermons(); }, [loadSermons, selectedCampusId]);
  useEffect(() => { loadSeries(); loadSpeakers(); }, [loadSeries, loadSpeakers]);
  // „Dodaj kazanie do serii” — przełącz na listę, formularz otworzy SermonsTab.
  useEffect(() => { if (createPreset?.nonce) setActiveTab('list'); }, [createPreset?.nonce]);

  const refresh = useCallback(async () => { await loadSermons(); onChanged?.(); }, [loadSermons, onChanged]);
  const shared = { sermons, loading, campusIdForInsert, withCampusFilter, refresh, teachingSeries, speakers, createPreset };

  return (
    <div className="space-y-6">
      {/* Nagłówek (pomijany przy osadzeniu) */}
      {!embedded && (
        <PageHeader moduleKey="sermons" icon={Podcast} title={tr('Kazania')} subtitle={tr('Publiczne archiwum kazań — audio, wideo i odnośniki biblijne')} />
      )}

      {/* Zakładki */}
      <ResponsiveTabs moduleKey="sermons" tabs={TABS.map((t) => ({ ...t, label: tr(t.label) }))} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'list' && <SermonsTab {...shared} />}
        {activeTab === 'player' && <PlayerTab {...shared} />}
      </div>
    </div>
  );
}
