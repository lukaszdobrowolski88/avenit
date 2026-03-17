import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from 'lucide-react';
import { Search, X, ChevronDown } from 'lucide-react';

// Popularne ikony pogrupowane
const ICON_CATEGORIES = {
  'Popularne': [
    'Home', 'Users', 'User', 'Settings', 'Calendar', 'Heart', 'Star', 'Bell',
    'Search', 'Plus', 'Check', 'X', 'Menu', 'Mail', 'Phone', 'MapPin'
  ],
  'Użytkownicy': [
    'Users', 'User', 'UserPlus', 'UserMinus', 'UserCheck', 'UserX', 'UserCog',
    'Contact', 'Contact2', 'Baby', 'PersonStanding', 'Accessibility'
  ],
  'Media': [
    'Video', 'Camera', 'Image', 'Film', 'Tv', 'Music', 'Music2', 'Music3', 'Music4',
    'Mic', 'Mic2', 'Volume2', 'Play', 'Pause', 'SkipForward', 'SkipBack', 'Radio'
  ],
  'Komunikacja': [
    'MessageSquare', 'MessageCircle', 'Mail', 'Send', 'Phone', 'PhoneCall',
    'AtSign', 'Hash', 'Share', 'Share2', 'Forward', 'Reply', 'Inbox'
  ],
  'Finanse': [
    'DollarSign', 'CreditCard', 'Wallet', 'PiggyBank', 'Receipt', 'Banknote',
    'Coins', 'TrendingUp', 'TrendingDown', 'BarChart', 'PieChart', 'LineChart'
  ],
  'Religia': [
    'Heart', 'HeartHandshake', 'Flame', 'Sun', 'Moon', 'Sparkles', 'Lightbulb',
    'BookOpen', 'Book', 'ScrollText', 'GraduationCap', 'Cross', 'Church'
  ],
  'Kalendarz i czas': [
    'Calendar', 'CalendarDays', 'CalendarCheck', 'CalendarPlus', 'CalendarX',
    'Clock', 'Timer', 'AlarmClock', 'Watch', 'Hourglass', 'History'
  ],
  'Dokumenty': [
    'FileText', 'File', 'Files', 'Folder', 'FolderOpen', 'Archive', 'Clipboard',
    'ClipboardList', 'ClipboardCheck', 'NotebookPen', 'Notebook', 'BookMarked'
  ],
  'Zadania': [
    'CheckSquare', 'CheckCircle', 'Check', 'ListTodo', 'ListChecks', 'List',
    'ListOrdered', 'Kanban', 'Target', 'Flag', 'AlertCircle', 'AlertTriangle'
  ],
  'Nawigacja': [
    'Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ChevronLeft',
    'ChevronRight', 'ChevronUp', 'ChevronDown', 'ExternalLink', 'Link', 'Compass'
  ],
  'Narzędzia': [
    'Settings', 'Cog', 'Wrench', 'Tool', 'Hammer', 'Paintbrush', 'Palette',
    'Scissors', 'Trash2', 'Edit', 'Pencil', 'Copy', 'Save', 'Download', 'Upload'
  ],
  'Inne': [
    'Layers', 'Grid', 'Layout', 'Box', 'Package', 'Gift', 'Award', 'Trophy',
    'Zap', 'Bolt', 'Shield', 'Lock', 'Unlock', 'Key', 'Eye', 'EyeOff', 'Info'
  ]
};

// Wszystkie ikony w płaskiej liście
const ALL_ICONS = Object.values(ICON_CATEGORIES).flat();

export default function IconPicker({ value, onChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Popularne');
  const triggerRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Oblicz pozycję dropdowna
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 400;

      setPosition({
        top: spaceBelow < dropdownHeight ? rect.top - dropdownHeight - 8 : rect.bottom + 8,
        left: rect.left,
        width: Math.max(rect.width, 320)
      });
    }
  }, [isOpen]);

  // Zamknij przy kliknięciu na zewnątrz
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.icon-picker-dropdown')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Pobierz komponent ikony
  const getIconComponent = (iconName) => {
    return Icons[iconName] || Icons.Square;
  };

  // Filtruj ikony
  const getFilteredIcons = () => {
    if (search) {
      return ALL_ICONS.filter(icon =>
        icon.toLowerCase().includes(search.toLowerCase())
      );
    }
    return ICON_CATEGORIES[selectedCategory] || [];
  };

  const IconComponent = getIconComponent(value);
  const filteredIcons = getFilteredIcons();

  return (
    <div className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 transition-all
          ${isOpen
            ? 'border-pink-500 ring-2 ring-pink-500/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
          }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white">
            <IconComponent size={20} />
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-200">{value || 'Wybierz ikonę'}</span>
        </div>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && createPortal(
        <div
          className="icon-picker-dropdown fixed z-[200] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: 400
          }}
        >
          {/* Header z wyszukiwaniem */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Szukaj ikony..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Kategorie - tylko gdy nie ma wyszukiwania */}
          {!search && (
            <div className="flex gap-1 p-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
              {Object.keys(ICON_CATEGORIES).map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition
                    ${selectedCategory === category
                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {/* Grid ikon */}
          <div className="p-3 max-h-[280px] overflow-y-auto">
            {filteredIcons.length > 0 ? (
              <div className="grid grid-cols-6 gap-2">
                {filteredIcons.map(iconName => {
                  const Icon = getIconComponent(iconName);
                  const isSelected = value === iconName;

                  return (
                    <button
                      key={iconName}
                      onClick={() => {
                        onChange(iconName);
                        setIsOpen(false);
                      }}
                      title={iconName}
                      className={`p-3 rounded-xl flex items-center justify-center transition group
                        ${isSelected
                          ? 'bg-gradient-to-br from-pink-500 to-orange-500 text-white'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 hover:text-pink-600 dark:hover:text-pink-400'
                        }`}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                Nie znaleziono ikon dla "{search}"
              </div>
            )}
          </div>

          {/* Footer - nazwa wybranej ikony */}
          {value && (
            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Wybrana: <span className="font-medium text-gray-700 dark:text-gray-300">{value}</span>
              </span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
