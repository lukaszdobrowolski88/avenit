import React from 'react';
import { splitLinks } from '../utils/linkify';
import { MENTION_ALL_TOKEN } from '../utils/chatLogic';

// Treść wiadomości: klikalne linki (K2) + podświetlone @wzmianki, „@wszyscy” wyróżnione (K5).
// W moim (ciemnym) dymku jasne podkreślenia, w cudzym — akcent marki.
function renderMentions(text, isOwn, keyBase) {
  const parts = String(text).split(/(@[\p{L}0-9._-]+)/u);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      const all = part.toLowerCase() === MENTION_ALL_TOKEN;
      const cls = isOwn
        ? `font-semibold text-white underline decoration-white/40 underline-offset-2${all ? ' decoration-2' : ''}`
        : all
          ? 'font-bold text-gray-900 dark:text-white bg-accent-primary-lighter/70 dark:bg-accent-primary-darkest/50 rounded px-1'
          : 'font-semibold text-accent-primary dark:text-accent-primary-light bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/30 rounded px-0.5';
      return <span key={`${keyBase}-${i}`} className={cls}>{part}</span>;
    }
    return <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>;
  });
}

export default function MessageText({ text, isOwn = false }) {
  if (!text) return null;
  const pieces = splitLinks(text);
  return (
    <>
      {pieces.map((p, i) => (p.type === 'link' ? (
        <a
          key={`l-${i}`}
          href={p.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          className={isOwn
            ? 'underline decoration-white/50 underline-offset-2 hover:decoration-white break-all'
            : 'text-accent-primary-dark dark:text-accent-primary-light underline decoration-accent-primary/40 underline-offset-2 hover:decoration-accent-primary break-all'}
        >
          {p.value}
        </a>
      ) : (
        <React.Fragment key={`t-${i}`}>{renderMentions(p.value, isOwn, i)}</React.Fragment>
      )))}
    </>
  );
}
