import React, { useState, useRef, useEffect } from 'react';
import { tr } from '../../../i18n';

// Pełny picker emoji – bez zależności zewnętrznych (zgodny z CSP).
const CATEGORIES = [
  {
    key: 'recent', label: tr('Ostatnie'), icon: '🕘', emojis: []
  },
  {
    key: 'faith', label: tr('Wiara'), icon: '🙏',
    emojis: ['🙏', '✝️', '⛪', '📖', '🕊️', '😇', '👼', '🛐', '🕯️', '❤️‍🔥', '🌿', '👑', '🎶', '🎵', '🙌', '✨', '💒', '🔥', '💧', '🌟']
  },
  {
    key: 'smileys', label: tr('Buźki'), icon: '😀',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🤗', '🤩', '🥳', '😌', '😔', '😢', '😭', '😅', '😴', '🤔', '😮', '😲', '😳', '🥺', '😤', '😡', '🤯', '😱']
  },
  {
    key: 'gestures', label: tr('Gesty'), icon: '👍',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👏', '🙌', '👐', '🤲', '🙏', '💪', '👊', '✊', '🤝', '👋', '🖐️', '✋', '👆', '👇', '👉', '👈', '☝️', '💯']
  },
  {
    key: 'hearts', label: tr('Serca'), icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️']
  },
  {
    key: 'objects', label: tr('Obiekty'), icon: '🎉',
    emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '📅', '📌', '📎', '📝', '✅', '❌', '⭐', '🌈', '☀️', '🌙', '⏰', '📢', '📣', '🔔', '💡', '📷', '🎂', '☕', '🍞', '🍷']
  },
  {
    key: 'symbols', label: tr('Symbole'), icon: '➕',
    emojis: ['✅', '❌', '❓', '❗', '⚠️', '➕', '➖', '💤', '🔴', '🟢', '🔵', '🟡', '⚫', '⚪', '🔺', '🔻', '♾️', '✔️', '➡️', '⬅️', '⬆️', '⬇️']
  }
];

const RECENT_KEY = 'komunikator_recent_emojis';

export function addRecentEmoji(emoji) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = [emoji, ...list.filter(e => e !== emoji)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignoruj */ }
}

function getRecentEmojis() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function EmojiPicker({ onSelect, onClose, className = '' }) {
  const [activeCat, setActiveCat] = useState('faith');
  const [recent] = useState(getRecentEmojis);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const categories = CATEGORIES.map(c => c.key === 'recent' ? { ...c, emojis: recent } : c)
    .filter(c => c.key !== 'recent' || recent.length > 0);

  const activeEmojis = categories.find(c => c.key === activeCat)?.emojis || [];

  const handlePick = (emoji) => {
    addRecentEmoji(emoji);
    onSelect?.(emoji);
  };

  return (
    <div
      ref={ref}
      className={`w-72 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-xl overflow-hidden ${className}`}
    >
      {/* Zakładki kategorii */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-gray-100 dark:border-gray-800 overflow-x-auto custom-scrollbar">
        {categories.map(cat => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActiveCat(cat.key)}
            title={cat.label}
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all ${
              activeCat === cat.key
                ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 scale-110'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      {/* Siatka emoji */}
      <div className="p-2 h-48 overflow-y-auto custom-scrollbar grid grid-cols-7 gap-0.5">
        {activeEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            onClick={() => handlePick(emoji)}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-125 transition-all"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
