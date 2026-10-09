import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft, Table2, Trello, Calendar as CalIcon, GanttChartSquare, Plus, Zap, FormInput,
  BarChart3, GalleryThumbnails, Pencil, Copy, Star, Trash2, Sparkles, Gauge, FileText, Activity, MapPin,
  Download, Upload, LayoutGrid, Save, RotateCcw, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBoardData } from './hooks/useBoardData';
import { useBoardAutomations } from './hooks/useBoardAutomations';
import { useBoardCommentCounts } from './hooks/useItemUpdates';
import TableView from './views/TableView';
import KanbanView from './views/KanbanView';
import CalendarView from './views/CalendarView';
import TimelineView from './views/TimelineView';
import FormView from './views/FormView';
import ChartView from './views/ChartView';
import FilesGalleryView from './views/FilesGalleryView';
import WorkloadView from './views/WorkloadView';
import DocView from './views/DocView';
import MapView from './views/MapView';
import ViewToolbar from './components/ViewToolbar';
import ItemPanel from './components/ItemPanel';
import AutomationsPanel from './components/AutomationsPanel';
import BoardActivityPanel from './components/BoardActivityPanel';
import AiSidekick from './components/AiSidekick';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import ActionMenu from '../../components/ActionMenu';
import { ChoiceList, ChoiceRow } from '../../components/ChoiceList';
import '../../components/toolbar.css';
import { BoardCanContext } from './lib/boardContext';
import { AI_ENABLED } from '../../lib/features';
import { useCan } from '../../components/Can';
import { exportBoardCsv, buildCellsFromRecord, parseCsv } from './lib/csv';
import { confirmDialog, promptDialog } from '../../lib/dialog';
import { shortcutBlocked } from './lib/keyboard';
import { toast } from '../../lib/toast';
import { tr } from '../../i18n';

const VIEW_ICONS = { table: Table2, kanban: Trello, calendar: CalIcon, timeline: GanttChartSquare, form: FormInput, chart: BarChart3, files: GalleryThumbnails, workload: Gauge, doc: FileText, map: MapPin };
const VIEW_TYPES = [
  { type: 'table', label: 'Tabela', icon: Table2, description: 'Lista z kolumnami — domyślny widok' },
  { type: 'kanban', label: 'Kanban', icon: Trello, description: 'Karty w kolumnach według statusu' },
  { type: 'calendar', label: 'Kalendarz', icon: CalIcon, description: 'Terminy na siatce miesiąca' },
  { type: 'timeline', label: 'Oś czasu', icon: GanttChartSquare, description: 'Okresy od–do na osi' },
  { type: 'chart', label: 'Wykres', icon: BarChart3, description: 'Podsumowanie liczb i statusów' },
  { type: 'workload', label: 'Obciążenie', icon: Gauge, description: 'Ile zadań ma każda osoba' },
  { type: 'map', label: 'Mapa', icon: MapPin, description: 'Miejsca z kolumny „Lokalizacja”' },
  { type: 'doc', label: 'Dokument', icon: FileText, description: 'Notatki do tej tablicy' },
  { type: 'files', label: 'Galeria plików', icon: GalleryThumbnails, description: 'Załączniki ze wszystkich zadań' },
  { type: 'form', label: 'Formularz', icon: FormInput, description: 'Publiczny formularz dodawania' },
];

// Słownictwo: w zakładce „Zadania” modułu mówimy o zadaniach (jak w reszcie aplikacji),
// w samodzielnych Projektach — o elementach tablicy.
const TERMS = {
  task: { kind: 'task', add: 'Dodaj zadanie', column: 'Zadanie', placeholder: 'Nazwa zadania', addRow: 'Dodaj zadanie', sub: 'Podzadanie' },
  item: { kind: 'item', add: 'Nowy element', column: 'Element', placeholder: 'Nazwa elementu', addRow: 'Dodaj element', sub: 'Podelement' },
};

// Układ widoku (filtry, sortowanie, grupowanie kanbanu…) i zwinięcie grup są OSOBISTE — zapis do
// wspólnego widoku zmieniał go wszystkim, a członkom kończył się błędem 403. Trzymamy je w
// przeglądarce; kto może zarządzać widokami, zapisze układ dla wszystkich z menu ⋯.
const LOCAL_KEY = (kind, id) => `board_${kind}:${id}`;
const readLocal = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* prywatne okno */ } };

// onItemChange (opcjonalnie): rodzic trzyma otwarte zadanie w adresie (?item=) — wtedy initialItemId
// jest „sterowane”: zmiana adresu (np. przycisk Wstecz) otwiera/zamyka panel, a otwarcie/zamknięcie
// panelu zgłasza nowe id.
export default function BoardView({ boardId, userEmail, userName, onBack, embedded = false, heading = null, initialItemId = null, scopeEmails = undefined, onItemChange }) {
  const terms = embedded ? TERMS.task : TERMS.item;
  const raw = useBoardData(boardId, { userEmail, userName, scopeEmails });
  const controlled = typeof onItemChange === 'function';
  const [openItem, setOpenItemState] = useState(null);
  const onItemChangeRef = useRef(onItemChange);
  onItemChangeRef.current = onItemChange;
  const setOpenItem = useCallback((it) => {
    setOpenItemState(it || null);
    onItemChangeRef.current?.(it ? it.id : null);
  }, []);
  const searchRef = useRef(null);
  const [activeViewId, setActiveViewId] = useState(null);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showSidekick, setShowSidekick] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [search, setSearch] = useState(''); // szukanie LOKALNE (per-sesja) — nie zapisujemy do wspólnego widoku
  const [newViewOpen, setNewViewOpen] = useState(false);
  const fileRef = useRef(null);
  const comments = useBoardCommentCounts(boardId);
  const updatesCount = comments.counts;
  const openedInitial = useRef(null); // id ostatnio otwartego z linku (?item=) — kolejny link otwiera kolejne

  // RBAC — jedno miejsce prawdy dla wszystkich widoków, komórek i panelu (data.can.*).
  // Członek współpracuje na zadaniach; strukturę (kolumny, etykiety, grupy, widoki) zmienia ten,
  // kto ma do tego uprawnienie. Ukrywamy to, czego ktoś i tak nie może zrobić (zamiast błędu 403).
  // Tablica modułu (zadania Mediów, Młodzieżówki…): wystarcza prawo do zadań tej służby — lider
  // służby zmienia też strukturę, członek pracuje na zadaniach (jak serwer: moduleScope.js).
  const scope = { board: raw.board };
  const canUpdateBoard = useCan('res:boards:update', scope);
  const canManageViews = useCan('res:board_views:create', scope);
  const canUpdateViews = useCan('res:board_views:update', scope);
  const canManageAutomations = useCan('res:board_automations:create', scope);
  const createItems = useCan('res:board_items:create', scope);
  const editItems = useCan('res:board_items:update', scope);
  const deleteItems = useCan('res:board_items:delete', scope);
  const addColumns = useCan('res:board_columns:create', scope);
  const editColumns = useCan('res:board_columns:update', scope);
  const deleteColumns = useCan('res:board_columns:delete', scope);
  const addGroups = useCan('res:board_groups:create', scope);
  const editGroups = useCan('res:board_groups:update', scope);
  const deleteGroups = useCan('res:board_groups:delete', scope);
  const comment = useCan('res:board_item_updates:create', scope);
  const likeUpdates = useCan('res:board_item_updates:update', scope);
  const deleteUpdates = useCan('res:board_item_updates:delete', scope);
  // Jeden obiekt na czas życia uprawnień — wiersze tabeli (memo) nie renderują się od nowa przy każdej zmianie.
  const can = useMemo(() => ({
    createItems, editItems, deleteItems, addColumns, editColumns, deleteColumns, addGroups, editGroups, deleteGroups,
    manageViews: canManageViews, updateViews: canUpdateViews, updateBoard: canUpdateBoard, comment, likeUpdates, deleteUpdates,
  }), [createItems, editItems, deleteItems, addColumns, editColumns, deleteColumns, addGroups, editGroups, deleteGroups,
    canManageViews, canUpdateViews, canUpdateBoard, comment, likeUpdates, deleteUpdates]);

  // Zwinięcie grup — osobiste (patrz wyżej).
  const [collapsed, setCollapsed] = useState(() => readLocal(LOCAL_KEY('collapsed', boardId), {}));
  useEffect(() => { setCollapsed(readLocal(LOCAL_KEY('collapsed', boardId), {})); }, [boardId]);
  const groups = useMemo(() => raw.groups.map((g) => (g.id in collapsed ? { ...g, collapsed: collapsed[g.id] } : g)), [raw.groups, collapsed]);
  const updateGroup = useCallback((groupId, patch) => {
    const keys = Object.keys(patch || {});
    if (keys.length === 1 && keys[0] === 'collapsed') {
      setCollapsed((prev) => { const next = { ...prev, [groupId]: !!patch.collapsed }; writeLocal(LOCAL_KEY('collapsed', boardId), next); return next; });
      return Promise.resolve();
    }
    return raw.updateGroup(groupId, patch);
  }, [raw.updateGroup, boardId]);
  const data = useMemo(() => ({ ...raw, groups, updateGroup, can }), [raw, groups, updateGroup, can]);
  const automations = useBoardAutomations(boardId, data, { userEmail, userName });

  // Deep-link: otwórz wskazany element po załadowaniu (z powiadomień/@wzmianek/Mojej pracy).
  // Sterowane z adresu: brak ?item= (np. Wstecz) zamyka panel.
  useEffect(() => {
    if (!initialItemId) {
      if (controlled && openedInitial.current !== null) { openedInitial.current = null; setOpenItemState(null); }
      return;
    }
    if (openedInitial.current !== initialItemId && data.items.length) {
      const it = data.items.find(i => String(i.id) === String(initialItemId));
      if (it) { setOpenItemState(it); openedInitial.current = initialItemId; }
    }
  }, [initialItemId, data.items, controlled]);

  // Domyślny widok
  useEffect(() => {
    if (!activeViewId && data.views.length) {
      setActiveViewId((data.views.find(v => v.is_default) || data.views[0]).id);
    }
  }, [data.views, activeViewId]);

  const activeView = useMemo(() => data.views.find(v => v.id === activeViewId), [data.views, activeViewId]);
  // Osobisty układ widoku nakładany na zapisany (wspólny) config.
  const [localCfg, setLocalCfg] = useState({});
  useEffect(() => { setLocalCfg(activeViewId ? readLocal(LOCAL_KEY('view', activeViewId), {}) : {}); }, [activeViewId]);
  const savedConfig = activeView?.config || {};
  const config = useMemo(() => ({ ...savedConfig, ...localCfg }), [savedConfig, localCfg]);
  // „Moje” (chip) jest zawsze osobiste — nie liczy się jako układ do zapisania dla wszystkich.
  const hasLocalLayout = Object.keys(localCfg).some((k) => k !== 'mine');
  // Widoki filtrują po config + LOKALNYM szukaniu (search nie jest częścią zapisanego widoku).
  // `me` — dla filtra „Ja” i chipa „Moje” (osobiste, nie zapisują się w widoku).
  const viewConfig = useMemo(() => ({ ...config, search, me: userEmail || null }), [config, search, userEmail]);
  const onUpdateConfig = (patch) => {
    if (!activeView) return;
    setLocalCfg((prev) => { const next = { ...prev, ...patch }; writeLocal(LOCAL_KEY('view', activeView.id), next); return next; });
  };
  const saveLayoutForAll = async () => {
    if (!activeView) return;
    const { mine, ...shared } = localCfg;
    await data.updateView(activeView.id, { config: { ...savedConfig, ...shared } });
    const keep = mine ? { mine } : null;
    writeLocal(LOCAL_KEY('view', activeView.id), keep);
    setLocalCfg(keep || {});
    toast.success(tr('Zapisano układ widoku dla wszystkich'));
  };
  const resetLayout = () => { if (!activeView) return; writeLocal(LOCAL_KEY('view', activeView.id), null); setLocalCfg({}); };

  const addItemToFirstGroup = () => {
    const g = [...data.groups].sort((a, b) => a.display_order - b.display_order)[0];
    if (!g) return;
    // Rozwiń grupę, by nowy wiersz był widoczny (dodanie do zwiniętej grupy wyglądało jak „nic się nie dzieje").
    if (g.collapsed) data.updateGroup(g.id, { collapsed: false });
    // W tabeli: dodaj wiersz i ustaw kursor w jego nazwie (TableView reaguje na focusItemId).
    // W widokach bez nazwy w wierszu (kanban/kalendarz/oś czasu…) otwórz panel zadania.
    // Na telefonie tabela to karty (TableCards) — bez pola nazwy w wierszu, więc też panel.
    const narrowScreen = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;
    const inlineName = (activeView?.type || 'table') === 'table' && !narrowScreen;
    if (inlineName) data.addItem(g.id);
    else data.addItem(g.id).then(it => it && setOpenItem(it));
  };
  const handleExport = () => exportBoardCsv(data.board, data.columns, data.items);
  const handleImport = async (records) => {
    const g = [...data.groups].sort((a, b) => a.display_order - b.display_order)[0];
    if (!g || !records?.length) { toast.info(tr('W pliku nie ma wierszy do zaimportowania.')); return; }
    let added = 0;
    for (const rec of records) {
      const name = rec['Element'] || rec['Zadanie'] || rec[Object.keys(rec)[0]] || tr(terms.column);
      if (await data.addItem(g.id, name, buildCellsFromRecord(rec, data.columns))) added += 1;
    }
    toast.success(tr('Zaimportowano: {n}', { n: added }));
  };
  const onImportFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { const { records } = parseCsv(String(reader.result || '')); handleImport(records); };
    reader.onerror = () => toast.error(tr('Nie udało się odczytać pliku.'));
    reader.readAsText(f);
  };

  // Menu ⋯: narzędzia tablicy (rzadziej używane) — zamiast osobnego rzędu przycisków.
  const views = data.views;
  const menuItems = [
    ...(AI_ENABLED ? [{ key: 'ai', icon: Sparkles, label: tr('Asystent AI'), onClick: () => setShowSidekick(true) }] : []),
    ...(canManageAutomations ? [{ key: 'auto', icon: Zap, label: tr('Automatyzacje'), hint: automations.automations.length ? String(automations.automations.length) : undefined, onClick: () => setShowAutomations(true) }] : []),
    { key: 'activity', icon: Activity, label: tr('Aktywność'), onClick: () => setShowActivity(true) },
    { divider: true },
    { key: 'export', icon: Download, label: tr('Eksportuj CSV'), onClick: handleExport },
    ...(can.createItems ? [{ key: 'import', icon: Upload, label: tr('Importuj CSV'), onClick: () => fileRef.current?.click() }] : []),
    ...(hasLocalLayout ? [
      { divider: true },
      ...(canUpdateViews ? [{ key: 'savelayout', icon: Save, label: tr('Zapisz układ dla wszystkich'), onClick: saveLayoutForAll }] : []),
      { key: 'resetlayout', icon: RotateCcw, label: tr('Przywróć zapisany układ'), onClick: resetLayout },
    ] : []),
    ...(canManageViews ? [
      { divider: true },
      { key: 'newview', icon: LayoutGrid, label: tr('Nowy widok…'), onClick: () => setNewViewOpen(true) },
      ...(activeView ? [
        { key: 'rename', icon: Pencil, label: tr('Zmień nazwę widoku'), onClick: async () => {
          const name = await promptDialog(tr('Nazwa widoku:'), activeView.name);
          if (name && name.trim() && name.trim() !== activeView.name) data.updateView(activeView.id, { name: name.trim() });
        } },
        { key: 'dup', icon: Copy, label: tr('Duplikuj widok'), onClick: () => data.duplicateView(activeView).then((nv) => nv && setActiveViewId(nv.id)) },
        { key: 'default', icon: Star, label: tr('Ustaw jako domyślny'), disabled: !!activeView.is_default, onClick: () => data.setDefaultView(activeView.id) },
        { key: 'delview', icon: Trash2, label: tr('Usuń widok'), danger: true, disabled: views.length <= 1, onClick: async () => {
          if (!await confirmDialog(tr('Usunąć widok „{name}"?', { name: activeView.name }))) return;
          data.deleteView(activeView.id);
          setActiveViewId(views.find((x) => x.id !== activeView.id)?.id);
        } },
      ] : []),
    ] : []),
  ];

  // Skróty klawiaturowe: n — nowe zadanie (gdy wolno), / — szukaj. Nie działają podczas pisania ani
  // przy otwartym oknie/liście. Esc zamyka okna (Modal) i czyści zaznaczenie w tabeli (TableView);
  // w polu tekstowym okna Esc tylko kończy pisanie (ItemPanel).
  const shortcutRef = useRef(null);
  shortcutRef.current = {
    add: addItemToFirstGroup,
    canAdd: !!can.createItems && !!data.board && !['form', 'doc'].includes(activeView?.type || 'table'),
  };
  useEffect(() => {
    const onKey = (e) => {
      if (shortcutBlocked(e)) return;
      if (e.key === 'n' || e.key === 'N') {
        if (e.shiftKey || !shortcutRef.current?.canAdd) return;
        e.preventDefault();
        shortcutRef.current.add();
      } else if (e.key === '/') {
        const el = searchRef.current;
        if (!el) return;
        e.preventDefault();
        el.focus();
        el.select?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (data.loading) {
    return <Spinner center size={28} />;
  }
  if (!data.board) {
    // Błąd ładowania (sieć, serwer) to nie „brak tablicy” — z możliwością ponowienia.
    if (data.loadError === 'failed') {
      return (
        <EmptyState icon={AlertTriangle} title={tr('Nie udało się wczytać tablicy')} subtitle={tr('Sprawdź połączenie i spróbuj ponownie.')}
          action={<Button variant="outline" icon={RefreshCw} onClick={() => data.reload()}>{tr('Spróbuj ponownie')}</Button>} />
      );
    }
    return <EmptyState icon={Table2} title={tr('Nie znaleziono tablicy')} subtitle={tr('Mogła zostać usunięta lub nie masz do niej dostępu.')} />;
  }

  const renderView = () => {
    const type = activeView?.type || 'table';
    const shared = { data, config: viewConfig, onUpdateConfig, onOpenItem: setOpenItem, updatesCountByItem: updatesCount, terms };
    switch (type) {
      case 'kanban': return <KanbanView {...shared} />;
      case 'calendar': return <CalendarView {...shared} />;
      case 'timeline': return <TimelineView {...shared} />;
      case 'chart': return <ChartView {...shared} />;
      case 'workload': return <WorkloadView {...shared} />;
      case 'doc': return <DocView {...shared} view={activeView} />;
      case 'map': return <MapView {...shared} />;
      case 'files': return <FilesGalleryView {...shared} />;
      case 'form': return <FormView {...shared} />;
      case 'table':
      default: return <TableView {...shared} />;
    }
  };

  return (
    <BoardCanContext.Provider value={data.can}>
    <div>
      {/* Nagłówek jak w pozostałych zakładkach (Grafik, Baza pieśni): tytuł po lewej, po prawej
          przełącznik widoków, menu ⋯ (narzędzia tablicy) i główna akcja. */}
      <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
        {/* Zakładka „Zadania” → tytuł zakładki. Tablica otwarta z listy (Projekty albo zakładka
            „Tablice” modułu, która też jest osadzona) → przycisk powrotu + nazwa tablicy — wcześniej
            w osadzeniu znikał powrót do listy. */}
        {embedded && !onBack ? (
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{heading || tr('Zadania')}</h2>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onBack && (
              <button type="button" onClick={onBack} aria-label={tr('Wróć')} className="p-1.5 -ml-1.5 shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowLeft size={20} /></button>
            )}
            <input value={data.board.name} readOnly={!canUpdateBoard} aria-label={tr('Nazwa tablicy')}
              onChange={(e) => data.setBoard({ ...data.board, name: e.target.value })}
              onBlur={async (e) => {
                if (!canUpdateBoard) return;
                const { error } = await supabase.from('boards').update({ name: e.target.value }).eq('id', boardId);
                if (error) toast.error(error, { fallback: tr('Nie udało się zmienić nazwy tablicy.') });
              }}
              className={`text-2xl font-bold bg-transparent outline-none text-gray-900 dark:text-white w-full min-w-0 truncate ${canUpdateBoard ? 'rounded-lg px-1 -mx-1 focus:ring-2 focus:ring-accent-primary/30' : 'cursor-default'}`} />
          </div>
        )}
        {/* min-w-0 + max-w-full: na telefonie przełącznik widoków przewija się w swoim pasku,
            zamiast wypychać „Dodaj zadanie” poza ekran. */}
        <div className="flex items-center gap-2 flex-wrap justify-end min-w-0 max-w-full">
          {data.views.length > 1 && (
            <div className="seg-bar max-w-full overflow-x-auto" role="group" aria-label={tr('Widok')}>
              {data.views.map((v) => {
                const Icon = VIEW_ICONS[v.type] || Table2;
                return (
                  <button key={v.id} type="button" className="seg-btn whitespace-nowrap" aria-pressed={activeViewId === v.id}
                    onClick={() => setActiveViewId(v.id)} title={v.is_default ? tr('Widok domyślny') : undefined}>
                    <Icon size={15} aria-hidden="true" />{v.name}
                  </button>
                );
              })}
            </div>
          )}
          <ActionMenu variant="tool" label={tr('Więcej działań')} items={menuItems} />
          {can.createItems && !['form', 'doc'].includes(activeView?.type || 'table') && (
            <button type="button" className="tool-btn tool-btn--primary" onClick={addItemToFirstGroup} aria-keyshortcuts="n" title={tr('Skrót: N')}>
              <Plus size={15} aria-hidden="true" />{tr(terms.add)}
            </button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImportFile} className="hidden" />

      {!['form', 'doc'].includes(activeView?.type || 'table') && (
        <ViewToolbar columns={data.columns} config={config} onUpdateConfig={onUpdateConfig} search={search} onSearch={setSearch}
          people={data.people} me={userEmail || null} searchRef={searchRef} />
      )}

      {renderView()}

      {newViewOpen && (
        <Modal isOpen onClose={() => setNewViewOpen(false)} title={tr('Nowy widok')} subtitle={tr('Te same zadania, inaczej pokazane.')} icon={LayoutGrid} size="sm">
          <div className="p-3 sm:p-4">
            <ChoiceList>
              {VIEW_TYPES.map((v) => (
                <ChoiceRow key={v.type} icon={v.icon} title={tr(v.label)} description={tr(v.description)}
                  onClick={() => { setNewViewOpen(false); data.addView(v.type, tr(v.label)).then((nv) => nv && setActiveViewId(nv.id)); }} />
              ))}
            </ChoiceList>
          </div>
        </Modal>
      )}

      {openItem && (
        <ItemPanel item={openItem} data={data} terms={terms} onClose={() => setOpenItem(null)} userEmail={userEmail} userName={userName}
          onUpdatesSync={comments.syncItem} />
      )}

      {showAutomations && (
        <AutomationsPanel automations={automations.automations} columns={data.columns} people={data.people} groups={data.groups}
          onAdd={automations.addAutomation} onUpdate={automations.updateAutomation} onDelete={automations.deleteAutomation}
          onClose={() => setShowAutomations(false)} />
      )}

      {AI_ENABLED && showSidekick && <AiSidekick data={data} onClose={() => setShowSidekick(false)} />}

      {showActivity && (
        <BoardActivityPanel boardId={boardId} items={data.items} people={data.people} onClose={() => setShowActivity(false)}
          onOpenItem={(it) => { setShowActivity(false); if (it) setOpenItem(it); }} />
      )}
    </div>
    </BoardCanContext.Provider>
  );
}
