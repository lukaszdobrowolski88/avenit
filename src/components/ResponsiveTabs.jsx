import React, { useRef, useEffect } from 'react';

/**
 * ResponsiveTabs - Responsywny komponent zakładek
 * Na desktop pokazuje wszystkie zakładki w jednej linii
 * Na mobile pokazuje przewijalne zakładki w stylu "pill tabs"
 */
export default function ResponsiveTabs({ tabs, activeTab, onChange, className = '' }) {
  const scrollContainerRef = useRef(null);
  const activeTabRef = useRef(null);

  // Przewiń do aktywnej zakładki na mobile
  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeElement = activeTabRef.current;

      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();

      // Sprawdź czy aktywna zakładka jest poza widokiem
      if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
        activeElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

  return (
    <div className={className}>
      {/* Mobile - Horizontal scrollable tabs */}
      <div className="lg:hidden -mx-4 px-4">
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                onClick={() => onChange(tab.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-lg shadow-pink-500/30'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600 hover:text-pink-600 dark:hover:text-pink-400'
                }`}
              >
                {TabIcon && <TabIcon size={16} className={isActive ? 'text-white' : ''} />}
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
        {/* Gradient fade na krawędziach */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent lg:hidden" style={{ display: 'none' }} />
      </div>

      {/* Desktop tabs */}
      <div className="hidden lg:block">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-2 inline-flex gap-2 flex-wrap">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`px-4 xl:px-6 py-2.5 rounded-xl font-medium transition text-sm flex items-center gap-2 ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {TabIcon && <TabIcon size={16} />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
