import React, { useState, useEffect, useCallback } from 'react';
import ModuleTitle from '../../components/ModuleTitle';
import { DoorOpen, Boxes, CalendarClock, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import ResourcesTab from './tabs/ResourcesTab';
import BookingsTab from './tabs/BookingsTab';
import ScheduleTab from './tabs/ScheduleTab';

const TABS = [
  { id: 'resources', label: 'Zasoby', icon: Boxes },
  { id: 'bookings', label: 'Rezerwacje', icon: CalendarClock, tour: 'rooms-bookings-tab' },
  { id: 'schedule', label: 'Harmonogram', icon: CalendarDays },
];

export default function RoomsModule() {
  const [activeTab, setActiveTab] = useState('resources');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('resources').select('*').order('name', { ascending: true });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setResources(data || []);
    } catch (err) {
      console.error('Rooms loadShared error:', err);
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { loadShared(); }, [loadShared, selectedCampusId]);

  const shared = { resources, loading, campusIdForInsert, withCampusFilter, refreshShared: loadShared };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <DoorOpen className="text-white" size={24} />
        </div>
        <div>
          <ModuleTitle moduleKey="rooms" fallback="Rezerwacje sal" className="text-2xl font-bold text-gray-900 dark:text-white" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Sale i zasoby, rezerwacje z wykrywaniem konfliktów i rezerwacje cykliczne</p>
        </div>
      </div>

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'resources' && <ResourcesTab {...shared} />}
        {activeTab === 'bookings' && <BookingsTab {...shared} onNavigate={setActiveTab} />}
        {activeTab === 'schedule' && <ScheduleTab {...shared} onNavigate={setActiveTab} />}
      </div>
    </div>
  );
}
