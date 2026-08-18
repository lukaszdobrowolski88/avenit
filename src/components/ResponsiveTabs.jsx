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

  // Styl Monday: zakładki jako wiersz z dolną linią; aktywna = podkreślenie akcentem
  // (nie wypełniony gradient-pill). Lekko, czysto — wspólne dla mobile i desktop.
  const tabClass = (isActive) =>
    `flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 -mb-px border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
      isActive
        ? 'border-accent-primary text-accent-primary'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
    }`;

  return (
    <div className={className}>
      {/* Mobile - przewijalny wiersz z podkreśleniem */}
      <div className="lg:hidden -mx-4 px-4 border-b border-gray-200 dark:border-gray-700">
        <div
          ref={scrollContainerRef}
          className="flex gap-1 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                data-tour={tab.tour}
                onClick={() => onChange(tab.id)}
                className={tabClass(isActive)}
              >
                {TabIcon && <TabIcon size={16} />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop - wiersz z podkreśleniem */}
      <div className="hidden lg:block border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 flex-wrap">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                data-tour={tab.tour}
                onClick={() => onChange(tab.id)}
                className={tabClass(isActive)}
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
