import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Clock, Lock, Star, Sparkles, HeartHandshake, XCircle, UserPlus, X, Ghost, User, UserX, Loader2, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const CATEGORIES = {
  zdrowie: { label: 'Zdrowie', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '❤️' },
  rodzina: { label: 'Rodzina', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: '👨‍👩‍👧‍👦' },
  finanse: { label: 'Finanse', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: '💰' },
  duchowe: { label: 'Duchowe', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: '🙏' },
  inne: { label: 'Inne', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: '✨' }
};

// ============================================
// PRAYER MODAL
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
      is_active: markAsAnswered ? false : isActive,
      status: markAsAnswered ? 'answered' : 'active',
      answered_testimony: markAsAnswered ? testimony.trim() : null
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
        {/* Header */}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Requester name */}
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

          {/* Content */}
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

          {/* Category */}
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

          {/* Visibility */}
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

          {/* Anonymous */}
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

          {/* Status (only when editing) */}
          {editingRequest && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
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

              {/* Answered */}
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

          {/* Buttons */}
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
// PRAYER CARD
// ============================================

function PrayerCard({ prayer, onClick }) {
  const category = CATEGORIES[prayer.category] || CATEGORIES.inne;
  const isAnswered = prayer.status === 'answered';
  const isInactive = prayer.is_active === false;

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
      onClick={onClick}
      className={`
        relative bg-white dark:bg-gray-800 rounded-2xl p-4
        border-2 transition-all duration-300 hover:shadow-lg cursor-pointer
        ${isAnswered
          ? 'border-amber-300 dark:border-amber-500/50 bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-900/20 dark:to-yellow-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-500/30'
        }
      `}
    >
      {/* Answered Badge */}
      {isAnswered && (
        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 shadow-md">
          <Star className="w-3 h-3" />
          Świadectwo
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${category.color}`}>
            {category.icon} {category.label}
          </span>
          {prayer.visibility === 'leaders_only' && (
            <Lock size={12} className="text-indigo-500 dark:text-indigo-400" />
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(prayer.created_at)}
        </span>
      </div>

      {/* Requester */}
      {prayer.requester_name && (
        <div className="mb-2 flex items-center gap-1 text-xs">
          <UserPlus className="w-3 h-3 text-pink-500" />
          <span className="text-gray-600 dark:text-gray-400">Za:</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{prayer.requester_name}</span>
        </div>
      )}

      {/* Content */}
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
        {prayer.content}
      </p>

      {/* Inactive status */}
      {isInactive && !isAnswered && (
        <div className="mt-2">
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" />
            Nieaktualna
          </span>
        </div>
      )}

      {/* Testimony */}
      {isAnswered && prayer.answered_testimony && (
        <div className="mt-3 bg-amber-50/80 dark:bg-amber-900/30 rounded-xl p-2 border border-amber-200 dark:border-amber-700/50">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Świadectwo wysłuchania
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 line-clamp-2">
            {prayer.answered_testimony}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <HeartHandshake size={14} className="text-pink-500" />
          <span>{prayer.prayer_count || 0} osób się modli</span>
        </div>
        {isAnswered && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            Modlitwa wysłuchana
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN WIDGET
// ============================================

export default function MyPrayersWidget({ prayers, userEmail, onRefresh, size = 'medium' }) {
  const [modalState, setModalState] = useState({ isOpen: false, prayer: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Get current user for editing
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: appUser } = await supabase
          .from('app_users')
          .select('full_name')
          .eq('email', user.email)
          .maybeSingle();

        setCurrentUser({
          ...user,
          fullName: appUser?.full_name || null
        });
      }
    };
    fetchUser();
  }, []);

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

  const handlePrayerClick = (prayer) => {
    setModalState({ isOpen: true, prayer });
  };

  const handleSubmit = async (formData) => {
    if (!currentUser) return;
    setIsSubmitting(true);

    try {
      if (modalState.prayer) {
        // Update
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
          .eq('id', modalState.prayer.id);

        if (error) throw error;
      } else {
        // Insert
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

      setModalState({ isOpen: false, prayer: null });
      onRefresh?.();
    } catch (err) {
      console.error('Error saving prayer:', err);
      alert('Błąd zapisu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine grid columns based on widget size
  const getGridClass = () => {
    switch (size) {
      case 'small':
        return 'grid-cols-1';
      case 'large':
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      case 'medium':
      default:
        return 'grid-cols-1 sm:grid-cols-2';
    }
  };

  if (!prayers || prayers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
          <Heart size={32} className="text-gray-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">
          Brak intencji modlitewnych
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Dodaj intencje w Centrum Modlitwy
        </p>
        <a
          href="/prayer"
          className="mt-4 px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all"
        >
          Przejdź do Centrum Modlitwy
        </a>
      </div>
    );
  }

  // For small size, show as list; for medium/large, show as grid
  const displayCount = size === 'small' ? 5 : (size === 'large' ? 8 : 6);

  return (
    <div className="space-y-3">
      <div className={`grid ${getGridClass()} gap-3`}>
        {prayers.slice(0, displayCount).map(prayer => (
          <PrayerCard
            key={prayer.id}
            prayer={prayer}
            onClick={() => handlePrayerClick(prayer)}
          />
        ))}
      </div>

      {prayers.length > displayCount && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          + {prayers.length - displayCount} więcej intencji
        </p>
      )}

      <a
        href="/prayer"
        className="block text-center text-sm text-pink-500 hover:text-pink-600 dark:text-pink-400 dark:hover:text-pink-300 font-medium py-2"
      >
        Zobacz wszystkie intencje →
      </a>

      {/* Modal */}
      <PrayerModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, prayer: null })}
        onSubmit={handleSubmit}
        editingRequest={modalState.prayer}
        isLoading={isSubmitting}
      />
    </div>
  );
}
