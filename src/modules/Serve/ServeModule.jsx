import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
import { CalendarCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import AvailabilityTab from './tabs/AvailabilityTab';
import { tr } from '../../i18n';

export default function ServeModule() {
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [members, setMembers] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [loading, setLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      // Wolontariusze (członkowie) — do wyboru w niedostępnościach
      let membersQuery = supabase.from('members').select('id, first_name, last_name').order('last_name', { ascending: true });
      membersQuery = withCampusFilter(membersQuery);
      const { data: membersData } = await membersQuery;
      const mList = membersData || [];
      setMembers(mList);
      const mMap = {}; mList.forEach(m => { mMap[m.id] = m; });
      setMembersById(mMap);

    } catch (err) {
      console.error('Serve loadShared error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { loadShared(); }, [loadShared, selectedCampusId]);

  const shared = {
    members, membersById,
    campusIdForInsert, withCampusFilter, refreshShared: loadShared, loadingShared: loading,
  };

  return (
    <div className="space-y-6">
      {/* Raport CCLI przeniesiony do Analityki (Narzędzia) — tu tylko dostępność wolontariuszy. */}
      <PageHeader moduleKey="serve" icon={CalendarCheck} title={tr('Dostępność')} subtitle={tr('Kto z wolontariuszy nie może służyć i kiedy')} />
      <AvailabilityTab {...shared} />
    </div>
  );
}
