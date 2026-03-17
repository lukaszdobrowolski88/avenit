// Formatowanie daty wiadomości
export const formatMessageDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } else if (messageDate.getTime() === yesterday.getTime()) {
    return 'Wczoraj';
  } else if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('pl-PL', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  }
};

// Formatowanie czasu wiadomości
export const formatMessageTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
};

// Grupowanie wiadomości po dacie
export const groupMessagesByDate = (messages) => {
  const groups = {};

  messages.forEach(message => {
    const date = new Date(message.created_at);
    const dateKey = date.toLocaleDateString('pl-PL', {
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

// Pobieranie inicjałów z imienia
export const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

// Generowanie koloru na podstawie stringa (dla avatarów)
export const stringToColor = (str) => {
  if (!str) return '#6b7280';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#ec4899', // pink
    '#8b5cf6', // purple
    '#3b82f6', // blue
    '#14b8a6', // teal
    '#22c55e', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#6366f1', // indigo
  ];
  return colors[Math.abs(hash) % colors.length];
};

// Mapowanie kluczy służb na nazwy
export const ministryKeyToName = {
  worship_team: 'Zespół Uwielbienia',
  media_team: 'Media Team',
  atmosfera_team: 'Atmosfera Team',
  kids_ministry: 'Małe SchWro',
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
