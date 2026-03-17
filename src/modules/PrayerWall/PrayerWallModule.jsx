import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../hooks/useUserRole';
import {
  Heart,
  Plus,
  Filter,
  Search,
  User,
  UserX,
  Sparkles,
  HeartHandshake,
  Clock,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  Ghost,
  Star,
  Pencil,
  UserPlus,
  CheckCircle,
  XCircle
} from 'lucide-react';

// ============================================
// KONFIGURACJA KATEGORII
// ============================================

const CATEGORIES = {
  zdrowie: { label: 'Zdrowie', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '❤️' },
  rodzina: { label: 'Rodzina', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: '👨‍👩‍👧‍👦' },
  finanse: { label: 'Finanse', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: '💰' },
  duchowe: { label: 'Duchowe', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: '🙏' },
  inne: { label: 'Inne', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: '✨' }
};

// ============================================
// SKELETON LOADER
// ============================================

function PrayerCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
        </div>
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
      </div>
      <div className="flex justify-between items-center">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-full w-24" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
      </div>
    </div>
  );
}

// ============================================
// KOMPONENT KARTY MODLITWY
// ============================================

function PrayerRequestCard({
  request,
  currentUserEmail,
  onPray,
  onEdit,
  onDelete,
  onMarkAnswered,
  userAvatars
}) {
  const [isPraying, setIsPraying] = useState(false);
  const isAuthor = request.user_email === currentUserEmail;
  const hasPrayed = request.praying_users?.includes(currentUserEmail);
  const isAnswered = request.status === 'answered';

  const handlePrayClick = async () => {
    if (isPraying) return;
    setIsPraying(true);
    await onPray(request.id, hasPrayed);
    setIsPraying(false);
  };

  const authorName = request.is_anonymous
    ? 'Członek Społeczności'
    : request.user_name || request.user_email?.split('@')[0];

  const avatarUrl = !request.is_anonymous && userAvatars[request.user_email];

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Przed chwilą';
    if (diffMins < 60) return `${diffMins} min temu`;
    if (diffHours < 24) return `${diffHours} godz. temu`;
    if (diffDays < 7) return `${diffDays} dni temu`;
    return date.toLocaleDateString('pl-PL');
  };

  return (
    <div
      className={`
        relative bg-white dark:bg-gray-800 rounded-2xl p-5
        border-2 transition-all duration-300 hover:shadow-lg
        ${isAnswered
          ? 'border-amber-300 dark:border-amber-500/50 bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-900/20 dark:to-yellow-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-500/30'
        }
      `}
    >
      {/* Świadectwo Badge */}
      {isAnswered && (
        <div className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 shadow-md">
          <Star className="w-3 h-3" />
          Świadectwo
        </div>
      )}

      {/* Nagłówek */}
      <div className="flex items-center gap-3 mb-4">
        {request.is_anonymous ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
            <Ghost className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </div>
        ) : avatarUrl ? (
          <img
            src={avatarUrl}
            alt={authorName}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-gray-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white font-semibold">
            {authorName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
            {authorName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(request.created_at)}
          </p>
        </div>

        {/* Badge kategorii */}
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORIES[request.category]?.color}`}>
          {CATEGORIES[request.category]?.icon} {CATEGORIES[request.category]?.label}
        </span>
      </div>

      {/* Kto zgłasza */}
      {request.requester_name && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4 text-pink-500" />
          <span className="text-gray-600 dark:text-gray-400">Modlitwa za:</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{request.requester_name}</span>
        </div>
      )}

      {/* Treść */}
      <p className="text-gray-700 dark:text-gray-300 mb-4 whitespace-pre-wrap leading-relaxed">
        {request.content}
      </p>

      {/* Status aktualności */}
      {request.is_active === false && (
        <div className="mb-3">
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" />
            Nieaktualna
          </span>
        </div>
      )}

      {/* Świadectwo - odpowiedź na modlitwę */}
      {isAnswered && request.answered_testimony && (
        <div className="bg-amber-50/80 dark:bg-amber-900/30 rounded-xl p-3 mb-4 border border-amber-200 dark:border-amber-700/50">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Świadectwo wysłuchania
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {request.answered_testimony}
          </p>
        </div>
      )}

      {/* Badge widoczności dla autora */}
      {isAuthor && request.visibility === 'leaders_only' && (
        <div className="mb-3">
          <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-full">
            🔒 Tylko dla liderów
          </span>
        </div>
      )}

      {/* Stopka */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
        {/* Przycisk Modlę się */}
        <button
          onClick={handlePrayClick}
          disabled={isPraying}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
            transition-all duration-300 transform
            ${hasPrayed
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md hover:shadow-lg hover:scale-105'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-600 dark:hover:text-pink-400'
            }
            ${isPraying ? 'opacity-70 cursor-not-allowed' : ''}
          `}
        >
          {isPraying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <HeartHandshake className={`w-4 h-4 ${hasPrayed ? 'fill-current' : ''}`} />
          )}
          <span>Modlę się</span>
          <span className={`
            px-2 py-0.5 rounded-full text-xs
            ${hasPrayed
              ? 'bg-white/20'
              : 'bg-gray-200 dark:bg-gray-600'
            }
          `}>
            {request.prayer_count || 0}
          </span>
        </button>

        {/* Akcje autora */}
        {isAuthor && (
          <div className="flex items-center gap-2">
            {request.status === 'active' && (
              <button
                onClick={() => onMarkAnswered(request)}
                className="p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition"
                title="Oznacz jako wysłuchaną"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onEdit(request)}
              className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
              title="Edytuj"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(request.id)}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              title="Usuń"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// MODAL DODAWANIA/EDYCJI
// ============================================

function PrayerModal({ isOpen, onClose, onSubmit, editingRequest, isLoading }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('duchowe');
  const [visibility, setVisibility] = useState('public');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [requesterName, setRequesterName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [testimony, setTestimony] = useState('');
  const [markAsAnswered, setMarkAsAnswered] = useState(false);

  useEffect(() => {
    if (editingRequest) {
      setContent(editingRequest.content || '');
      setCategory(editingRequest.category || 'duchowe');
      setVisibility(editingRequest.visibility || 'public');
      setIsAnonymous(editingRequest.is_anonymous || false);
      setRequesterName(editingRequest.requester_name || '');
      setIsActive(editingRequest.is_active !== false);
      setTestimony(editingRequest.answered_testimony || '');
      setMarkAsAnswered(editingRequest.status === 'answered');
    } else {
      setContent('');
      setCategory('duchowe');
      setVisibility('public');
      setIsAnonymous(false);
      setRequesterName('');
      setIsActive(true);
      setTestimony('');
      setMarkAsAnswered(false);
    }
  }, [editingRequest, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    onSubmit({
      content: content.trim(),
      category,
      visibility,
      is_anonymous: isAnonymous,
      requester_name: requesterName.trim() || null,
      // Jeśli modlitwa wysłuchana, automatycznie oznacz jako nieaktualna
      is_active: markAsAnswered ? false : isActive,
      status: markAsAnswered ? 'answered' : 'active',
      answered_testimony: markAsAnswered ? testimony.trim() : null
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
        {/* Nagłówek */}
        <div className="bg-gradient-to-r from-pink-600 to-orange-600 p-5 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Heart className="w-6 h-6" />
              {editingRequest ? 'Edytuj intencję' : 'Nowa intencja modlitewna'}
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formularz */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Kto zgłasza (opcjonalne) */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Modlitwa za (opcjonalne)
            </label>
            <div className="relative">
              <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="Imię osoby, za którą się modlimy..."
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/50 dark:text-white"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Zostaw puste, jeśli modlisz się za siebie</p>
          </div>

          {/* Treść */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Treść intencji modlitewnej
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Podziel się swoją prośbą modlitewną..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/50 dark:text-white resize-none"
              required
            />
          </div>

          {/* Kategoria */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Kategoria
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(CATEGORIES).map(([key, { label, icon, color }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`
                    px-3 py-2 rounded-xl text-sm font-medium transition-all
                    ${category === key
                      ? `${color} ring-2 ring-offset-2 ring-pink-500`
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Widoczność */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Widoczność
            </label>
            <div className="flex gap-3">
              <label className={`
                flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                ${visibility === 'public'
                  ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/30'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                }
              `}>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="sr-only"
                />
                <User className={`w-5 h-5 ${visibility === 'public' ? 'text-pink-500' : 'text-gray-400'}`} />
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200">Publiczna</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Widoczna dla wszystkich</p>
                </div>
              </label>

              <label className={`
                flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                ${visibility === 'leaders_only'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                }
              `}>
                <input
                  type="radio"
                  name="visibility"
                  value="leaders_only"
                  checked={visibility === 'leaders_only'}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="sr-only"
                />
                <UserX className={`w-5 h-5 ${visibility === 'leaders_only' ? 'text-indigo-500' : 'text-gray-400'}`} />
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200">Tylko liderzy</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Poufna prośba</p>
                </div>
              </label>
            </div>
          </div>

          {/* Anonimowość */}
          <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-pink-500 focus:ring-pink-500"
            />
            <Ghost className="w-5 h-5 text-gray-500" />
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Dodaj anonimowo</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Twoje imię nie będzie widoczne dla innych
              </p>
            </div>
          </label>

          {/* Status aktualności i wysłuchania (tylko przy edycji) */}
          {editingRequest && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
              {/* Status aktualności */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Status intencji
                </label>
                <div className="flex gap-3">
                  <label className={`
                    flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                    ${isActive
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                    }
                  `}>
                    <input
                      type="radio"
                      name="isActive"
                      checked={isActive}
                      onChange={() => setIsActive(true)}
                      className="sr-only"
                    />
                    <CheckCircle className={`w-5 h-5 ${isActive ? 'text-green-500' : 'text-gray-400'}`} />
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">Aktualna</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Nadal potrzebuję modlitwy</p>
                    </div>
                  </label>

                  <label className={`
                    flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                    ${!isActive
                      ? 'border-gray-500 bg-gray-50 dark:bg-gray-700'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                    }
                  `}>
                    <input
                      type="radio"
                      name="isActive"
                      checked={!isActive}
                      onChange={() => setIsActive(false)}
                      className="sr-only"
                    />
                    <XCircle className={`w-5 h-5 ${!isActive ? 'text-gray-500' : 'text-gray-400'}`} />
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">Nieaktualna</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Nie potrzebuję już modlitwy</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modlitwa wysłuchana */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/50 transition">
                <input
                  type="checkbox"
                  checked={markAsAnswered}
                  onChange={(e) => setMarkAsAnswered(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <Star className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200">Modlitwa wysłuchana!</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Podziel się świadectwem z innymi
                  </p>
                </div>
              </label>

              {markAsAnswered && (
                <div className="mt-3">
                  <textarea
                    value={testimony}
                    onChange={(e) => setTestimony(e.target.value)}
                    placeholder="Opisz, jak Bóg odpowiedział na Twoją modlitwę..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-white resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Przyciski */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-orange-600 text-white font-medium hover:from-pink-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Zapisywanie...
                </>
              ) : (
                <>
                  <Heart className="w-5 h-5" />
                  {editingRequest ? 'Zapisz zmiany' : 'Dodaj intencję'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// MODAL POTWIERDZENIA WYSŁUCHANIA
// ============================================

function AnsweredModal({ isOpen, onClose, onSubmit, request, isLoading }) {
  const [testimony, setTestimony] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTestimony('');
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(request.id, testimony.trim());
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="p-5">
          <div className="text-center mb-5">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center mb-3">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              Chwała Bogu!
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Podziel się świadectwem wysłuchania modlitwy
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={testimony}
              onChange={(e) => setTestimony(e.target.value)}
              placeholder="Jak Bóg odpowiedział na Twoją modlitwę? (opcjonalnie)"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-white resize-none"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-white font-medium hover:from-amber-500 hover:to-yellow-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Star className="w-5 h-5" />
                    Potwierdź
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// GŁÓWNY MODUŁ
// ============================================

export default function PrayerWallModule() {
  const { userRole, loading: roleLoading } = useUserRole();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userAvatars, setUserAvatars] = useState({});

  // Filtry i wyszukiwanie
  const [filter, setFilter] = useState('all'); // all, mine, answered
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active'); // all, active, inactive - domyślnie pokazuj tylko aktualne
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answeredModal, setAnsweredModal] = useState({ isOpen: false, request: null });

  // Pobierz aktualnego użytkownika
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        // Pobierz dane użytkownika z app_users
        const { data: appUser, error } = await supabase
          .from('app_users')
          .select('full_name')
          .eq('email', user.email)
          .maybeSingle();

        if (appUser && !error) {
          setCurrentUser(prev => ({
            ...prev,
            fullName: appUser.full_name || ''
          }));
        }
      }
    };
    fetchUser();
  }, []);

  // Pobierz prośby modlitewne
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Pobierz prośby z licznikiem modlitw
      let query = supabase
        .from('prayer_requests')
        .select('*')
        .order('created_at', { ascending: false });

      // Filtr statusu
      if (filter === 'answered') {
        query = query.eq('status', 'answered');
      } else if (filter !== 'mine') {
        query = query.neq('status', 'archived');
      }

      const { data: requestsData, error: requestsError } = await query;

      if (requestsError) throw requestsError;

      // Pobierz interakcje dla wszystkich prośb (tylko jeśli są jakieś prośby)
      let interactionsData = [];
      const requestIds = requestsData.map(r => r.id).filter(Boolean);
      if (requestIds.length > 0) {
        const { data } = await supabase
          .from('prayer_interactions')
          .select('request_id, user_email')
          .in('request_id', requestIds);
        interactionsData = data || [];
      }

      // Połącz dane
      const requestsWithCounts = requestsData.map(request => {
        const interactions = interactionsData.filter(i => i.request_id === request.id);
        return {
          ...request,
          prayer_count: interactions.length,
          praying_users: interactions.map(i => i.user_email)
        };
      });

      setRequests(requestsWithCounts);

      // Pobierz avatary użytkowników (tylko jeśli są jakieś emaile)
      const emails = [...new Set(requestsData.map(r => r.user_email).filter(Boolean))];
      if (emails.length > 0) {
        const { data: usersData } = await supabase
          .from('app_users')
          .select('email, avatar_url')
          .in('email', emails);

        if (usersData) {
          const avatars = {};
          usersData.forEach(u => {
            if (u.avatar_url) avatars[u.email] = u.avatar_url;
          });
          setUserAvatars(avatars);
        }
      }

    } catch (err) {
      console.error('Błąd pobierania prośb:', err);
      setError('Nie udało się pobrać prośb modlitewnych');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Role które mogą widzieć prośby "tylko dla liderów"
  const leaderRoles = ['superadmin', 'rada_starszych', 'koordynator', 'lider'];
  const isLeader = leaderRoles.includes(userRole);

  // Filtrowanie prośb
  const filteredRequests = requests.filter(request => {
    // Filtr widoczności leaders_only - tylko liderzy mogą widzieć (lub autor)
    if (request.visibility === 'leaders_only') {
      const isAuthor = request.user_email === currentUser?.email;
      if (!isLeader && !isAuthor) {
        return false;
      }
    }

    // Filtr "Moje"
    if (filter === 'mine' && request.user_email !== currentUser?.email) {
      return false;
    }

    // Filtr kategorii
    if (categoryFilter !== 'all' && request.category !== categoryFilter) {
      return false;
    }

    // Filtr aktualności
    if (activeFilter === 'active' && request.is_active === false) {
      return false;
    }
    if (activeFilter === 'inactive' && request.is_active !== false) {
      return false;
    }

    // Wyszukiwanie
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesContent = request.content.toLowerCase().includes(search);
      const matchesAuthor = !request.is_anonymous &&
        (request.user_name?.toLowerCase().includes(search) ||
         request.user_email?.toLowerCase().includes(search));
      if (!matchesContent && !matchesAuthor) {
        return false;
      }
    }

    return true;
  });

  // Obsługa "Modlę się" z Optimistic UI
  const handlePray = async (requestId, alreadyPraying) => {
    if (!currentUser) return;

    // Optimistic update
    setRequests(prev => prev.map(req => {
      if (req.id !== requestId) return req;

      if (alreadyPraying) {
        return {
          ...req,
          prayer_count: Math.max(0, req.prayer_count - 1),
          praying_users: req.praying_users.filter(e => e !== currentUser.email)
        };
      } else {
        return {
          ...req,
          prayer_count: req.prayer_count + 1,
          praying_users: [...req.praying_users, currentUser.email]
        };
      }
    }));

    try {
      if (alreadyPraying) {
        // Usuń interakcję
        await supabase
          .from('prayer_interactions')
          .delete()
          .eq('request_id', requestId)
          .eq('user_email', currentUser.email);
      } else {
        // Dodaj interakcję
        await supabase
          .from('prayer_interactions')
          .insert({
            request_id: requestId,
            user_id: currentUser.id,
            user_email: currentUser.email
          });
      }
    } catch (err) {
      console.error('Błąd interakcji:', err);
      // Rollback optimistic update
      fetchRequests();
    }
  };

  // Dodaj/Edytuj prośbę
  const handleSubmit = async (formData) => {
    if (!currentUser) return;
    setIsSubmitting(true);

    try {
      if (editingRequest) {
        // Aktualizacja
        const { error } = await supabase
          .from('prayer_requests')
          .update({
            content: formData.content,
            category: formData.category,
            visibility: formData.visibility,
            is_anonymous: formData.is_anonymous,
            requester_name: formData.requester_name,
            is_active: formData.is_active,
            status: formData.status,
            answered_testimony: formData.answered_testimony
          })
          .eq('id', editingRequest.id);

        if (error) throw error;
      } else {
        // Nowa prośba
        const { error } = await supabase
          .from('prayer_requests')
          .insert({
            user_id: currentUser.id,
            user_email: currentUser.email,
            user_name: currentUser.fullName || currentUser.email?.split('@')[0],
            content: formData.content,
            category: formData.category,
            visibility: formData.visibility,
            is_anonymous: formData.is_anonymous,
            requester_name: formData.requester_name,
            is_active: true,
            status: 'active'
          });

        if (error) throw error;
      }

      setIsModalOpen(false);
      setEditingRequest(null);
      fetchRequests();
    } catch (err) {
      console.error('Błąd zapisywania:', err);
      setError('Nie udało się zapisać prośby');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Usuń prośbę
  const handleDelete = async (requestId) => {
    if (!confirm('Czy na pewno chcesz usunąć tę intencję?')) return;

    try {
      const { error } = await supabase
        .from('prayer_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;
      fetchRequests();
    } catch (err) {
      console.error('Błąd usuwania:', err);
      setError('Nie udało się usunąć prośby');
    }
  };

  // Oznacz jako wysłuchaną
  const handleMarkAnswered = async (requestId, testimony) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('prayer_requests')
        .update({
          status: 'answered',
          answered_testimony: testimony || null,
          is_active: false // Automatycznie oznacz jako nieaktualna
        })
        .eq('id', requestId);

      if (error) throw error;

      setAnsweredModal({ isOpen: false, request: null });
      fetchRequests();
    } catch (err) {
      console.error('Błąd aktualizacji statusu:', err);
      setError('Nie udało się zaktualizować statusu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Otwórz modal edycji
  const handleEdit = (request) => {
    setEditingRequest(request);
    setIsModalOpen(true);
  };

  // Otwórz modal wysłuchania
  const handleOpenAnsweredModal = (request) => {
    setAnsweredModal({ isOpen: true, request });
  };

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 dark:border-pink-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Centrum Modlitwy
        </h1>
        <button
          onClick={() => {
            setEditingRequest(null);
            setIsModalOpen(true);
          }}
          className="bg-gradient-to-r from-pink-600 to-orange-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
        >
          <Plus size={18} /> Dodaj intencję
        </button>
      </div>

      {/* Główna sekcja */}
      <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar z filtrami - Desktop */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtry
            </h3>

            {/* Główne filtry */}
            <div className="space-y-2 mb-6">
              <button
                onClick={() => { setFilter('all'); setCategoryFilter('all'); setActiveFilter('all'); }}
                className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center gap-3 ${
                  filter === 'all'
                    ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-md'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Heart className="w-4 h-4" />
                Wszystkie
              </button>
              <button
                onClick={() => { setFilter('mine'); setCategoryFilter('all'); setActiveFilter('all'); }}
                className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center gap-3 ${
                  filter === 'mine'
                    ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-md'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <User className="w-4 h-4" />
                Moje intencje
              </button>
              <button
                onClick={() => { setFilter('answered'); setCategoryFilter('all'); setActiveFilter('all'); }}
                className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center gap-3 ${
                  filter === 'answered'
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-md'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Świadectwa
              </button>
            </div>

            {/* Status aktualności */}
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Status
            </h4>
            <div className="space-y-1 mb-6">
              <button
                onClick={() => setActiveFilter('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  activeFilter === 'all'
                    ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                Wszystkie
              </button>
              <button
                onClick={() => setActiveFilter('active')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                  activeFilter === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                <CheckCircle className="w-3 h-3" />
                Aktualne
              </button>
              <button
                onClick={() => setActiveFilter('inactive')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                  activeFilter === 'inactive'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                <XCircle className="w-3 h-3" />
                Nieaktualne
              </button>
            </div>

            {/* Kategorie */}
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Kategorie
            </h4>
            <div className="space-y-1">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  categoryFilter === 'all'
                    ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                Wszystkie kategorie
              </button>
              {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    categoryFilter === key
                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </aside>

          {/* Główna zawartość */}
          <main className="flex-1 min-w-0">
            {/* Wyszukiwarka i filtry mobilne */}
            <div className="mb-6 space-y-4">
              {/* Wyszukiwarka */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Szukaj intencji..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500/50 dark:text-white"
                />
              </div>

              {/* Filtry mobilne */}
              <div className="lg:hidden">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-medium"
                >
                  <Filter className="w-4 h-4" />
                  Filtry
                  <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>

                {showFilters && (
                  <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setFilter('all'); setCategoryFilter('all'); setActiveFilter('all'); }}
                        className={`px-3 py-1.5 rounded-full text-sm ${
                          filter === 'all'
                            ? 'bg-pink-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        Wszystkie
                      </button>
                      <button
                        onClick={() => { setFilter('mine'); setCategoryFilter('all'); setActiveFilter('all'); }}
                        className={`px-3 py-1.5 rounded-full text-sm ${
                          filter === 'mine'
                            ? 'bg-pink-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        Moje
                      </button>
                      <button
                        onClick={() => { setFilter('answered'); setCategoryFilter('all'); setActiveFilter('all'); }}
                        className={`px-3 py-1.5 rounded-full text-sm ${
                          filter === 'answered'
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        Świadectwa
                      </button>
                    </div>

                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      <option value="all">Wszystkie kategorie</option>
                      {Object.entries(CATEGORIES).map(([key, { label }]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>

                    <select
                      value={activeFilter}
                      onChange={(e) => setActiveFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      <option value="all">Wszystkie statusy</option>
                      <option value="active">Aktualne</option>
                      <option value="inactive">Nieaktualne</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Błąd */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-700 dark:text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Lista prośb */}
            {filteredRequests.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <Heart className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">
                  {filter === 'mine'
                    ? 'Nie masz jeszcze żadnych intencji'
                    : filter === 'answered'
                    ? 'Brak świadectw'
                    : 'Brak intencji modlitewnych'
                  }
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  {filter === 'mine'
                    ? 'Dodaj swoją pierwszą intencję modlitewną'
                    : 'Bądź pierwszą osobą, która doda intencję'
                  }
                </p>
                <button
                  onClick={() => {
                    setEditingRequest(null);
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white font-medium rounded-xl hover:from-pink-700 hover:to-orange-700 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Dodaj intencję
                </button>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRequests.map(request => (
                  <PrayerRequestCard
                    key={request.id}
                    request={request}
                    currentUserEmail={currentUser?.email}
                    onPray={handlePray}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onMarkAnswered={handleOpenAnsweredModal}
                    userAvatars={userAvatars}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </section>

      {/* Modals */}
      <PrayerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRequest(null);
        }}
        onSubmit={handleSubmit}
        editingRequest={editingRequest}
        isLoading={isSubmitting}
      />

      <AnsweredModal
        isOpen={answeredModal.isOpen}
        onClose={() => setAnsweredModal({ isOpen: false, request: null })}
        onSubmit={handleMarkAnswered}
        request={answeredModal.request}
        isLoading={isSubmitting}
      />
    </div>
  );
}
