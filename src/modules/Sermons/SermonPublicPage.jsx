import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Podcast, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SermonPlayer from './components/SermonPlayer';

/**
 * Publiczna strona pojedynczego kazania — dostępna bez logowania pod /sermon/:slug.
 * Pokazuje wyłącznie kazania opublikowane (is_published = true).
 * UWAGA: trasę należy podpiąć w App.jsx (robi koordynator) — patrz uwagi w zgłoszeniu.
 */
export default function SermonPublicPage() {
  const { slug } = useParams();
  const [sermon, setSermon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const { data, error } = await supabase
          .from('sermons')
          .select('*')
          .eq('slug', slug)
          .eq('is_published', true)
          .order('sermon_date', { ascending: false, nullsFirst: false })
          .limit(1);
        if (error) throw error;
        if (!active) return;
        if (data && data.length > 0) {
          setSermon(data[0]);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Public sermon load error:', err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
            <Podcast className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Kazania</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Archiwum kazań</p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Ładowanie...</div>
        ) : notFound || !sermon ? (
          <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <Podcast size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nie znaleziono kazania lub nie jest ono opublikowane.</p>
            <Link to="/" className="inline-flex items-center gap-1.5 mt-4 text-sm text-accent-primary dark:text-accent-primary-light hover:underline">
              <ArrowLeft size={14} /> Strona główna
            </Link>
          </div>
        ) : (
          <SermonPlayer sermon={sermon} />
        )}
      </div>
    </div>
  );
}
