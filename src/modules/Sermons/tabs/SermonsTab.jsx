import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Podcast, Filter, Link as LinkIcon, Check, Music, Video, BookOpen, FilterX } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { slugify, formatDate, parseVideo } from '../lib/sermonsApi';
import { bibleUrl } from '../lib/bible';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { DateInput } from '../../../components/pickers';
import { confirmDialog, promptDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const makeEmptyForm = () => ({
  title: '', speaker: '', series: '', sermon_date: localToday(),
  scripture_ref: '', description: '', audio_url: '', video_url: '', notes: '',
  slug: '', is_published: false,
});

export default function SermonsTab({ sermons, loading, campusIdForInsert, refresh, teachingSeries = [], speakers = [], createPreset = null }) {
  const [search, setSearch] = useState('');
  const [seriesFilter, setSeriesFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(makeEmptyForm);
  const [titleError, setTitleError] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Auto-generuj slug z tytułu, dopóki użytkownik nie zmieni go ręcznie
  useEffect(() => {
    if (!slugTouched) {
      setForm(f => ({ ...f, slug: slugify(f.title) }));
    }
  }, [form.title, slugTouched]);

  // Opcje filtra serii = aktywne serie nauczania + serie już przypisane do kazań
  // (żeby filtr działał nawet dla serii bez kazań oraz dla starych/nieaktywnych).
  const seriesOptions = useMemo(() => {
    const fromSermons = (sermons || []).map(s => s.series).filter(Boolean);
    const fromSeries = (teachingSeries || []).filter(s => s.is_active !== false).map(s => s.name).filter(Boolean);
    const set = new Set([...fromSeries, ...fromSermons]);
    return [{ value: '', label: tr('Wszystkie serie') }, ...[...set].sort().map(s => ({ value: s, label: s }))];
  }, [sermons, teachingSeries]);

  const statusOptions = [
    { value: '', label: tr('Wszystkie statusy') },
    { value: 'published', label: tr('Opublikowane') },
    { value: 'draft', label: tr('Szkice') },
  ];

  // Wybór serii na kazaniu = aktywne serie nauczania (is_active !== false).
  // Jeśli edytowane kazanie ma serię spoza listy aktywnych, dopisujemy ją (oznaczoną).
  const seriesSelectOptions = useMemo(() => {
    const activeNames = (teachingSeries || []).filter(s => s.is_active !== false).map(s => s.name).filter(Boolean);
    const opts = [{ value: '', label: tr('— brak serii —') }, ...[...new Set(activeNames)].sort().map(n => ({ value: n, label: n }))];
    if (form.series && !activeNames.includes(form.series)) {
      opts.push({ value: form.series, label: `${form.series} (${tr('nieaktywna')})` });
    }
    return opts;
  }, [teachingSeries, form.series]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (sermons || []).filter(item => {
      if (seriesFilter && item.series !== seriesFilter) return false;
      if (statusFilter === 'published' && !item.is_published) return false;
      if (statusFilter === 'draft' && item.is_published) return false;
      if (!s) return true;
      return (item.title || '').toLowerCase().includes(s)
        || (item.speaker || '').toLowerCase().includes(s)
        || (item.series || '').toLowerCase().includes(s)
        || (item.scripture_ref || '').toLowerCase().includes(s);
    });
  }, [sermons, search, seriesFilter, statusFilter]);

  const openCreate = (preset = {}) => {
    setEditing(null); setForm({ ...makeEmptyForm(), ...preset }); setSlugTouched(false); setTitleError(''); setModalOpen(true);
  };
  // „Dodaj kazanie do serii” z zakładki Serie → formularz z ustawioną serią.
  useEffect(() => {
    if (createPreset?.nonce) openCreate({ series: createPreset.series || '' });
  }, [createPreset?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title || '', speaker: item.speaker || '', series: item.series || '',
      sermon_date: item.sermon_date || '', scripture_ref: item.scripture_ref || '',
      description: item.description || '', audio_url: item.audio_url || '',
      video_url: item.video_url || '', notes: item.notes || '',
      slug: item.slug || slugify(item.title), is_published: !!item.is_published,
    });
    setSlugTouched(true); // przy edycji nie nadpisuj istniejącego slugu automatycznie
    setTitleError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { setTitleError(tr('Podaj tytuł kazania.')); return; }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const finalSlug = (form.slug && form.slug.trim()) ? slugify(form.slug) : slugify(form.title);
      const payload = {
        title: form.title.trim(),
        speaker: form.speaker || null,
        series: form.series || null,
        sermon_date: form.sermon_date || null,
        scripture_ref: form.scripture_ref || null,
        description: form.description || null,
        audio_url: form.audio_url || null,
        video_url: form.video_url || null,
        notes: form.notes || null,
        slug: finalSlug || null,
        is_published: form.is_published,
      };
      if (editing) {
        const { error } = await supabase.from('sermons').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        payload.created_by = user?.email || null;
        const { error } = await supabase.from('sermons').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      toast.success(editing ? tr('Zapisano kazanie') : tr('Dodano kazanie'));
      refresh();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać kazania. Spróbuj ponownie.') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!await confirmDialog({
      title: tr('Usunąć kazanie?'),
      message: tr('Kazanie „{title}” zniknie z archiwum, a jego publiczny link przestanie działać. Tej operacji nie można cofnąć.', { title: item.title }),
      isDelete: true,
    })) return;
    try {
      const { error } = await supabase.from('sermons').delete().eq('id', item.id);
      if (error) throw error;
      toast.success(tr('Usunięto kazanie'));
      refresh();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się usunąć kazania.') });
    }
  };

  const copyPublicLink = async (item) => {
    if (!item.slug) { toast.error(tr('To kazanie nie ma jeszcze publicznego linku. Otwórz edycję i zapisz, aby go utworzyć.')); return; }
    const url = `${window.location.origin}/sermon/${item.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback dla przeglądarek bez clipboard API
      await promptDialog(tr('Skopiuj link publiczny:'), url);
    }
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tr('Szukaj tytułu, mówcy, serii, odnośnika...')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="w-44"><CustomSelect value={seriesFilter} onChange={setSeriesFilter} options={seriesOptions} compact icon={Filter} /></div>
        <div className="w-40"><CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} compact /></div>
        <button onClick={() => openCreate()} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> {tr('Dodaj kazanie')}
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">{tr('Kazań:')} <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">{tr('Opublikowanych:')} <b className="text-accent-primary dark:text-accent-primary-light">{filtered.filter(s => s.is_published).length}</b></span>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <Spinner center />
        ) : filtered.length === 0 ? (
          (search.trim() || seriesFilter || statusFilter) ? (
            <EmptyState icon={FilterX} title={tr('Żadne kazanie nie pasuje do filtrów.')}
              action={<Button variant="outline" size="sm" icon={FilterX} onClick={() => { setSearch(''); setSeriesFilter(''); setStatusFilter(''); }}>{tr('Wyczyść filtry')}</Button>} />
          ) : (
            <EmptyState icon={Podcast} title={tr('Nie ma jeszcze żadnego kazania.')}
              action={<Button size="sm" icon={Plus} onClick={() => openCreate()}>{tr('Dodaj kazanie')}</Button>} />
          )
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>{tr('Tytuł')}</TH>
                <TH>{tr('Mówca')}</TH>
                <TH>{tr('Seria')}</TH>
                <TH>{tr('Data')}</TH>
                <TH>{tr('Media')}</TH>
                <TH>{tr('Status')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map(item => (
                <TR key={item.id}>
                  <TD>
                    <div className="font-medium text-gray-900 dark:text-white">{item.title}</div>
                    {item.scripture_ref && (
                      <span className="inline-flex items-center gap-1 text-xs text-accent-primary dark:text-accent-primary-light">
                        <BookOpen size={12} /> {item.scripture_ref}
                      </span>
                    )}
                  </TD>
                  <TD muted>{item.speaker || ''}</TD>
                  <TD muted>{item.series || ''}</TD>
                  <TD muted numeric className="whitespace-nowrap">{item.sermon_date ? formatDate(item.sermon_date) : ''}</TD>
                  <TD>
                    <div className="flex items-center gap-2 text-gray-400">
                      {item.audio_url && <Music size={15} className="text-accent-primary dark:text-accent-primary-light" title={tr('Audio')} />}
                      {item.video_url && <Video size={15} className="text-accent-primary dark:text-accent-primary-light" title={tr('Wideo')} />}
                    </div>
                  </TD>
                  <TD>
                    <StatusPill color={item.is_published ? STATUS_COLORS.success : STATUS_COLORS.neutral}>
                      {item.is_published ? tr('Opublikowane') : tr('Szkic')}
                    </StatusPill>
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyPublicLink(item)}
                        title={tr('Kopiuj link publiczny')}
                        className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {copiedId === item.id ? <Check size={15} className="text-emerald-500" /> : <LinkIcon size={15} />}
                      </button>
                      <button onClick={() => openEdit(item)} title={tr('Edytuj')} aria-label={tr('Edytuj kazanie „{title}”', { title: item.title })} className="p-2 rounded-lg text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} aria-hidden="true" /></button>
                      <button onClick={() => remove(item)} title={tr('Usuń')} aria-label={tr('Usuń kazanie „{title}”', { title: item.title })} className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} aria-hidden="true" /></button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? tr('Edytuj kazanie') : tr('Nowe kazanie')}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{tr('Anuluj')}</Button>
          <Button onClick={save} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="sermon-title" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Tytuł')}</label>
            <input id="sermon-title" value={form.title} onChange={e => { setForm(f => ({ ...f, title: e.target.value })); if (titleError) setTitleError(''); }} placeholder={tr('np. Łaska większa niż grzech')}
              aria-invalid={!!titleError || undefined}
              className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 ${titleError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
            {titleError && <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-1" role="alert">{titleError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sermon-speaker" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Mówca')}</label>
              {/* Podpowiedzi z zakładki „Mówcy” (lista), wpis spoza listy też jest dozwolony. */}
              <input id="sermon-speaker" list="sermon-speakers" value={form.speaker} onChange={e => setForm(f => ({ ...f, speaker: e.target.value }))} placeholder={tr('Wybierz z listy mówców lub wpisz')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              <datalist id="sermon-speakers">
                {(speakers || []).map((sp) => <option key={sp.id} value={sp.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Seria')}</label>
              <CustomSelect value={form.series || ''} onChange={(val) => setForm(f => ({ ...f, series: val }))} options={seriesSelectOptions} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Data')}</label>
              <DateInput value={form.sermon_date} onChange={e => setForm(f => ({ ...f, sermon_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Odnośnik biblijny')}</label>
              <input value={form.scripture_ref} onChange={e => setForm(f => ({ ...f, scripture_ref: e.target.value }))} placeholder={tr('np. J 3,16')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              {form.scripture_ref && bibleUrl(form.scripture_ref) && (
                <a href={bibleUrl(form.scripture_ref)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 ml-1 text-xs text-accent-primary dark:text-accent-primary-light hover:underline">
                  <BookOpen size={12} /> {tr('Podgląd fragmentu (UBG)')}
                </a>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Opis')}</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={tr('Krótki opis / streszczenie kazania')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Link do nagrania audio')}</label>
            <input value={form.audio_url} onChange={e => setForm(f => ({ ...f, audio_url: e.target.value }))} placeholder="https://.../kazanie.mp3" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('URL wideo (YouTube / Vimeo)')}</label>
            <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://www.youtube.com/watch?v=..." className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
            {form.video_url && parseVideo(form.video_url).provider && parseVideo(form.video_url).provider !== 'other' && (
              <span className="inline-flex items-center gap-1 mt-1 ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check size={12} /> {tr('Rozpoznano: {provider} (osadzenie w odtwarzaczu)', { provider: parseVideo(form.video_url).provider === 'youtube' ? 'YouTube' : 'Vimeo' })}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Notatki / konspekt')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
          </div>

          {/* Końcówka linku to rzadko zmieniana rzecz — schowana pod „Zaawansowane”. */}
          <details className="group">
            <summary className="text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none ml-1">{tr('Zaawansowane')}</summary>
          <div className="mt-2">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Końcówka linku publicznego')}</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">/sermon/</span>
              <input
                value={form.slug}
                onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                placeholder={tr('auto z tytułu')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('Tworzona automatycznie z tytułu; możesz ją zmienić.')}</p>
          </div>
          </details>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="rounded accent-emerald-500" />
            {tr('Opublikowane (widoczne pod linkiem publicznym)')}
          </label>
        </div>
      </Modal>
    </div>
  );
}
