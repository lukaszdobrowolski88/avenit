import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ClipboardList, Users, Heart, MessageCircle, Home, Wallet, Search } from 'lucide-react';
import { openCommandPalette } from '../../../components/CommandPalette';
import { tr } from '../../../i18n';

// Skróty do najczęściej używanych miejsc aplikacji.
const ACTIONS = [
  { label: tr('Kalendarz'), icon: CalendarDays, to: '/calendar', color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' },
  { label: tr('Programy'), icon: ClipboardList, to: '/programs', color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
  { label: tr('Członkowie'), icon: Users, to: '/members', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
  { label: 'Modlitwa', icon: Heart, to: '/prayer', color: 'text-rose-500 bg-rose-50 dark:bg-rose-500/10' },
  { label: tr('Komunikator'), icon: MessageCircle, to: '/komunikator', color: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
  { label: tr('Grupy'), icon: Home, to: '/home-groups', color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' },
  { label: tr('Finanse'), icon: Wallet, to: '/finance', color: 'text-teal-500 bg-teal-50 dark:bg-teal-500/10' },
  { label: tr('Szukaj'), icon: Search, action: openCommandPalette, color: 'text-gray-500 bg-gray-100 dark:bg-gray-700/50' },
];

export default function QuickAccessWidget() {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.label}
            onClick={() => (a.action ? a.action() : navigate(a.to))}
            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-700/60 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all"
          >
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.color}`}>
              <Icon size={18} />
            </span>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 text-center leading-tight">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
