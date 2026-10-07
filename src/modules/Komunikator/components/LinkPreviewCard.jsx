import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { domainOf, isSafeHttpUrl } from '../utils/linkify';

// Karta podglądu PIERWSZEGO linku w wiadomości (K2). Ładowana leniwie — dopiero gdy dymek
// pojawi się na ekranie. Dane z serwera (POST /api/fn/link-preview, cache 7 dni po stronie serwera),
// tu dodatkowo pamięć na czas sesji. Brak danych / błąd → nic nie pokazujemy (link i tak jest klikalny).
const previewCache = new Map(); // url -> Promise<data|null>

function loadPreview(url) {
  if (!previewCache.has(url)) {
    previewCache.set(url, supabase.functions
      .invoke('link-preview', { body: { url }, silent: true })
      .then(({ data, error }) => {
        if (error || !data || (!data.title && !data.image && !data.description)) return null;
        return data;
      })
      .catch(() => null));
  }
  return previewCache.get(url);
}

export default function LinkPreviewCard({ url, isOwn = false }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !url) return undefined;
    let alive = true;
    loadPreview(url).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [visible, url]);

  if (!data) return <span ref={ref} className="block h-0 w-0" aria-hidden="true" />;

  const site = data.siteName || domainOf(data.url || url);
  const image = data.image && isSafeHttpUrl(data.image) && !imgFailed ? data.image : null;
  const href = isSafeHttpUrl(data.url) ? data.url : url;

  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`mt-2 block overflow-hidden rounded-xl transition ${isOwn
        ? 'bg-white/10 hover:bg-white/15'
        : 'bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
    >
      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full max-h-40 object-cover"
        />
      )}
      <div className="px-3 py-2">
        {data.title && <p className={`text-sm font-semibold line-clamp-2 ${isOwn ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>{data.title}</p>}
        {data.description && <p className={`mt-0.5 text-xs line-clamp-2 ${isOwn ? 'text-white/75' : 'text-gray-500 dark:text-gray-400'}`}>{data.description}</p>}
        {site && (
          <p className={`mt-1 flex items-center gap-1 text-[11px] ${isOwn ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
            <ExternalLink size={11} aria-hidden="true" />
            <span className="truncate">{site}</span>
          </p>
        )}
      </div>
    </a>
  );
}
