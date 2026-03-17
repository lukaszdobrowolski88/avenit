import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Globe,
  Lock,
  XCircle,
  BarChart3,
  Link as LinkIcon,
  LayoutTemplate,
  Calendar,
  MessageSquare,
  Code,
  Archive,
  RotateCcw,
  Filter
} from 'lucide-react';

export default function FormList({
  forms,
  loading,
  onEdit,
  onDelete,
  onDuplicate,
  onPublish,
  onUnpublish,
  onClose,
  onViewResponses,
  onSaveAsTemplate,
  onEmbed,
  onArchive,
  onRestore
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const [viewFilter, setViewFilter] = useState('active'); // 'active' | 'archived' | 'all'
  const buttonRefs = useRef({});

  // Zamknij menu po kliknięciu poza nim lub scroll
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId) {
        setOpenMenuId(null);
      }
    };

    const handleScroll = () => {
      if (openMenuId) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [openMenuId]);

  const getStatusBadge = (status, isArchived) => {
    if (isArchived) {
      return (
        <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded-full">
          <Archive size={12} />
          Archiwum
        </span>
      );
    }

    switch (status) {
      case 'published':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
            <Globe size={12} />
            Opublikowany
          </span>
        );
      case 'closed':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
            <XCircle size={12} />
            Zamknięty
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
            <Lock size={12} />
            Wersja robocza
          </span>
        );
    }
  };

  const copyFormLink = (formId) => {
    const link = `${window.location.origin}/form/${formId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Oblicz pozycję menu względem viewportu
  const openMenu = (formId, buttonElement) => {
    if (!buttonElement) return;

    const rect = buttonElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const menuWidth = 192; // w-48 = 12rem = 192px
    const menuHeight = 380; // Przybliżona max wysokość menu

    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;

    // Jeśli menu nie zmieści się na dole, pokaż nad przyciskiem
    if (top + menuHeight > viewportHeight) {
      top = rect.top - menuHeight - 4;
    }

    // Jeśli nadal nie mieści się (za blisko góry), pokaż od góry viewportu
    if (top < 8) {
      top = 8;
    }

    // Upewnij się, że menu nie wychodzi poza prawą krawędź
    if (left + menuWidth > viewportWidth - 8) {
      left = viewportWidth - menuWidth - 8;
    }

    // Upewnij się, że menu nie wychodzi poza lewą krawędź
    if (left < 8) {
      left = 8;
    }

    setMenuPosition({ top, left });
    setOpenMenuId(formId);
  };

  const handleDeleteOrArchive = (form) => {
    if (form.response_count > 0) {
      // Ma odpowiedzi - archiwizuj
      if (window.confirm('Ten formularz ma zapisane odpowiedzi. Czy chcesz przenieść go do archiwum?')) {
        onArchive?.(form.id);
      }
    } else {
      // Brak odpowiedzi - można usunąć
      if (window.confirm('Czy na pewno chcesz usunąć ten formularz?')) {
        onDelete(form.id);
      }
    }
    setOpenMenuId(null);
  };

  // Filtrowanie formularzy
  const filteredForms = forms.filter(form => {
    if (viewFilter === 'active') return !form.is_archived;
    if (viewFilter === 'archived') return form.is_archived;
    return true; // 'all'
  });

  const activeCount = forms.filter(f => !f.is_archived).length;
  const archivedCount = forms.filter(f => f.is_archived).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtry widoku */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <button
            onClick={() => setViewFilter('active')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewFilter === 'active'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Aktywne ({activeCount})
          </button>
          <button
            onClick={() => setViewFilter('archived')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewFilter === 'archived'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Archive size={14} />
              Archiwum ({archivedCount})
            </span>
          </button>
          <button
            onClick={() => setViewFilter('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewFilter === 'all'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Wszystkie ({forms.length})
          </button>
        </div>
      </div>

      {filteredForms.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            {viewFilter === 'archived' ? (
              <Archive size={32} className="text-gray-400" />
            ) : (
              <FileText size={32} className="text-gray-400" />
            )}
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            {viewFilter === 'archived' ? 'Brak zarchiwizowanych formularzy' : 'Brak formularzy'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {viewFilter === 'archived'
              ? 'Zarchiwizowane formularze pojawią się tutaj'
              : 'Utwórz swój pierwszy formularz lub wybierz szablon'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredForms.map((form) => (
            <div
              key={form.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow ${
                form.is_archived ? 'opacity-75' : ''
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {form.title}
                    </h3>
                    {form.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {form.description}
                      </p>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      ref={el => buttonRefs.current[form.id] = el}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (openMenuId === form.id) {
                          setOpenMenuId(null);
                        } else {
                          openMenu(form.id, e.currentTarget);
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <MoreVertical size={18} />
                    </button>

                    {openMenuId === form.id && createPortal(
                      <div
                        className="fixed w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 max-h-[380px] overflow-y-auto"
                        style={{ top: menuPosition.top, left: menuPosition.left, zIndex: 9999 }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                          {!form.is_archived ? (
                            <>
                              <button
                                onClick={() => {
                                  onEdit(form);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <Edit size={16} />
                                Edytuj
                              </button>

                              <button
                                onClick={() => {
                                  onViewResponses(form);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <BarChart3 size={16} />
                                Odpowiedzi ({form.response_count || 0})
                              </button>

                              {form.status === 'published' && (
                                <>
                                  <button
                                    onClick={() => {
                                      copyFormLink(form.id);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <LinkIcon size={16} />
                                    {copiedId === form.id ? 'Skopiowano!' : 'Kopiuj link'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      onEmbed(form);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Code size={16} />
                                    Osadź na stronie
                                  </button>
                                </>
                              )}

                              <hr className="my-1 border-gray-200 dark:border-gray-700" />

                              {form.status === 'draft' && (
                                <button
                                  onClick={() => {
                                    onPublish(form.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Globe size={16} />
                                  Opublikuj
                                </button>
                              )}

                              {form.status === 'published' && (
                                <>
                                  <button
                                    onClick={() => {
                                      onUnpublish(form.id);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Lock size={16} />
                                    Cofnij publikację
                                  </button>
                                  <button
                                    onClick={() => {
                                      onClose(form.id);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <XCircle size={16} />
                                    Zamknij formularz
                                  </button>
                                </>
                              )}

                              {form.status === 'closed' && (
                                <button
                                  onClick={() => {
                                    onPublish(form.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Globe size={16} />
                                  Otwórz ponownie
                                </button>
                              )}

                              <hr className="my-1 border-gray-200 dark:border-gray-700" />

                              <button
                                onClick={() => {
                                  onDuplicate(form.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <Copy size={16} />
                                Duplikuj
                              </button>

                              <button
                                onClick={() => {
                                  onSaveAsTemplate(form.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <LayoutTemplate size={16} />
                                Zapisz jako szablon
                              </button>

                              <hr className="my-1 border-gray-200 dark:border-gray-700" />

                              {form.response_count > 0 ? (
                                <button
                                  onClick={() => handleDeleteOrArchive(form)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Archive size={16} />
                                  Archiwizuj
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleDeleteOrArchive(form)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Trash2 size={16} />
                                  Usuń
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {/* Menu dla zarchiwizowanych */}
                              <button
                                onClick={() => {
                                  onViewResponses(form);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <BarChart3 size={16} />
                                Odpowiedzi ({form.response_count || 0})
                              </button>

                              <hr className="my-1 border-gray-200 dark:border-gray-700" />

                              <button
                                onClick={() => {
                                  onRestore?.(form.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <RotateCcw size={16} />
                                Przywróć
                              </button>

                              <button
                                onClick={() => {
                                  if (window.confirm('Czy na pewno chcesz trwale usunąć ten formularz wraz ze wszystkimi odpowiedziami? Ta operacja jest nieodwracalna.')) {
                                    onDelete(form.id);
                                    setOpenMenuId(null);
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <Trash2 size={16} />
                                Usuń trwale
                              </button>
                            </>
                          )}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  {getStatusBadge(form.status, form.is_archived)}
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <MessageSquare size={12} />
                      {form.response_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(form.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
                {!form.is_archived ? (
                  <>
                    <button
                      onClick={() => onEdit(form)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    >
                      <Edit size={16} />
                      Edytuj
                    </button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                    <button
                      onClick={() => onViewResponses(form)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    >
                      <BarChart3 size={16} />
                      Odpowiedzi
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onRestore?.(form.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
                    >
                      <RotateCcw size={16} />
                      Przywróć
                    </button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                    <button
                      onClick={() => onViewResponses(form)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    >
                      <BarChart3 size={16} />
                      Odpowiedzi
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
