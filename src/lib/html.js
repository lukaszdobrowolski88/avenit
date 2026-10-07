// Escapowanie danych wstawianych do HTML-a budowanego ręcznie (wydruki, okna document.write).
// Dane z bazy (imiona darczyńców z publicznej strony /give, tytuły pieśni, imiona dzieci)
// mogą zawierać znaczniki — bez escapowania okno wydruku wykonałoby skrypt z sesją aplikacji.
export function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
