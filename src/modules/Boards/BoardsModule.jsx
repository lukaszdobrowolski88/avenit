import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
//
// /projekty trzyma otwartą tablicę i zadanie w adresie (?board=…&item=…): link z powiadomienia,
// „Kopiuj link” i odświeżenie strony otwierają to samo, a przycisk Wstecz zamyka zadanie / tablicę.
// Zakładka modułu (moduleKey) — stan lokalny (adres należy do strony modułu).
export default function BoardsModule({ moduleKey = null, initialBoardId = null }) {
  const [user, setUser] = useState({ email: '', name: '' });
  const urlMode = !moduleKey;
  const [params, setParams] = useSearchParams();
  const [localBoardId, setLocalBoardId] = useState(initialBoardId);
  const [localItemId, setLocalItemId] = useState(null);
  const [section, setSection] = useState('boards'); // boards | mywork | dashboards

  const boardId = urlMode ? (params.get('board') || null) : localBoardId;
  const itemId = urlMode ? (params.get('item') || null) : localItemId;

  // Zmiana parametrów adresu z zachowaniem pozostałych.
  const patchParams = useCallback((patch, opts) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k); else next.set(k, String(v));
      }
      return next;
    }, opts);
  }, [setParams]);

  // initialBoardId w trybie adresu — tylko gdy adres nie wskazuje tablicy.
  useEffect(() => {
    if (urlMode && initialBoardId && !params.get('board')) patchParams({ board: initialBoardId }, { replace: true });
  }, [urlMode, initialBoardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBoard = useCallback((bId, iId = null) => {
    if (urlMode) patchParams({ board: bId, item: iId || null });
    else { setLocalItemId(iId || null); setLocalBoardId(bId); }
  }, [urlMode, patchParams]);

  const closeBoard = useCallback(() => {
    if (urlMode) patchParams({ board: null, item: null });
    else { setLocalBoardId(null); setLocalItemId(null); }
  }, [urlMode, patchParams]);

  // Otwarcie/zamknięcie zadania w tablicy → ?item= (nowy wpis historii — Wstecz zamyka zadanie).
  const onItemChange = useCallback((id) => {
    if (urlMode) {
      if ((params.get('item') || null) === (id == null ? null : String(id))) return;
      patchParams({ item: id });
    } else setLocalItemId(id || null);
  }, [urlMode, params, patchParams]);

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

  if (boardId) {
    return (
      <BoardView boardId={boardId} userEmail={user.email} userName={user.name} initialItemId={itemId} onItemChange={onItemChange}
        onBack={closeBoard} embedded={!!moduleKey} />
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
    <div className="space-y-6">
      <PageHeader moduleKey="boards" icon={LayoutGrid} title={tr('Projekty')} subtitle={tr('Tablice, zadania i procesy zespołów')} />
      <ResponsiveTabs moduleKey="boards" tabs={SECTIONS} activeTab={section} onChange={setSection} />
      <div>
        {section === 'boards' && <BoardsList userEmail={user.email} userName={user.name} onOpenBoard={openBoard} />}
        {section === 'mywork' && <MyWork userEmail={user.email} userName={user.name} onOpenBoard={openBoard} />}
        {section === 'dashboards' && <DashboardsSection userEmail={user.email} />}
      </div>
    </div>
  );
}
