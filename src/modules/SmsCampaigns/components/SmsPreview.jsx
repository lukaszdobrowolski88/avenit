import React from 'react';
import { MessageSquare } from 'lucide-react';
import { smsAnalysis } from '../utils/smsEncoding';
import { tr } from '../../../i18n';

export default function SmsPreview({ sender, body }) {
  const text = body || tr('Treść SMS pojawi się tutaj...');
  const { encoding, parts, charCount } = smsAnalysis(body || '');
  const senderLabel = sender || 'INFO';

  return (
    <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6">
      {/* Phone frame */}
      <div className="mx-auto w-full max-w-xs">
        <div className="bg-black rounded-[2.5rem] p-3 shadow-2xl">
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] overflow-hidden">
            {/* Status bar */}
            <div className="px-6 pt-4 pb-2 flex items-center justify-between text-[11px] font-semibold text-gray-900 dark:text-white">
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <MessageSquare size={11} /> Wiadomości
              </span>
            </div>

            {/* Header z senderem */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center mb-1">
                <MessageSquare size={16} className="text-white" />
              </div>
              <div className="text-xs font-semibold text-gray-900 dark:text-white">{senderLabel}</div>
              <div className="text-[10px] text-gray-500">SMS</div>
            </div>

            {/* Message bubble */}
            <div className="p-4 min-h-[180px] bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
              <div className="max-w-[80%]">
                <div className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words">
                  {text}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">teraz</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
        <span className={`px-2 py-0.5 rounded ${encoding === 'unicode' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
          {encoding === 'unicode' ? 'Unicode' : 'GSM-7'}
        </span>
        <span>{charCount} znaków</span>
        <span>·</span>
        <span>{parts || 1} {(parts || 1) === 1 ? 'część' : 'części'}</span>
      </div>
    </div>
  );
}
