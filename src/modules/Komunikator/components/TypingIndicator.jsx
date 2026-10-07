import React from 'react';
import { tr } from '../../../i18n';

// „Ola pisze…” — ten sam tekst co w aplikacji (hooks/useTypingStatus.ts → typingLabel).
function typingText(userNames = []) {
  if (userNames.length === 0) return '';
  if (userNames.length === 1) return tr('{name} pisze…', { name: userNames[0] });
  if (userNames.length === 2) return tr('{a} i {b} piszą…', { a: userNames[0], b: userNames[1] });
  return tr('{name} i inni piszą…', { name: userNames[0] });
}

export default function TypingIndicator({ userNames = [] }) {
  if (userNames.length === 0) return null;

  return (
    <div className="flex items-center gap-2 py-2 px-3" role="status" aria-live="polite">
      <div className="flex items-center gap-1">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 italic">
        {typingText(userNames)}
      </span>
    </div>
  );
}
