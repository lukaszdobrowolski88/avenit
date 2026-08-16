// Gotowe szablony modułów — jednym kliknięciem tworzą moduł + zestaw zakładek.
// Każda zakładka: { component_type, label, icon }. Klucz zakładki generowany z typu.
// component_type musi być zgodny z TabEditor.COMPONENT_TYPES / ModuleWidget.WIDGET_TYPES.
export const MODULE_TEMPLATES = [
  {
    key: 'ministry_team', name: 'Zespół służby', icon: 'Users',
    description: 'Członkowie, grafik, dyżury, wydarzenia, finanse, materiały i wyposażenie',
    tabs: [
      { component_type: 'members', label: 'Członkowie', icon: 'Users' },
      { component_type: 'schedule', label: 'Grafik', icon: 'CalendarDays' },
      { component_type: 'duty', label: 'Służby', icon: 'UserCog' },
      { component_type: 'events', label: 'Wydarzenia', icon: 'Calendar' },
      { component_type: 'finance', label: 'Finanse', icon: 'DollarSign' },
      { component_type: 'materials', label: 'Materiały', icon: 'FolderOpen' },
      { component_type: 'equipment', label: 'Wyposażenie', icon: 'Package' },
    ],
  },
  {
    key: 'event', name: 'Wydarzenie / Konferencja', icon: 'CalendarDays',
    description: 'Wydarzenia, zadania, tablica projektowa, materiały, linki i kontakty',
    tabs: [
      { component_type: 'events', label: 'Wydarzenia', icon: 'Calendar' },
      { component_type: 'tasks', label: 'Zadania', icon: 'CheckSquare' },
      { component_type: 'board', label: 'Tablica', icon: 'LayoutGrid' },
      { component_type: 'materials', label: 'Materiały', icon: 'FolderOpen' },
      { component_type: 'links', label: 'Szybkie linki', icon: 'Link2' },
      { component_type: 'contacts', label: 'Kontakty', icon: 'Contact' },
    ],
  },
  {
    key: 'community', name: 'Grupa / Wspólnota', icon: 'Heart',
    description: 'Członkowie, wydarzenia, ściana z wpisami, galeria i kontakty',
    tabs: [
      { component_type: 'members', label: 'Członkowie', icon: 'Users' },
      { component_type: 'events', label: 'Wydarzenia', icon: 'Calendar' },
      { component_type: 'wall', label: 'Ściana', icon: 'MessageSquare' },
      { component_type: 'gallery', label: 'Galeria', icon: 'GalleryThumbnails' },
      { component_type: 'contacts', label: 'Kontakty', icon: 'Contact' },
    ],
  },
  {
    key: 'catalog', name: 'Baza / Katalog', icon: 'Database',
    description: 'Tablica projektowa, kontakty, szybkie linki i materiały',
    tabs: [
      { component_type: 'board', label: 'Tablica', icon: 'LayoutGrid' },
      { component_type: 'contacts', label: 'Kontakty', icon: 'Contact' },
      { component_type: 'links', label: 'Szybkie linki', icon: 'Link2' },
      { component_type: 'materials', label: 'Materiały', icon: 'FolderOpen' },
    ],
  },
];
