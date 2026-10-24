import React, { useState } from 'react';
import { Heart, MessageCircle, Send, Bookmark, ThumbsUp, Share2, Film, Globe2, ChevronLeft, ChevronRight } from 'lucide-react';
import { tr } from '../../../i18n';
import { mediaSrc } from '../lib/socialApi';
import { instagramFormat, instagramImageCrop, isVideo, firstUrl, IG_FORMAT_LABELS } from '@avenit/shared/src/lib/social.js';
import ChannelAvatar from './ChannelAvatar';

// Tekst z podświetlonymi hashtagami, wzmiankami i linkami (podgląd — nie edytor).
function RichText({ text, clamp }) {
  const parts = String(text || '').split(/(\s+)/);
  return (
    <p className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-800 dark:text-gray-100 ${clamp ? 'line-clamp-6' : ''}`}>
      {parts.map((p, i) => (/^(#|@)[\p{L}\p{N}_.]+/u.test(p) || /^https?:\/\//.test(p)
        ? <span key={i} className="text-[#385898] dark:text-sky-300">{p}</span>
        : <React.Fragment key={i}>{p}</React.Fragment>))}
    </p>
  );
}

function MediaFrame({ m, aspect }) {
  if (!m) return null;
  if (isVideo(m)) {
    return (
      <div className="relative bg-black flex items-center justify-center text-white/80" style={{ aspectRatio: aspect || '9 / 16', maxHeight: 420 }}>
        <video src={mediaSrc(m)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        <Film size={28} className="absolute" aria-hidden="true" />
      </div>
    );
  }
  return <img src={mediaSrc(m)} alt={m.alt || ''} className="w-full object-cover bg-gray-100 dark:bg-gray-800" style={aspect ? { aspectRatio: aspect } : { maxHeight: 420 }} />;
}

function Carousel({ media, aspect }) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, media.length - 1);
  return (
    <div className="relative">
      <MediaFrame m={media[idx]} aspect={aspect} />
      {media.length > 1 && (
        <>
          <button type="button" onClick={() => setI(Math.max(0, idx - 1))} disabled={idx === 0} aria-label={tr('Poprzednie')}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/85 text-gray-800 flex items-center justify-center disabled:opacity-0"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setI(Math.min(media.length - 1, idx + 1))} disabled={idx === media.length - 1} aria-label={tr('Następne')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/85 text-gray-800 flex items-center justify-center disabled:opacity-0"><ChevronRight size={16} /></button>
          <span className="absolute right-2 top-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white tabular-nums">{idx + 1}/{media.length}</span>
        </>
      )}
    </div>
  );
}

function FacebookPreview({ account, content, media }) {
  const link = !media.length ? firstUrl(content) : null;
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <ChannelAvatar account={account} size={36} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-50 truncate">{account?.name}</p>
          <p className="text-[11px] text-gray-500 flex items-center gap-1">{tr('Teraz')} · <Globe2 size={10} aria-hidden="true" /></p>
        </div>
      </div>
      {content && <div className="px-3 pt-2 pb-2"><RichText text={content} clamp /></div>}
      {media.length === 1 && <MediaFrame m={media[0]} />}
      {media.length > 1 && (
        <div className={`grid gap-0.5 ${media.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {media.slice(0, 4).map((m, i) => (
            <div key={m.path} className="relative">
              {isVideo(m) ? <MediaFrame m={m} aspect="1 / 1" /> : <img src={mediaSrc(m)} alt={m.alt || ''} className="w-full aspect-square object-cover" />}
              {i === 3 && media.length > 4 && <span className="absolute inset-0 bg-black/50 text-white text-2xl font-semibold flex items-center justify-center">+{media.length - 4}</span>}
            </div>
          ))}
        </div>
      )}
      {link && (
        <div className="mx-3 mb-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 truncate">{(() => { try { return new URL(link).host; } catch { return link; } })()}</p>
          <p className="text-[12px] text-gray-600 dark:text-gray-300">{tr('Podgląd linku pobierze Facebook przy publikacji')}</p>
        </div>
      )}
      <div className="flex justify-around border-t border-gray-100 dark:border-gray-800 mx-3 py-1.5 text-[12px] text-gray-500">
        <span className="flex items-center gap-1"><ThumbsUp size={14} aria-hidden="true" />{tr('Lubię to')}</span>
        <span className="flex items-center gap-1"><MessageCircle size={14} aria-hidden="true" />{tr('Komentarz')}</span>
        <span className="flex items-center gap-1"><Share2 size={14} aria-hidden="true" />{tr('Udostępnij')}</span>
      </div>
    </div>
  );
}

function InstagramPreview({ account, content, media, options }) {
  const format = instagramFormat(media, options);
  const handle = account?.username ? account.username : account?.name;
  if (format === 'story' || format === 'reel') {
    return (
      <div className="relative mx-auto w-[240px] rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '9 / 16' }}>
        {media[0] && (isVideo(media[0])
          ? <video src={mediaSrc(media[0])} className="w-full h-full object-cover" muted playsInline preload="metadata" />
          : <img src={mediaSrc(media[0])} alt={media[0].alt || ''} className="w-full h-full object-cover" />)}
        <div className="absolute inset-x-0 top-0 p-2.5 flex items-center gap-2 bg-gradient-to-b from-black/50 to-transparent">
          <ChannelAvatar account={account} size={26} />
          <span className="text-[12px] font-semibold text-white truncate">{handle}</span>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-white/80">{tr(IG_FORMAT_LABELS[format])}</span>
        </div>
        {format === 'reel' && content && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
            <p className="text-[12px] text-white line-clamp-3 whitespace-pre-wrap">{content}</p>
          </div>
        )}
        {!media[0] && <p className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">{tr('Dodaj zdjęcie lub wideo')}</p>}
      </div>
    );
  }
  const crop = media[0] && !isVideo(media[0]) ? instagramImageCrop(media[0].width, media[0].height) : null;
  const aspect = crop ? (crop.target > 1 ? '1.91 / 1' : '4 / 5') : (media[0]?.width && media[0]?.height ? `${media[0].width} / ${media[0].height}` : '1 / 1');
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <ChannelAvatar account={account} size={30} />
        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-50 truncate">{handle}</p>
      </div>
      {media.length ? <Carousel media={media} aspect={aspect} /> : (
        <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm text-gray-500">{tr('Instagram wymaga zdjęcia albo wideo')}</div>
      )}
      <div className="flex items-center gap-3 px-3 pt-2.5 text-gray-800 dark:text-gray-100">
        <Heart size={20} aria-hidden="true" /><MessageCircle size={20} aria-hidden="true" /><Send size={20} aria-hidden="true" />
        <Bookmark size={20} className="ml-auto" aria-hidden="true" />
      </div>
      {content && (
        <div className="px-3 pt-1.5 pb-3">
          <p className="text-[13px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words line-clamp-4">
            <span className="font-semibold mr-1">{handle}</span>{content}
          </p>
        </div>
      )}
      {options?.first_comment && (
        <p className="px-3 pb-3 -mt-1 text-[12px] text-gray-500 line-clamp-2"><span className="font-semibold text-gray-700 dark:text-gray-300 mr-1">{handle}</span>{options.first_comment}</p>
      )}
    </div>
  );
}

export default function PostPreview({ account, content, media, options }) {
  if (!account) return null;
  return account.provider === 'instagram'
    ? <InstagramPreview account={account} content={content} media={media || []} options={options || {}} />
    : <FacebookPreview account={account} content={content} media={media || []} />;
}
