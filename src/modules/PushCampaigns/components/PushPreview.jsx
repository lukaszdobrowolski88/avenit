import React, { useState } from 'react';
import { Smartphone, Globe, Bell } from 'lucide-react';
import { PUSH_CATEGORIES } from '../constants';
import { tr } from '../../../i18n';

const PLATFORMS = [
  { id: 'ios', label: 'iOS', icon: Smartphone },
  { id: 'android', label: 'Android', icon: Smartphone },
  { id: 'web', label: 'Web', icon: Globe },
];

export default function PushPreview({ title, body, icon, bigImage, categoryId, actions = [] }) {
  const [platform, setPlatform] = useState('ios');
  const category = PUSH_CATEGORIES.find(c => c.id === categoryId);

  // Akcje z kategorii nadpisane custom labelami z edytora.
  const effectiveActions = (category?.actions || []).map((catAction, idx) => ({
    ...catAction,
    label: actions[idx]?.label || catAction.defaultLabel,
    destructive: actions[idx]?.destructive || catAction.destructive,
  }));

  return (
    <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6">
      {/* Switch platformy */}
      <div className="flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur p-1 rounded-xl mb-6 w-fit mx-auto">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              platform === p.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <p.icon size={14} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Mockup */}
      <div className="flex justify-center">
        {platform === 'ios' && <IOSMockup title={title} body={body} icon={icon} actions={effectiveActions} />}
        {platform === 'android' && <AndroidMockup title={title} body={body} icon={icon} bigImage={bigImage} actions={effectiveActions} />}
        {platform === 'web' && <WebMockup title={title} body={body} icon={icon} actions={effectiveActions} />}
      </div>
    </div>
  );
}

function IOSMockup({ title, body, icon, actions }) {
  return (
    <div className="w-full max-w-xs">
      <div className="bg-gray-100/95 dark:bg-gray-700/95 backdrop-blur-xl rounded-2xl shadow-xl p-3 border border-white/40">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
            {icon ? <img src={icon} alt="" className="w-full h-full object-cover" /> : <Bell size={16} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Aplikacja</span>
              <span className="text-[10px] text-gray-500">teraz</span>
            </div>
            <div className="text-[13px] font-semibold text-gray-900 dark:text-white mt-0.5 leading-tight">{title || tr('Tytuł powiadomienia')}</div>
            <div className="text-[12px] text-gray-700 dark:text-gray-200 mt-0.5 leading-snug">{body || tr('Treść powiadomienia...')}</div>
          </div>
        </div>
        {actions.length > 0 && (
          <div className="mt-2 -mx-3 -mb-3 border-t border-gray-300/50 dark:border-gray-600/50">
            {actions.slice(0, 3).map((a, i) => (
              <button
                key={i}
                className={`w-full px-3 py-2 text-[13px] font-medium ${i > 0 ? 'border-t border-gray-300/50 dark:border-gray-600/50' : ''} ${
                  a.destructive ? 'text-red-500' : 'text-blue-500'
                }`}
                disabled
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AndroidMockup({ title, body, icon, bigImage, actions }) {
  return (
    <div className="w-full max-w-xs">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center flex-shrink-0">
            {icon ? <img src={icon} alt="" className="w-full h-full rounded-full object-cover" /> : <Bell size={12} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 text-[10px] text-gray-500">
              <span className="font-medium text-gray-700 dark:text-gray-300">Aplikacja</span>
              <span>·</span>
              <span>teraz</span>
            </div>
            <div className="text-[13px] font-medium text-gray-900 dark:text-white mt-0.5 leading-tight">{title || tr('Tytuł powiadomienia')}</div>
            <div className="text-[12px] text-gray-700 dark:text-gray-300 leading-snug">{body || tr('Treść powiadomienia...')}</div>
            {bigImage && (
              <img src={bigImage} alt="" className="mt-2 rounded-md w-full max-h-32 object-cover" />
            )}
          </div>
        </div>
        {actions.length > 0 && (
          <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            {actions.slice(0, 3).map((a, i) => (
              <button
                key={i}
                className={`flex-1 px-2 py-1.5 text-[12px] font-medium uppercase rounded ${
                  a.destructive ? 'text-red-500' : 'text-accent-primary'
                }`}
                disabled
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WebMockup({ title, body, icon, actions }) {
  return (
    <div className="w-full max-w-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
            {icon ? <img src={icon} alt="" className="w-full h-full object-cover" /> : <Bell size={18} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-gray-900 dark:text-white">{title || tr('Tytuł powiadomienia')}</div>
            <div className="text-[13px] text-gray-700 dark:text-gray-300 mt-0.5">{body || tr('Treść powiadomienia...')}</div>
            <div className="text-[11px] text-gray-400 mt-1">{location.host || 'twoja-domena.pl'}</div>
          </div>
        </div>
        {actions.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-700 flex">
            {actions.slice(0, 2).map((a, i) => (
              <button
                key={i}
                className={`flex-1 px-3 py-2 text-[13px] font-medium ${i > 0 ? 'border-l border-gray-100 dark:border-gray-700' : ''} ${
                  a.destructive ? 'text-red-500' : 'text-accent-primary'
                }`}
                disabled
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
