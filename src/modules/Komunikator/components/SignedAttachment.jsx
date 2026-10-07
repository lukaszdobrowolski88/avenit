import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import useAttachmentUrl from '../hooks/useAttachmentUrl';
import { openAttachment } from '../utils/attachmentUrl';
import AudioPlayer from './AudioPlayer';

// Załączniki Komunikatora wyświetlane przez podpisany link (K1). W bazie zostaje zwykły adres.

// Obrazek: do czasu podpisu — miejsce zastępcze tego samego rozmiaru (bez „zepsutej” ikonki).
export function SignedImage({ url, alt = '', className = '', placeholderClassName = '', ...rest }) {
  const src = useAttachmentUrl(url);
  if (!src) {
    return (
      <span className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse ${placeholderClassName || className}`} aria-label={alt} role="img">
        <ImageIcon size={18} className="text-gray-300 dark:text-gray-600" aria-hidden="true" />
      </span>
    );
  }
  return <img src={src} alt={alt} className={className} loading="lazy" {...rest} />;
}

// Link do pliku: href od razu (gdy podpis gotowy), a kliknięcie przed podpisem otwiera kartę i
// podstawia adres po podpisaniu.
export function SignedLink({ url, children, className = '', ...rest }) {
  const href = useAttachmentUrl(url);
  return (
    <a
      href={href || url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        if (href) return;
        e.preventDefault();
        openAttachment(url);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// Głosówka: odtwarzacz dostaje adres dopiero po podpisaniu.
export function SignedAudio({ url, duration, isOwn }) {
  const src = useAttachmentUrl(url);
  return <AudioPlayer url={src || undefined} duration={duration} isOwn={isOwn} />;
}
