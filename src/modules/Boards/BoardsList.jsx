import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, LayoutGrid, Table2, Copy, Folder as FolderIcon, ChevronRight, ChevronDown, Lock, Globe, UserPlus,
  Pencil, Archive, ArchiveRestore, Trash2, Bookmark, Users,
} from 'lucide-react';
import { tr } from '../../i18n';
import { useCan } from '../../components/Can';
import { usePermissions } from '../../contexts/PermissionsContext';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';
import ActionMenu from '../../components/ActionMenu';
import '../../components/toolbar.css';
import './components/boardCards.css';
import { confirmDialog, promptDialog } from '../../lib/dialog';
import { toast } from '../../lib/toast';
import { useBoards } from './hooks/useBoards';
import { boardColor } from './lib/palette';
import { filterBoards, groupByFolder, isSystemTaskBoard, isBoardOwner } from './lib/boardList';
import TemplateChooser, { SaveTemplateModal, TEMPLATE_ICONS } from './components/TemplateChooser';

// Karta tablicy: cała karta to przycisk „otwórz”, menu ⋯ obok (ActionMenu — klawiatura i dotyk).
function BoardCard({ board, onOpen, menuItems, busy }) {
  const Icon = TEMPLATE_ICONS[board.icon] || Table2;
  return (
    <li className="bc-card">
      <button type="button" className="bc-open" onClick={() => onOpen(board.id)} disabled={busy}>
        <span className="bc-tile" data-tone={0} aria-hidden="true"><Icon size={18} /></span>
        <span className="bc-title">{board.name || tr('Bez nazwy')}</span>
        {board.description && <span className="bc-desc">{board.description}</span>}
        <span className="bc-meta">
          <span className="bc-dot" style={{ backgroundColor: boardColor(board.color) }} aria-hidden="true" />
          {board.visibility === 'private'
            ? <span><Lock size={12} aria-hidden="true" />{tr('Prywatna')}</span>
            : <span><Users size={12} aria-hidden="true" />{tr('Zespół')}</span>}
        </span>
      </button>
      {menuItems.length > 0 && (
        <div className="bc-menu">
          <ActionMenu variant="ghost" label={tr('Działania: {name}', { name: board.name || tr('Tablica') })} items={menuItems} />
        </div>
      )}
    </li>
  );
}

export default function BoardsList({ userEmail, moduleKey = null, onOpenBoard }) {
  const {
    boards, templates, loading, fetchBoards, fetchTemplates, createFromTemplate, createFromBoardTemplate,
    updateBoard, archiveBoard, deleteBoard, duplicateBoard, saveAsTemplate,
  } = useBoards(userEmail);
  // RBAC: członek współpracuje na elementach, ale nie tworzy/edytuje/usuwa tablic.
  // W module (zakładka „Tablice”) — także prawa lidera tej służby (moduleScope.js).
  const scope = moduleKey ? { module: moduleKey } : undefined;
  const canCreate = useCan('res:boards:create', scope);
  const canUpdate = useCan('res:boards:update', scope);
  const canDelete = useCan('res:boards:delete', scope);
  const { subject } = usePermissions();
  const isAdmin = !!subject?.isAdmin;
  const [showArchive, setShowArchive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saveTemplateOf, setSaveTemplateOf] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());

  useEffect(() => { fetchBoards(moduleKey); }, [fetchBoards, moduleKey]);

  const active = useMemo(() => filterBoards(boards, { archived: false, email: userEmail }), [boards, userEmail]);
  const archived = useMemo(() => filterBoards(boards, { archived: true, email: userEmail }), [boards, userEmail]);
  const list = showArchive ? archived : active;
  const grouped = useMemo(() => groupByFolder(list), [list]);
  const hasFolders = grouped.some((g) => g.folder);
  // Ostatnia tablica z archiwum przywrócona/usunięta — wróć do aktywnych.
  useEffect(() => { if (showArchive && !loading && archived.length === 0) setShowArchive(false); }, [showArchive, loading, archived.length]);

  const openChooser = async () => {
    setChooser(true);
    setLoadingTemplates(true);
    try { await fetchTemplates(); } finally { setLoadingTemplates(false); }
  };

  const handlePick = async ({ builtin, board }) => {
    setCreating(true);
    const res = builtin
      ? await createFromTemplate(builtin, { module_key: moduleKey, name: builtin.key === 'blank' ? tr('Nowa tablica') : undefined })
      : await createFromBoardTemplate(board.id, { module_key: moduleKey, name: board.name });
    setCreating(false);
    if (res.success) { setChooser(false); onOpenBoard(res.data.id); }
  };

  const deleteTemplate = async (t) => {
    if (await confirmDialog({ title: tr('Usunąć szablon „{name}”?', { name: t.name }), message: tr('Tablice utworzone z tego szablonu zostaną.'), confirmLabel: tr('Usuń szablon'), danger: true })) {
      await deleteBoard(t.id);
    }
  };

  const withBusy = (id, fn) => async () => {
    setBusyId(id);
    try { await fn(); } finally { setBusyId(null); }
  };

  const rename = async (b) => {
    const name = await promptDialog({ title: tr('Zmień nazwę tablicy'), defaultValue: b.name || '', confirmLabel: tr('Zapisz') });
    if (name != null && name.trim() && name.trim() !== b.name) await updateBoard(b.id, { name: name.trim() });
  };
  const moveToFolder = async (b) => {
    const name = await promptDialog({ title: tr('Przenieś do folderu'), message: tr('Nazwa folderu (puste = bez folderu):'), defaultValue: b.folder || '', placeholder: tr('np. Projekty 2026'), confirmLabel: tr('Zapisz') });
    if (name != null) await updateBoard(b.id, { folder: name.trim() || null });
  };
  const editEditors = async (b) => {
    const em = await promptDialog({ title: tr('Edytorzy'), message: tr('E-maile oddzielone przecinkiem'), defaultValue: (b.editors || []).join(', '), placeholder: 'jan@…, anna@…', confirmLabel: tr('Zapisz') });
    if (em != null) await updateBoard(b.id, { editors: em.split(',').map((s) => s.trim()).filter(Boolean) });
  };
  const archive = async (b) => {
    const res = await archiveBoard(b.id, true);
    if (res.success) {
      toast.success(tr('Przeniesiono „{name}” do archiwum.', { name: b.name }), { action: { label: tr('Cofnij'), onClick: () => archiveBoard(b.id, false) } });
    }
  };
  const restore = async (b) => {
    const res = await archiveBoard(b.id, false);
    if (res.success) toast.success(tr('Przywrócono „{name}”.', { name: b.name }));
  };
  const destroy = async (b) => {
    const ok = await confirmDialog({
      title: tr('Usunąć trwale „{name}”?', { name: b.name }),
      message: tr('Tablica, jej elementy, komentarze i historia zostaną usunięte bezpowrotnie.'),
      confirmLabel: tr('Usuń trwale'), danger: true, isDelete: true,
    });
    if (ok) await deleteBoard(b.id);
  };

  const menuFor = (b) => {
    const system = isSystemTaskBoard(b);
    if (b.is_archived) {
      return canDelete ? [
        { key: 'restore', icon: ArchiveRestore, label: tr('Przywróć'), onClick: withBusy(b.id, () => restore(b)) },
        { key: 'delete', icon: Trash2, label: tr('Usuń trwale'), danger: true, onClick: () => destroy(b) },
      ] : [];
    }
    const items = [];
    if (canUpdate) {
      items.push({ key: 'rename', icon: Pencil, label: tr('Zmień nazwę'), onClick: () => rename(b) });
      items.push({ key: 'folder', icon: FolderIcon, label: tr('Przenieś do folderu'), onClick: () => moveToFolder(b) });
      // Udostępnianie (widoczność, edytorzy) — tylko właściciel tablicy albo admin (serwer: 403).
      if (isAdmin || isBoardOwner(b, userEmail)) {
        items.push(b.visibility === 'private'
          ? { key: 'share', icon: Globe, label: tr('Udostępnij zespołowi'), onClick: () => updateBoard(b.id, { visibility: 'workspace' }) }
          : { key: 'private', icon: Lock, label: tr('Ustaw jako prywatną'), onClick: () => updateBoard(b.id, { visibility: 'private' }) });
        if (b.visibility === 'private') items.push({ key: 'editors', icon: UserPlus, label: `${tr('Edytorzy')} (${(b.editors || []).length})`, onClick: () => editEditors(b) });
      }
    }
    if (canCreate) {
      if (items.length) items.push({ divider: true });
      items.push({ key: 'dup', icon: Copy, label: tr('Duplikuj'), onClick: withBusy(b.id, () => duplicateBoard(b.id)) });
      if (!system) items.push({ key: 'tpl', icon: Bookmark, label: tr('Zapisz jako szablon'), onClick: () => setSaveTemplateOf(b) });
    }
    if (canDelete && !system) {
      if (items.length) items.push({ divider: true });
      items.push({ key: 'archive', icon: Archive, label: tr('Archiwizuj'), onClick: withBusy(b.id, () => archive(b)) });
    }
    return items;
  };

  const toggleFolder = (key) => setCollapsedFolders((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const showToolbar = canCreate || archived.length > 0 || showArchive;

  return (
    <div>
      {showToolbar && (
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          {(archived.length > 0 || showArchive) ? (
            <div className="seg-bar" role="group" aria-label={tr('Pokaż tablice')}>
              <button type="button" className="seg-btn" aria-pressed={!showArchive} onClick={() => setShowArchive(false)}>
                {tr('Aktywne')} <span className="tabular-nums opacity-70">{active.length}</span>
              </button>
              <button type="button" className="seg-btn" aria-pressed={showArchive} onClick={() => setShowArchive(true)}>
                <Archive size={14} aria-hidden="true" />{tr('Archiwum')} <span className="tabular-nums opacity-70">{archived.length}</span>
              </button>
            </div>
          ) : <span />}
          {canCreate && !showArchive && (
            <button type="button" className="tool-btn tool-btn--primary" onClick={openChooser} disabled={creating}>
              <Plus size={15} aria-hidden="true" />{tr('Nowa tablica')}
            </button>
          )}
        </div>
      )}

      {loading && !boards.length ? (
        <Spinner center />
      ) : list.length === 0 ? (
        showArchive ? (
          <EmptyState icon={Archive} title={tr('Archiwum jest puste.')} />
        ) : (
          <EmptyState
            icon={LayoutGrid}
            title={tr('Nie masz jeszcze żadnej tablicy.')}
            subtitle={canCreate ? tr('Zacznij od pustej tablicy albo od szablonu.') : tr('Poproś lidera zespołu o utworzenie tablicy.')}
            action={canCreate ? (
              <button type="button" className="tool-btn tool-btn--primary" onClick={openChooser} disabled={creating}>
                <Plus size={15} aria-hidden="true" />{tr('Utwórz pierwszą tablicę')}
              </button>
            ) : undefined}
          />
        )
      ) : (
        <div className="space-y-6">
          {showArchive && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Zarchiwizowane tablice nie pojawiają się na liście ani w „Mojej pracy”. Możesz je przywrócić albo usunąć trwale.')}</p>
          )}
          {grouped.map(({ folder, list: boardsInGroup }) => {
            const key = folder || '__none__';
            const isCollapsed = collapsedFolders.has(key);
            const listId = `boards-folder-${key.replace(/[^a-z0-9_-]/gi, '_')}`;
            return (
              <section key={key} aria-label={folder || tr('Bez folderu')}>
                {hasFolders && (
                  <button type="button" className="bc-folder" onClick={() => toggleFolder(key)} aria-expanded={!isCollapsed} aria-controls={listId}>
                    {isCollapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    <FolderIcon size={15} className="text-gray-400" aria-hidden="true" /> {folder || tr('Bez folderu')}
                    <span className="bc-count">{boardsInGroup.length}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <ul id={listId} className="bc-grid">
                    {boardsInGroup.map((b) => (
                      <BoardCard key={b.id} board={b} onOpen={onOpenBoard} menuItems={menuFor(b)} busy={busyId === b.id} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {chooser && (
        <TemplateChooser templates={templates} loadingTemplates={loadingTemplates} busy={creating}
          onPick={handlePick} onDeleteTemplate={canDelete ? deleteTemplate : undefined}
          onClose={() => { if (!creating) setChooser(false); }} />
      )}
      {saveTemplateOf && (
        <SaveTemplateModal board={saveTemplateOf} onClose={() => setSaveTemplateOf(null)}
          onSave={async ({ name, withItems }) => {
            const res = await saveAsTemplate(saveTemplateOf.id, { name, withItems });
            if (res.success) {
              setSaveTemplateOf(null);
              toast.success(tr('Zapisano szablon „{name}”. Znajdziesz go w „Nowa tablica”.', { name }));
            }
          }} />
      )}
    </div>
  );
}
