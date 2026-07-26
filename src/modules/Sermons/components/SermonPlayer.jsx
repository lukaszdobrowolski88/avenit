import React from 'react';
import { BookOpen, Calendar, User, Layers, Music, Video, ExternalLink } from 'lucide-react';
import { formatDate, parseVideo } from '../lib/sermonsApi';
import { bibleUrl } from '../lib/bible';

/**
 * Prezentacyjny odtwarzacz pojedynczego kazania.
 * Używany zarówno w zakładce „Podgląd/Odtwarzacz", jak i na publicznej stronie.
 */
export default function SermonPlayer({ sermon }) {
  if (!sermon) return null;
  const video = parseVideo(sermon.video_url);
  const scriptureLink = bibleUrl(sermon.scripture_ref);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Nagłówek kazania */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{sermon.title}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500 dark:text-gray-400">
          {sermon.speaker && <span className="inline-flex items-center gap-1.5"><User size={14} /> {sermon.speaker}</span>}
          {sermon.series && <span className="inline-flex items-center gap-1.5"><Layers size={14} /> {sermon.series}</span>}
          {sermon.sermon_date && <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {formatDate(sermon.sermon_date)}</span>}
        </div>
        {sermon.scripture_ref && (
          <div className="mt-3">
            {scriptureLink ? (
              <a
                href={scriptureLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light hover:underline"
              >
                <BookOpen size={14} /> {sermon.scripture_ref}
                <ExternalLink size={12} className="opacity-70" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light">
                <BookOpen size={14} /> {sermon.scripture_ref}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Media */}
      <div className="p-6 space-y-5">
        {/* Wideo osadzone (YouTube / Vimeo) */}
        {video.embedUrl && (
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-2"><Video size={14} /> Wideo</div>
            <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ paddingTop: '56.25%' }}>
              <iframe
                src={video.embedUrl}
                title={sermon.title}
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Wideo jako zwykły link (gdy nie da się osadzić) */}
        {sermon.video_url && !video.embedUrl && (
          <a href={sermon.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-accent-primary dark:text-accent-primary-light hover:underline">
            <Video size={16} /> Otwórz wideo <ExternalLink size={12} />
          </a>
        )}

        {/* Audio */}
        {sermon.audio_url && (
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-2"><Music size={14} /> Audio</div>
            <audio controls preload="none" src={sermon.audio_url} className="w-full">
              Twoja przeglądarka nie obsługuje odtwarzacza audio.
            </audio>
          </div>
        )}

        {!sermon.audio_url && !sermon.video_url && (
          <p className="text-sm text-gray-400 dark:text-gray-500">Brak dołączonego audio lub wideo.</p>
        )}

        {/* Opis */}
        {sermon.description && (
          <div>
            <div className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Opis</div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{sermon.description}</p>
          </div>
        )}

        {/* Notatki */}
        {sermon.notes && (
          <div>
            <div className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Notatki / konspekt</div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{sermon.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
