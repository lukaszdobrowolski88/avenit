import React from 'react';

export default function TypingIndicator({ userNames = [] }) {
  if (userNames.length === 0) return null;

  const getText = () => {
    if (userNames.length === 1) {
      return `${userNames[0]} pisze`;
    } else if (userNames.length === 2) {
      return `${userNames[0]} i ${userNames[1]} piszą`;
    } else {
      return `${userNames[0]} i ${userNames.length - 1} innych piszą`;
    }
  };

  return (
    <div className="flex items-center gap-2 py-2 px-3">
      <div className="flex items-center gap-1">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 italic">
        {getText()}...
      </span>
    </div>
  );
}
