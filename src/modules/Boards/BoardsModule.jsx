import React, { useState, useEffect } from 'react';
import { LayoutGrid, UserCheck, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import PageHeader from '../../components/PageHeader';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import BoardsList from './BoardsList';
import BoardView from './BoardView';
import MyWork from './MyWork';
import DashboardsSection from './dashboards/DashboardsSection';

// Moduł Projekty/Tablice — powłoka przełączająca: sekcje (Tablice / Moja praca)
// ↔ pojedyncza tablica. Używany jako moduł /projekty oraz zakładka board (moduleKey).
export default function BoardsModule({ moduleKey = null, initialBoardId = null }) {
  const [user, setUser] = useState({ email: '', name: '' });
  const [boardId, setBoardId] = useState(initialBoardId);
  const [initialItemId, setInitialItemId] = useState(null);
  const [section, setSection] = useState('boards'); // boards | mywork | dashboards
  const openBoard = (bId, itemId = null) => { setInitialItemId(itemId || null); setBoardId(bId); };

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      let name = u.email;
      const { data } = await supabase.from('app_users').select('full_name, name').eq('email', u.email).maybeSingle();
      if (data) name = data.full_name || data.name || u.email;
      setUser({ email: u.email, name });
    })();
  }, []);

  useEffect(() => {
    if (moduleKey) return;
    const params = new URLSearchParams(window.location.search);
    const b = params.get('board');
    if (b) openBoard(b, params.get('item'));
  }, [moduleKey]);

  if (boardId) {
    return (
      <BoardView boardId={boardId} userEmail={user.email} userName={user.name} initialItemId={initialItemId}
        onBack={() => { setBoardId(null); setInitialItemId(null); }} embedded={!!moduleKey} />
    );
  }

  // Osadzona zakładka modułu — tylko lista tablic danego modułu
  if (moduleKey) {
    return <BoardsList userEmail={user.email} userName={user.name} moduleKey={moduleKey} onOpenBoard={openBoard} />;
  }

  // Moduł najwyższego poziomu — przełącznik sekcji (kanon: PageHeader + ResponsiveTabs)
  const SECTIONS = [
    { id: 'boards', label: tr('Tablice'), icon: LayoutGrid },
    { id: 'mywork', label: tr('Moja praca'), icon: UserCheck },
    { id: 'dashboards', label: tr('Dashboardy'), icon: BarChart3 },
  ];
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader icon={LayoutGrid} title={tr('Projekty')} subtitle={tr('Tablice, zadania i procesy zespołów')} />
      <ResponsiveTabs tabs={SECTIONS} activeTab={section} onChange={setSection} />
      <div>
        {section === 'boards' && <BoardsList userEmail={user.email} userName={user.name} onOpenBoard={openBoard} />}
        {section === 'mywork' && <MyWork userEmail={user.email} userName={user.name} onOpenBoard={openBoard} />}
        {section === 'dashboards' && <DashboardsSection userEmail={user.email} />}
      </div>
    </div>
  );
}
