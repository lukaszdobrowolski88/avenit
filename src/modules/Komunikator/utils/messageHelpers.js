import { appLocale, tr } from '../../../i18n';
// Formatowanie daty wiadomości na liście rozmów (tak samo w aplikacji: logic.ts → formatListTime):
// dziś — godzina, wczoraj — „Wczoraj”, w tym tygodniu — dzień tygodnia, starsze — „7 paź”.
export const formatMessageDate = (dateString) => {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - messageDate.getTime()) / 86400000);

  if (diffDays <= 0) {
    return date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return tr('Wczoraj');
  } else if (diffDays < 7) {
    return date.toLocaleDateString(appLocale(), { weekday: 'long' });
  } else {
    return date.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
  }
};

// Separator dnia w wątku (jak w aplikacji): „Dzisiaj”, „Wczoraj”, dalej pełna data z dniem tygodnia.
export const formatDateSeparator = (dateString) => {
  const date = new Date(dateString);
  if (!dateString || !Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) return tr('Dzisiaj');
  if (diffDays === 1) return tr('Wczoraj');
  return date.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// Formatowanie czasu wiadomości
export const formatMessageTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
};

// Grupowanie wiadomości po dacie
export const groupMessagesByDate = (messages) => {
  const groups = {};

  messages.forEach(message => {
    const date = new Date(message.created_at);
    const dateKey = date.toLocaleDateString(appLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(message);
  });

  return groups;
};

// Formatowanie rozmiaru pliku
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// getInitials + stringToColor → wspólne źródło prawdy (src/utils/text.js). Re-eksport dla kompatybilności.
export { getInitials, stringToColor } from '../../../utils/text';

// Mapowanie kluczy służb na nazwy
export const ministryKeyToName = {
  worship_team: 'Zespół Uwielbienia',
  media_team: 'Media Team',
  atmosfera_team: 'Atmosfera Team',
  kids_ministry: 'Małe Avenit',
  home_groups: 'Liderzy Grup Domowych',
  youth_ministry: 'Młodzieżówka',
  prayer_team: 'Grupa Modlitewna',
  welcome_team: 'Zespół Powitalny',
  small_groups: 'Grupy Domowe',
  admin_team: 'Administracja',
};

// Pobieranie nazwy służby
export const getMinistryName = (ministryKey) => {
  return ministryKeyToName[ministryKey] || ministryKey;
};

// Sprawdzanie czy plik jest obrazem
export const isImageFile = (mimeType) => {
  return mimeType && mimeType.startsWith('image/');
};

// Pobieranie ikony dla typu pliku
export const getFileIcon = (mimeType) => {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('pdf')) return 'file-text';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'file-text';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'table';
  return 'file';
};

// Skracanie tekstu
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
