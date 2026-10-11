import React, { useState } from 'react';
import { Layers, Tag, Tags, Users, Trash2, Edit2, Check, X, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/dialog';
import EmptyState from '../../components/EmptyState';
import { humanSaveError } from './money';
import { nameTaken, renameAreaEverywhere, renameCategoryEverywhere, retagEverywhere } from './dictionaries';

const PALETTE = ['#8A6606', '#166534', '#1e40af', '#9a3412', '#0f766e', '#7c2d12', '#57534e', '#6b21a8'];
const nextColor = (n) => PALETTE[n % PALETTE.length];

// Wiersz słownika: kolor, nazwa (edycja w miejscu), opcjonalnie włącz/wyłącz, usuń.
function DictRow({ item, onRename, onColor, onToggle, onDelete, muted }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const inactive = item.is_active === false;
  const commit = async () => {
    const v = name.trim();
    if (!v || v === item.name) { setEditing(false); setName(item.name); return; }
    setBusy(true);
    const ok = await onRename(item, v);
    setBusy(false);
    if (ok) setEditing(false);
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
      {onColor ? (
        <input type="color" value={item.color || '#6b7280'} onChange={(e) => onColor(item, e.target.value)}
          className="w-6 h-6 rounded-full border-0 bg-transparent cursor-pointer p-0 shrink-0" aria-label={tr('Kolor: {name}', { name: item.name })} />
      ) : <span className="w-3 h-3 rounded-full shrink-0 bg-gray-300 dark:bg-gray-600" />}
      {editing ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setName(item.name); } }}
          aria-label={tr('Nowa nazwa')}
          className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
      ) : (
        <span className={`text-sm flex-1 min-w-0 truncate ${inactive ? 'text-gray-400 line-through' : muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>{item.name}</span>
      )}
      {editing ? (
        <>
          <button onClick={commit} disabled={busy} className="p-1.5 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" aria-label={tr('Zapisz')}><Check size={15} /></button>
          <button onClick={() => { setEditing(false); setName(item.name); }} disabled={busy} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" aria-label={tr('Anuluj')}><X size={15} /></button>
        </>
      ) : (
        <>
          {onRename && <button onClick={() => setEditing(true)} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title={tr('Zmień nazwę')} aria-label={tr('Zmień nazwę: {name}', { name: item.name })}><Edit2 size={14} /></button>}
          {onToggle && (
            <button onClick={() => onToggle(item)} className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              {inactive ? tr('Włącz') : tr('Wyłącz')}
            </button>
          )}
          {onDelete && <button onClick={() => onDelete(item)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title={tr('Usuń')} aria-label={tr('Usuń: {name}', { name: item.name })}><Trash2 size={14} /></button>}
        </>
      )}
    </div>
  );
}

// Pole dodawania: nazwa + Enter / „Dodaj”.
function AddRow({ placeholder, onAdd, label }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(v.trim());
    setBusy(false);
    if (ok) setV('');
  };
  return (
    <div className="flex gap-2 mb-3">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder={placeholder} aria-label={label}
        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
      <button onClick={submit} disabled={!v.trim() || busy} className="px-3 py-2 rounded-xl bg-accent-primary text-white text-sm font-medium shrink-0 flex items-center gap-1 disabled:opacity-50">
        <Plus size={15} /> {tr('Dodaj')}
      </button>
    </div>
  );
}

function Card({ icon: Icon, title, hint, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1"><Icon size={18} className="text-accent-primary" /> {title}</h3>
      {hint && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Zakładka „Kategorie i tagi”: obszary budżetu (służby + własne), kategorie wydatków
 * i wpływów, tagi oraz kontrahenci — wszystko w jednym, widocznym miejscu.
 */
export default function FinanceDictionaries({ serviceOptions, areas, categories, tagPalette, vendors, reload }) {
  const report = (failures, okMsg) => {
    if (failures.length) toast.error(tr('Zmieniono nazwę, ale części wpisów nie udało się przepisać ({n}). Spróbuj ponownie.', { n: failures.length }));
    else toast.success(okMsg);
  };

  // ── Obszary ─────────────────────────────────────────────────────────────
  const allAreaNames = [...(serviceOptions || []).map((o) => ({ name: o.value })), ...(areas || [])];
  const addArea = async (name) => {
    if (nameTaken(allAreaNames, name)) { toast.error(tr('Taka służba lub obszar już istnieje.')); return false; }
    const { error } = await supabase.from('finance_areas').insert([{ name, color: nextColor(areas.length), is_active: true, sort_order: areas.length }]);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    toast.success(tr('Dodano obszar „{name}”', { name })); reload.areas(); return true;
  };
  const renameArea = async (a, name) => {
    if (nameTaken(allAreaNames, name, a.id)) { toast.error(tr('Taka służba lub obszar już istnieje.')); return false; }
    const { error } = await supabase.from('finance_areas').update({ name, updated_at: new Date().toISOString() }).eq('id', a.id);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    report(await renameAreaEverywhere(supabase, a.name, name), tr('Zmieniono nazwę obszaru (także w budżecie i wydatkach)'));
    reload.areas(); reload.data(); return true;
  };
  const updateArea = async (a, patch) => {
    const { error } = await supabase.from('finance_areas').update(patch).eq('id', a.id);
    if (error) toast.error(humanSaveError(error, tr)); else reload.areas();
  };
  const deleteArea = async (a) => {
    if (!await confirmDialog({ title: tr('Usunąć obszar „{name}”?', { name: a.name }), message: tr('Pozycje budżetu i wydatki zachowają nazwę obszaru. Jeśli chcesz go tylko ukryć z list wyboru — użyj „Wyłącz”.'), danger: true })) return;
    const { error } = await supabase.from('finance_areas').delete().eq('id', a.id);
    if (error) toast.error(humanSaveError(error, tr)); else reload.areas();
  };

  // ── Kategorie ───────────────────────────────────────────────────────────
  const addCategory = (kind) => async (name) => {
    if (nameTaken(categories.filter((c) => c.kind === kind), name)) { toast.error(tr('Taka kategoria już istnieje.')); return false; }
    const { error } = await supabase.from('expense_categories').insert([{ name, kind, color: nextColor(categories.length), is_active: true }]);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    toast.success(tr('Dodano kategorię „{name}”', { name })); reload.categories(); return true;
  };
  const renameCategory = async (c, name) => {
    if (nameTaken(categories.filter((x) => x.kind === c.kind), name, c.id)) { toast.error(tr('Taka kategoria już istnieje.')); return false; }
    const { error } = await supabase.from('expense_categories').update({ name }).eq('id', c.id);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    report(await renameCategoryEverywhere(supabase, c.kind, c.name, name), tr('Zmieniono nazwę kategorii (także w transakcjach)'));
    reload.categories(); reload.data(); return true;
  };
  const updateCategory = async (c, patch) => {
    const { error } = await supabase.from('expense_categories').update(patch).eq('id', c.id);
    if (error) toast.error(humanSaveError(error, tr)); else reload.categories();
  };
  const deleteCategory = async (c) => {
    if (!await confirmDialog({ title: tr('Usunąć kategorię „{name}”?', { name: c.name }), message: tr('Istniejące transakcje zachowają swoją nazwę kategorii.'), danger: true })) return;
    const { error } = await supabase.from('expense_categories').delete().eq('id', c.id);
    if (error) toast.error(humanSaveError(error, tr)); else reload.categories();
  };

  // ── Tagi ────────────────────────────────────────────────────────────────
  const addTag = async (name) => {
    if (nameTaken(tagPalette, name)) { toast.error(tr('Taki tag już istnieje.')); return false; }
    const { error } = await supabase.from('finance_tags').insert([{ name, color: nextColor(tagPalette.length) }]);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    reload.tags(); return true;
  };
  const renameTag = async (t, name) => {
    if (nameTaken(tagPalette, name, t.id)) { toast.error(tr('Taki tag już istnieje.')); return false; }
    const { error } = await supabase.from('finance_tags').update({ name }).eq('id', t.id);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    report(await retagEverywhere(supabase, t.name, name), tr('Zmieniono nazwę tagu (także w transakcjach)'));
    reload.tags(); reload.data(); return true;
  };
  const recolorTag = async (t, color) => {
    const { error } = await supabase.from('finance_tags').update({ color }).eq('id', t.id);
    if (error) toast.error(humanSaveError(error, tr)); else reload.tags();
  };
  const deleteTag = async (t) => {
    if (!await confirmDialog({ title: tr('Usunąć tag „{name}”?', { name: t.name }), message: tr('Tag zniknie z palety i ze wszystkich wpływów, wydatków i pozycji budżetu.'), danger: true, confirmLabel: tr('Usuń') })) return;
    const failures = await retagEverywhere(supabase, t.name, null);
    const { error } = await supabase.from('finance_tags').delete().eq('id', t.id);
    if (error || failures.length) toast.error(tr('Nie udało się usunąć tagu ze wszystkich wpisów. Spróbuj ponownie.'));
    else toast.success(tr('Usunięto tag „{name}”', { name: t.name }));
    reload.tags(); reload.data();
  };

  // ── Kontrahenci ─────────────────────────────────────────────────────────
  const addVendor = async (name) => {
    if (nameTaken(vendors, name)) { toast.error(tr('Taki kontrahent już jest na liście.')); return false; }
    const { error } = await supabase.from('finance_vendors').insert([{ name }]);
    if (error) { toast.error(humanSaveError(error, tr)); return false; }
    reload.vendors(); return true;
  };
  const deleteVendor = async (v) => {
    if (!await confirmDialog(tr('Usunąć kontrahenta „{name}” z listy podpowiedzi? Wydatki zachowają jego nazwę.', { name: v.name }))) return;
    const { error } = await supabase.from('finance_vendors').delete().eq('id', v.id);
    if (error) toast.error(humanSaveError(error, tr)); else reload.vendors();
  };

  const catList = (kind) => categories.filter((c) => c.kind === kind);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card icon={Layers} title={tr('Służby i obszary budżetu')}
        hint={tr('Na co planujesz wydatki. Służby pochodzą z modułów aplikacji. Własne obszary — np. Administracja, Wynajem budynku, Media i opłaty — dodasz tutaj albo prosto z formularza budżetu.')}>
        <AddRow placeholder={tr('np. Administracja, Wynajem budynku')} label={tr('Nowy obszar')} onAdd={addArea} />
        <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Własne obszary')}</div>
        <div className="space-y-1.5 mb-4">
          {areas.length === 0 && <EmptyState icon={Layers} title={tr('Brak własnych obszarów')} compact />}
          {areas.map((a) => (
            <DictRow key={a.id} item={a} onRename={renameArea} onColor={(x, color) => updateArea(x, { color })}
              onToggle={(x) => updateArea(x, { is_active: x.is_active === false })} onDelete={deleteArea} />
          ))}
        </div>
        <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Służby (z modułów)')}</div>
        <div className="flex flex-wrap gap-1.5">
          {(serviceOptions || []).map((o) => (
            <span key={o.value} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{o.label}</span>
          ))}
        </div>
      </Card>

      <Card icon={Tags} title={tr('Tagi')}
        hint={tr('Dowolne etykiety przekrojowe, np. „remont 2026”, „ewangelizacja”, „dotacja”. Jedna transakcja może mieć kilka tagów; raport pokaże sumy wg tagów.')}>
        <AddRow placeholder={tr('np. remont, dotacja')} label={tr('Nowy tag')} onAdd={addTag} />
        <div className="space-y-1.5">
          {tagPalette.length === 0 && <EmptyState icon={Tag} title={tr('Brak tagów')} compact />}
          {tagPalette.map((t) => (
            <DictRow key={t.id} item={t} onRename={renameTag} onColor={recolorTag} onDelete={deleteTag} />
          ))}
        </div>
      </Card>

      {[['expense', tr('Kategorie wydatków'), tr('Rodzaj kosztu niezależny od służby: np. Media, Czynsz, Sprzęt, Materiały biurowe. Ustawisz ją na pozycji budżetu i na wydatku.'), tr('np. Czynsz, Media, Sprzęt')],
        ['income', tr('Kategorie wpływów'), tr('Rodzaje wpływów: np. Kolekta, Darowizny, Dotacje, Wynajem sali.'), tr('np. Kolekta, Dotacje')]].map(([kind, title, hint, ph]) => (
        <Card key={kind} icon={Tag} title={title} hint={hint}>
          <AddRow placeholder={ph} label={title} onAdd={addCategory(kind)} />
          <div className="space-y-1.5">
            {catList(kind).length === 0 && <EmptyState icon={Tag} title={tr('Brak kategorii')} compact />}
            {catList(kind).map((c) => (
              <DictRow key={c.id} item={c} onRename={renameCategory} onColor={(x, color) => updateCategory(x, { color })}
                onToggle={(x) => updateCategory(x, { is_active: x.is_active === false })} onDelete={deleteCategory} />
            ))}
          </div>
        </Card>
      ))}

      <Card icon={Users} title={tr('Kontrahenci')} hint={tr('Podpowiedzi w polu „Kontrahent”. Dopisują się też same przy zapisie wydatku.')}>
        <AddRow placeholder={tr('np. Sklep muzyczny')} label={tr('Kontrahenci')} onAdd={addVendor} />
        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
          {vendors.length === 0 && <EmptyState icon={Users} title={tr('Brak kontrahentów (dodają się też automatycznie z wydatków).')} compact />}
          {vendors.map((v) => <DictRow key={v.id} item={v} onDelete={deleteVendor} muted />)}
        </div>
      </Card>
    </div>
  );
}
