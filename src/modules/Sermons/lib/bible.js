// Helpery odnośników biblijnych dla modułu Kazań.
// Parsuje polski zapis odnośnika (np. „J 3,16", „1 Kor 13,4-7", „Rdz 1,1-3")
// i buduje link do publicznego serwisu biblijnego (BibleGateway, wersja UBG —
// Uwspółcześniona Biblia Gdańska).

// Mapa najczęstszych polskich skrótów ksiąg -> pełna nazwa rozpoznawana przez BibleGateway.
// Klucze zapisane małymi literami, bez kropek.
const BOOK_ABBR = {
  // Stary Testament
  'rdz': 'Rodzaju', 'wj': 'Wyjścia', 'kpł': 'Kapłańska', 'kpl': 'Kapłańska',
  'lb': 'Liczb', 'pwt': 'Powtórzonego Prawa',
  'joz': 'Jozuego', 'joż': 'Jozuego', 'sdz': 'Sędziów', 'rt': 'Rut',
  '1sm': '1 Samuela', '2sm': '2 Samuela', '1krl': '1 Królewska', '2krl': '2 Królewska',
  '1krn': '1 Kronik', '2krn': '2 Kronik', 'ezd': 'Ezdrasza', 'ne': 'Nehemiasza',
  'est': 'Estery', 'hi': 'Hioba', 'job': 'Hioba', 'ps': 'Psalmów', 'prz': 'Przysłów',
  'koh': 'Kaznodziei', 'kzn': 'Kaznodziei', 'pnp': 'Pieśń nad Pieśniami',
  'iz': 'Izajasza', 'jr': 'Jeremiasza', 'lm': 'Lamentacje', 'ez': 'Ezechiela',
  'dn': 'Daniela', 'oz': 'Ozeasza', 'jl': 'Joela', 'am': 'Amosa', 'ab': 'Abdiasza',
  'jon': 'Jonasza', 'mi': 'Micheasza', 'na': 'Nahuma', 'ha': 'Habakuka',
  'so': 'Sofoniasza', 'ag': 'Aggeusza', 'za': 'Zachariasza', 'ml': 'Malachiasza',
  // Nowy Testament
  'mt': 'Mateusza', 'mk': 'Marka', 'łk': 'Łukasza', 'lk': 'Łukasza',
  'j': 'Jana', 'jn': 'Jana', 'dz': 'Dzieje Apostolskie', 'rz': 'Rzymian',
  '1kor': '1 Koryntian', '2kor': '2 Koryntian', 'ga': 'Galacjan', 'gal': 'Galacjan',
  'ef': 'Efezjan', 'flp': 'Filipian', 'kol': 'Kolosan',
  '1tes': '1 Tesaloniczan', '2tes': '2 Tesaloniczan',
  '1tm': '1 Tymoteusza', '2tm': '2 Tymoteusza', 'tt': 'Tytusa', 'flm': 'Filemona',
  'hbr': 'Hebrajczyków', 'heb': 'Hebrajczyków', 'jk': 'Jakuba',
  '1p': '1 Piotra', '2p': '2 Piotra', '1j': '1 Jana', '2j': '2 Jana', '3j': '3 Jana',
  'jud': 'Judy', 'ap': 'Objawienie', 'obj': 'Objawienie',
};

// Rozbij odnośnik na skrót księgi + resztę (rozdział,werset).
// Obsługuje księgi z prefiksem liczbowym, np. „1 Kor 13,4".
function splitBookAndRest(raw) {
  const s = raw.trim().replace(/\s+/g, ' ');
  // Dopasuj: opcjonalna cyfra księgi + nazwa/skrót (litery) + reszta (cyfry/interpunkcja)
  const m = s.match(/^(\d?\s?[A-Za-zÀ-ž.]+)\s*(.*)$/);
  if (!m) return { book: s, rest: '' };
  return { book: m[1].replace(/\s+/g, '').replace(/\./g, ''), rest: (m[2] || '').trim() };
}

/**
 * Parsuje odnośnik biblijny.
 * @param {string} ref np. „J 3,16" albo „1 Kor 13,4-7"
 * @returns {{ raw:string, book:string, bookAbbr:string, location:string, valid:boolean } | null}
 */
export function parseScriptureRef(ref) {
  if (!ref || !String(ref).trim()) return null;
  const raw = String(ref).trim();
  const { book, rest } = splitBookAndRest(raw);
  const abbrKey = book.toLowerCase();
  const fullBook = BOOK_ABBR[abbrKey] || book;
  // W polskim zapisie rozdział i werset rozdziela przecinek: „3,16" -> „3:16"
  const location = rest.replace(/,/g, ':');
  return {
    raw,
    book: fullBook,
    bookAbbr: book,
    location,
    valid: !!rest,
  };
}

/**
 * Buduje link do BibleGateway (wersja UBG) dla podanego odnośnika.
 * Zwraca null gdy odnośnik jest pusty.
 * @param {string} ref
 * @param {string} version domyślnie 'UBG'
 * @returns {string|null}
 */
export function bibleUrl(ref, version = 'UBG') {
  const parsed = parseScriptureRef(ref);
  if (!parsed) return null;
  const search = parsed.location ? `${parsed.book} ${parsed.location}` : parsed.book;
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(search)}&version=${encodeURIComponent(version)}`;
}

/**
 * Ładny tekst odnośnika do wyświetlenia (bez zmian, ale z ucięciem białych znaków).
 */
export function formatScriptureRef(ref) {
  if (!ref || !String(ref).trim()) return '';
  return String(ref).trim();
}
