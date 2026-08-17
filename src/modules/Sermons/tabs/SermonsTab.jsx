import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, Podcast, Filter, Link as LinkIcon, Check, Music, Video, BookOpen } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { slugify, formatDate, parseVideo } from '../lib/sermonsApi';
import { bibleUrl } from '../lib/bible';
import { toast } from '../../../lib/toast';

const emptyForm = {
  title: '', speaker: '', series: '', sermon_date: new Date().toISOString().slice(0, 10),
  scripture_ref: '', description: '', audio_url: '', video_url: '', notes: '',
  slug: '', is_published: false,
};

export default function SermonsTab({ sermons, loading, campusIdForInsert, refresh }) {
  const [search, setSearch] = useState('');
  const [seriesFilter, setSeriesFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Auto-generuj slug z tytułu, dopóki użytkownik nie zmieni go ręcznie
  useEffect(() => {
    if (!slugTouched) {
      setForm(f => ({ ...f, slug: slugify(f.title) }));
    }
  }, [form.title, slugTouched]);

  const seriesOptions = useMemo(() => {
    const set = new Set((sermons || []).map(s => s.series).filter(Boolean));
    return [{ value: '', label: 'Wszystkie serie' }, ...[...set].sort().map(s => ({ value: s, label: s }))];
  }, [sermons]);

  const statusOptions = [
    { value: '', label: 'Wszystkie statusy' },
    { value: 'published', label: 'Opublikowane' },
    { value: 'draft', label: 'Szkice' },
  ];

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

  const openCreate = () => {
    setEditing(null); setForm(emptyForm); setSlugTouched(false); setModalOpen(true);
  };
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
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Podaj tytuł kazania.'); return; }
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
      refresh();
    } catch (err) {
      console.error('Save sermon error:', err);
      toast.error('Nie udało się zapisać kazania: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Usunąć kazanie „${item.title}"?`)) return;
    try {
      const { error } = await supabase.from('sermons').delete().eq('id', item.id);
      if (error) throw error;
      refresh();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  const copyPublicLink = async (item) => {
    if (!item.slug) { toast.error('To kazanie nie ma jeszcze slugu — otwórz edycję i zapisz, aby go wygenerować.'); return; }
    const url = `${window.location.origin}/sermon/${item.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback dla przeglądarek bez clipboard API
      window.prompt('Skopiuj link publiczny:', url);
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
            placeholder="Szukaj tytułu, mówcy, serii, odnośnika..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="w-44"><CustomSelect value={seriesFilter} onChange={setSeriesFilter} options={seriesOptions} compact icon={Filter} /></div>
        <div className="w-40"><CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} compact /></div>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> Dodaj kazanie
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Kazań: <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Opublikowanych: <b className="text-accent-primary dark:text-accent-primary-light">{filtered.filter(s => s.is_published).length}</b></span>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Ładowanie...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Podcast size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak kazań dla wybranych filtrów.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Tytuł</th>
                  <th className="px-4 py-3 font-semibold">Mówca</th>
                  <th className="px-4 py-3 font-semibold">Seria</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Media</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{item.title}</div>
                      {item.scripture_ref && (
                        <span className="inline-flex items-center gap-1 text-xs text-accent-primary dark:text-accent-primary-light">
                          <BookOpen size={12} /> {item.scripture_ref}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.speaker || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.series || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{item.sermon_date ? formatDate(item.sermon_date) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-gray-400">
                        {item.audio_url && <Music size={15} className="text-accent-primary dark:text-accent-primary-light" title="Audio" />}
                        {item.video_url && <Video size={15} className="text-accent-primary dark:text-accent-primary-light" title="Wideo" />}
                        {!item.audio_url && !item.video_url && <span className="text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.is_published
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}>{item.is_published ? 'Opublikowane' : 'Szkic'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => copyPublicLink(item)}
                          title="Kopiuj link publiczny"
                          className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          {copiedId === item.id ? <Check size={15} className="text-emerald-500" /> : <LinkIcon size={15} />}
                        </button>
                        <button onClick={() => openEdit(item)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                        <button onClick={() => remove(item)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj kazanie' : 'Nowe kazanie'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tytuł</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="np. Łaska większa niż grzech" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Mówca</label>
                  <input value={form.speaker} onChange={e => setForm(f => ({ ...f, speaker: e.target.value }))} placeholder="np. Jan Kowalski" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Seria</label>
                  <input value={form.series} onChange={e => setForm(f => ({ ...f, series: e.target.value }))} placeholder="np. List do Rzymian" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data</label>
                  <input type="date" value={form.sermon_date} onChange={e => setForm(f => ({ ...f, sermon_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Odnośnik biblijny</label>
                  <input value={form.scripture_ref} onChange={e => setForm(f => ({ ...f, scripture_ref: e.target.value }))} placeholder="np. J 3,16" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                  {form.scripture_ref && bibleUrl(form.scripture_ref) && (
                    <a href={bibleUrl(form.scripture_ref)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 ml-1 text-xs text-accent-primary dark:text-accent-primary-light hover:underline">
                      <BookOpen size={12} /> Podgląd fragmentu (UBG)
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Opis</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Krótki opis / streszczenie kazania" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">URL audio</label>
                <input value={form.audio_url} onChange={e => setForm(f => ({ ...f, audio_url: e.target.value }))} placeholder="https://.../kazanie.mp3" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">URL wideo (YouTube / Vimeo)</label>
                <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://www.youtube.com/watch?v=..." className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                {form.video_url && parseVideo(form.video_url).provider && parseVideo(form.video_url).provider !== 'other' && (
                  <span className="inline-flex items-center gap-1 mt-1 ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check size={12} /> Rozpoznano: {parseVideo(form.video_url).provider === 'youtube' ? 'YouTube' : 'Vimeo'} (osadzenie w odtwarzaczu)
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatki / konspekt</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Slug (link publiczny)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">/sermon/</span>
                  <input
                    value={form.slug}
                    onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                    placeholder="auto z tytułu"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-1">Generowany automatycznie z tytułu; możesz nadpisać.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="rounded accent-emerald-500" />
                Opublikowane (widoczne pod linkiem publicznym)
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
