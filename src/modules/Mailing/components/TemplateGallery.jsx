import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText, Calendar, Megaphone, Newspaper, Plus, Edit, Copy, Trash2,
  MoreVertical, Loader, X, Eye, Search, Monitor, Smartphone, Star,
  Sparkles, Heart, Gift, Bell, Users, Church, BookOpen, Music
} from 'lucide-react';
import { useTemplates, TEMPLATE_CATEGORIES } from '../hooks/useTemplates';

const CATEGORY_ICONS = {
  general: FileText,
  newsletter: Newspaper,
  event: Calendar,
  announcement: Megaphone,
  welcome: Heart,
  holiday: Gift,
  invitation: Bell,
  ministry: Users,
  worship: Music,
  study: BookOpen
};

const EXTENDED_CATEGORIES = {
  ...TEMPLATE_CATEGORIES,
  welcome: { label: 'Powitalne', description: 'Szablony powitalne dla nowych członków' },
  holiday: { label: 'Świąteczne', description: 'Szablony na święta i okazje specjalne' },
  invitation: { label: 'Zaproszenia', description: 'Zaproszenia na wydarzenia' },
  ministry: { label: 'Służby', description: 'Komunikacja służb kościelnych' },
  worship: { label: 'Uwielbienie', description: 'Materiały zespołu uwielbienia' },
  study: { label: 'Studium', description: 'Materiały do studium biblijnego' }
};

export default function TemplateGallery({ onSelectTemplate, onEditTemplate, onCreateTemplate }) {
  const { templates, templatesByCategory, loading, deleteTemplate, duplicateTemplate } = useTemplates();
  const [activeCategory, setActiveCategory] = useState('all');
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRefs = useRef({});
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('template_favorites') || '[]');
    } catch {
      return [];
    }
  });

  const handleOpenMenu = (templateId, e) => {
    if (menuOpen === templateId) {
      setMenuOpen(null);
      return;
    }

    const button = menuButtonRefs.current[templateId];
    if (button) {
      const rect = button.getBoundingClientRect();
      // Pozycjonuj menu pod przyciskiem, wyrównane do prawej
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 192 // 192px = szerokość menu (w-48)
      });
    }
    setMenuOpen(templateId);
  };

  const toggleFavorite = (templateId) => {
    const newFavorites = favorites.includes(templateId)
      ? favorites.filter(id => id !== templateId)
      : [...favorites, templateId];
    setFavorites(newFavorites);
    localStorage.setItem('template_favorites', JSON.stringify(newFavorites));
  };

  const handleDelete = async (template) => {
    if (template.is_system) {
      alert('Nie można usunąć szablonu systemowego');
      return;
    }
    if (!confirm(`Czy na pewno chcesz usunąć szablon "${template.name}"?`)) return;

    try {
      await deleteTemplate(template.id);
    } catch (err) {
      alert('Błąd podczas usuwania szablonu');
    }
    setMenuOpen(null);
  };

  const handleDuplicate = async (template) => {
    try {
      await duplicateTemplate(template.id);
    } catch (err) {
      alert('Błąd podczas duplikowania szablonu');
    }
    setMenuOpen(null);
  };

  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Filtruj po kategorii
    if (activeCategory !== 'all') {
      result = result.filter(t => t.category === activeCategory);
    }

    // Filtruj po ulubionych
    if (showFavoritesOnly) {
      result = result.filter(t => favorites.includes(t.id));
    }

    // Filtruj po wyszukiwaniu
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.subject?.toLowerCase().includes(query) ||
        (EXTENDED_CATEGORIES[t.category]?.label || '').toLowerCase().includes(query)
      );
    }

    return result;
  }, [templates, activeCategory, showFavoritesOnly, favorites, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-pink-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Wyszukiwarka i filtry */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Pole wyszukiwania */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj szablonów..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Przycisk ulubionych */}
        <button
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            showFavoritesOnly
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-amber-300'
          }`}
        >
          <Star size={16} className={showFavoritesOnly ? 'fill-amber-500' : ''} />
          <span className="hidden sm:inline">Ulubione</span>
          {favorites.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              showFavoritesOnly ? 'bg-amber-200 dark:bg-amber-800' : 'bg-gray-100 dark:bg-gray-700'
            }`}>
              {favorites.length}
            </span>
          )}
        </button>
      </div>

      {/* Kategorie */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin">
        <CategoryButton
          active={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
          icon={FileText}
          count={templates.length}
        >
          Wszystkie
        </CategoryButton>
        {Object.entries(EXTENDED_CATEGORIES).map(([key, { label }]) => {
          const Icon = CATEGORY_ICONS[key] || FileText;
          const count = templates.filter(t => t.category === key).length;
          if (count === 0) return null;

          return (
            <CategoryButton
              key={key}
              active={activeCategory === key}
              onClick={() => setActiveCategory(key)}
              icon={Icon}
              count={count}
            >
              {label}
            </CategoryButton>
          );
        })}
      </div>

      {/* Siatka szablonów */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Nowy szablon */}
        {onCreateTemplate && (
          <button
            onClick={onCreateTemplate}
            className="group relative bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 rounded-xl border-2 border-dashed border-pink-300 dark:border-pink-700 hover:border-pink-500 dark:hover:border-pink-500 p-6 transition-all duration-200 flex flex-col items-center justify-center min-h-[200px]"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-orange-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-pink-500/30">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Nowy szablon</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Stwórz własny szablon</p>
          </button>
        )}

        {/* Szablony */}
        {filteredTemplates.map(template => {
          const CategoryIcon = CATEGORY_ICONS[template.category] || FileText;
          const isFavorite = favorites.includes(template.id);

          return (
            <div
              key={template.id}
              className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-700 transition-all duration-200"
            >
              {/* Podgląd HTML */}
              <div
                className="h-40 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative cursor-pointer"
                onClick={() => setPreviewTemplate(template)}
              >
                <div
                  className="absolute inset-0 transform scale-[0.25] origin-top-left w-[400%] h-[400%] pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: template.html_content }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-gray-800 via-transparent to-transparent opacity-70" />

                {/* Overlay z akcjami */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template); }}
                      className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:scale-110 transition-transform"
                      title="Podgląd"
                    >
                      <Eye size={18} className="text-gray-700 dark:text-gray-300" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectTemplate(template.id); }}
                      className="p-2 bg-pink-500 rounded-lg shadow-lg hover:scale-110 transition-transform"
                      title="Użyj szablonu"
                    >
                      <Edit size={18} className="text-white" />
                    </button>
                  </div>
                </div>

                {/* Badge ulubiony */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(template.id); }}
                  className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all ${
                    isFavorite
                      ? 'bg-amber-100 dark:bg-amber-900/50'
                      : 'bg-white/80 dark:bg-gray-800/80 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Star size={16} className={isFavorite ? 'fill-amber-500 text-amber-500' : 'text-gray-400'} />
                </button>

                {/* Badge systemowy */}
                {template.is_system && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-blue-500/90 text-white text-xs rounded-lg">
                    <Sparkles size={12} />
                    Systemowy
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {template.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <CategoryIcon size={12} />
                        {EXTENDED_CATEGORIES[template.category]?.label || 'Ogólne'}
                      </span>
                      {template.subject && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]" title={template.subject}>
                          "{template.subject}"
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Menu */}
                  <div className="relative">
                    <button
                      ref={el => menuButtonRefs.current[template.id] = el}
                      onClick={(e) => handleOpenMenu(template.id, e)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <MoreVertical size={16} className="text-gray-500" />
                    </button>

                    {menuOpen === template.id && (
                      <>
                        <div
                          className="fixed inset-0 z-[100]"
                          onClick={() => setMenuOpen(null)}
                        />
                        <div
                          className="fixed w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-[101]"
                          style={{ top: menuPosition.top, left: Math.max(8, menuPosition.left) }}
                        >
                          <button
                            onClick={() => { setPreviewTemplate(template); setMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Eye size={14} />
                            Podgląd
                          </button>
                          <button
                            onClick={() => { onSelectTemplate(template.id); setMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Plus size={14} />
                            Użyj szablonu
                          </button>
                          {onEditTemplate && (
                            <button
                              onClick={() => { onEditTemplate(template); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Edit size={14} />
                              {template.is_system ? 'Zobacz szablon' : 'Edytuj szablon'}
                            </button>
                          )}
                          <button
                            onClick={() => { toggleFavorite(template.id); setMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Star size={14} className={isFavorite ? 'fill-amber-500 text-amber-500' : ''} />
                            {isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                          </button>
                          <button
                            onClick={() => handleDuplicate(template)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Copy size={14} />
                            Duplikuj
                          </button>
                          {!template.is_system && (
                            <>
                              <hr className="my-1 border-gray-200 dark:border-gray-700" />
                              <button
                                onClick={() => handleDelete(template)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 size={14} />
                                Usuń
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Przycisk użyj */}
                <button
                  onClick={() => onSelectTemplate(template.id)}
                  className="w-full mt-3 py-2 text-sm font-medium text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 hover:bg-pink-100 dark:hover:bg-pink-900/30 rounded-lg transition-colors"
                >
                  Użyj szablonu
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            {showFavoritesOnly ? 'Brak ulubionych szablonów' : 'Brak szablonów w tej kategorii'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-sm text-pink-500 hover:text-pink-600"
            >
              Wyczyść wyszukiwanie
            </button>
          )}
        </div>
      )}

      {/* Modal podglądu szablonu */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          device={previewDevice}
          onDeviceChange={setPreviewDevice}
          onClose={() => setPreviewTemplate(null)}
          onUseTemplate={() => {
            onSelectTemplate(previewTemplate.id);
            setPreviewTemplate(null);
          }}
          isFavorite={favorites.includes(previewTemplate.id)}
          onToggleFavorite={() => toggleFavorite(previewTemplate.id)}
        />
      )}
    </div>
  );
}

// Modal podglądu szablonu
function TemplatePreviewModal({
  template,
  device,
  onDeviceChange,
  onClose,
  onUseTemplate,
  isFavorite,
  onToggleFavorite
}) {
  const CategoryIcon = CATEGORY_ICONS[template.category] || FileText;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-pink-500 to-orange-500 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                <CategoryIcon size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {template.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-white/80">
                    {EXTENDED_CATEGORIES[template.category]?.label || 'Ogólne'}
                  </span>
                  {template.is_system && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-white/20 text-white rounded-full">
                      <Sparkles size={10} />
                      Systemowy
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Przełącznik urządzenia */}
              <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-xl p-1">
                <button
                  onClick={() => onDeviceChange('desktop')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    device === 'desktop'
                      ? 'bg-white text-pink-600 shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                  title="Widok desktop"
                >
                  <Monitor size={16} />
                  <span className="text-xs font-medium hidden sm:inline">Desktop</span>
                </button>
                <button
                  onClick={() => onDeviceChange('mobile')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    device === 'mobile'
                      ? 'bg-white text-pink-600 shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                  title="Widok mobile"
                >
                  <Smartphone size={16} />
                  <span className="text-xs font-medium hidden sm:inline">Mobile</span>
                </button>
              </div>

              {/* Ulubiony */}
              <button
                onClick={onToggleFavorite}
                className={`p-2.5 rounded-xl transition-all ${
                  isFavorite
                    ? 'bg-white text-amber-500'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                title={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
              >
                <Star size={18} className={isFavorite ? 'fill-amber-500' : ''} />
              </button>

              {/* Zamknij */}
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X size={20} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Podgląd */}
        <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 p-6 flex justify-center">
          <div
            className={`bg-white shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 ${
              device === 'mobile' ? 'w-[375px]' : 'w-full max-w-[700px]'
            }`}
            style={{ minHeight: '500px' }}
          >
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                      img { max-width: 100%; height: auto; }
                    </style>
                  </head>
                  <body>${template.html_content}</body>
                </html>
              `}
              className="w-full h-full min-h-[500px] border-0"
              title="Podgląd szablonu"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/50">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {template.subject && (
              <span className="flex items-center gap-2">
                <span className="font-medium">Temat:</span> {template.subject}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all font-medium"
            >
              Anuluj
            </button>
            <button
              onClick={onUseTemplate}
              className="group px-6 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-pink-500/30 hover:shadow-xl flex items-center gap-2"
            >
              <Edit size={16} className="group-hover:scale-110 transition-transform" />
              Użyj szablonu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({ active, onClick, icon: Icon, count, children }) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-300 ${
        active
          ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30 scale-[1.02]'
          : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 hover:border-pink-200 dark:hover:border-pink-800/50 hover:shadow-md'
      }`}
    >
      <Icon size={16} className={active ? '' : 'group-hover:text-pink-500 transition-colors'} />
      {children}
      {count !== undefined && count > 0 && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
          active
            ? 'bg-white/20'
            : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-pink-100 dark:group-hover:bg-pink-900/30 group-hover:text-pink-600 dark:group-hover:text-pink-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
