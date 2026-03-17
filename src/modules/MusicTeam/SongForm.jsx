import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, PlusCircle, Music, Hash, Check, Upload, FileText, Link as LinkIcon, Trash2, Edit3, AlignJustify, Minus, Plus, CornerDownLeft, Undo2, Redo2, Keyboard, Type, Bold, Italic } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CustomSelect from '../../components/CustomSelect';

// --- STAŁE DANYCH ---
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Mapowanie stopni na akordy dla każdej tonacji (poprawny zapis enharmoniczny)
// Format: { tonacja: [I, II, III, IV, V, VI, VII] }
const SCALE_DEGREES = {
  'C':  ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'C#': ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'],
  'Db': ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  'D':  ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  'Eb': ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  'E':  ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  'F':  ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  'Gb': ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
  'G':  ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  'Ab': ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  'A':  ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  'Bb': ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  'B':  ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
};

// Etykiety stopni (rzymskie)
const DEGREE_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Typowe akordy dla stopni w durze (domyślne typy)
// I=dur, II=moll, III=moll, IV=dur, V=dur, VI=moll, VII=zmniejszony
const DEFAULT_CHORD_TYPES = ['', 'm', 'm', '', '', 'm', 'dim'];

// Chromatyczna skala (używamy bemoli i krzyżyków odpowiednio)
const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Mapowanie enharmoniczne (np. C# = Db)
const ENHARMONIC_MAP = {
  'C#': 'Db', 'Db': 'C#',
  'D#': 'Eb', 'Eb': 'D#',
  'E#': 'F', 'F': 'E#', 'Fb': 'E', 'E': 'Fb',
  'F#': 'Gb', 'Gb': 'F#',
  'G#': 'Ab', 'Ab': 'G#',
  'A#': 'Bb', 'Bb': 'A#',
  'B#': 'C', 'C': 'B#', 'Cb': 'B', 'B': 'Cb',
};

// Tonacje preferujące krzyżyki vs bemole
const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

/**
 * Normalizuje akord - usuwa nieprawidłowe kombinacje #b lub b#
 * np. A#b -> A, Bb# -> B, A#b7 -> A7
 */
const normalizeChord = (chord) => {
  if (!chord || typeof chord !== 'string') return chord;

  // Usuń kombinacje #b lub b# (wzajemnie się znoszą) - wielokrotnie, aż nie będzie więcej
  let normalized = chord;
  let prev;
  do {
    prev = normalized;
    normalized = normalized.replace(/#b|b#/g, '');
  } while (normalized !== prev);

  if (normalized.length === 0) return chord;

  return normalized;
};

/**
 * Parsuje akord i zwraca jego składowe
 * @param {string} chord - Akord do sparsowania (np. "Am7", "D/F#", "Bbmaj7")
 * @returns {{ root: string, modifier: string, bass: string|null }}
 */
const parseChord = (chord) => {
  if (!chord || typeof chord !== 'string') return null;

  // Regex do parsowania akordu: root (litera + opcjonalnie # lub b) + modyfikator + opcjonalnie /bas
  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;

  const root = match[1];
  let rest = match[2];

  // Sprawdź czy jest bas (slash chord)
  let bass = null;
  let modifier = rest;

  const slashIndex = rest.indexOf('/');
  if (slashIndex !== -1) {
    modifier = rest.substring(0, slashIndex);
    bass = rest.substring(slashIndex + 1);
  }

  return { root, modifier, bass };
};

/**
 * Pobiera indeks chromatyczny nuty (0-11)
 * @param {string} note - Nuta (np. "C", "F#", "Bb")
 * @returns {number} - Indeks 0-11
 */
const getNoteIndex = (note) => {
  const noteUpper = note.charAt(0).toUpperCase();
  const accidental = note.substring(1);

  let baseIndex = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 }[noteUpper];
  if (baseIndex === undefined) return -1;

  if (accidental === '#') baseIndex = (baseIndex + 1) % 12;
  else if (accidental === 'b') baseIndex = (baseIndex + 11) % 12;
  else if (accidental === '##') baseIndex = (baseIndex + 2) % 12;
  else if (accidental === 'bb') baseIndex = (baseIndex + 10) % 12;

  return baseIndex;
};

/**
 * Wybiera odpowiednią nutę dla danej tonacji (poprawny zapis enharmoniczny)
 * @param {number} noteIndex - Indeks chromatyczny (0-11)
 * @param {string} targetKey - Tonacja docelowa
 * @returns {string} - Nuta z poprawnym zapisem
 */
const getNoteForKey = (noteIndex, targetKey) => {
  // Jeśli nuta istnieje w skali docelowej tonacji, użyj jej
  const targetScale = SCALE_DEGREES[targetKey];
  if (targetScale) {
    for (const note of targetScale) {
      if (getNoteIndex(note) === noteIndex) {
        return note;
      }
    }
  }

  // Użyj krzyżyków dla tonacji z krzyżykami, bemoli dla tonacji z bemolami
  if (SHARP_KEYS.includes(targetKey)) {
    return CHROMATIC_NOTES[noteIndex];
  } else {
    return CHROMATIC_NOTES_FLAT[noteIndex];
  }
};

/**
 * Transponuje pojedynczą nutę
 * @param {string} note - Nuta do transpozycji
 * @param {number} semitones - O ile półtonów transponować
 * @param {string} targetKey - Tonacja docelowa (do wyboru zapisu enharmonicznego)
 * @returns {string} - Przetransponowana nuta
 */
const transposeNote = (note, semitones, targetKey) => {
  const noteIndex = getNoteIndex(note);
  if (noteIndex === -1) return note;

  const newIndex = (noteIndex + semitones + 12) % 12;
  return getNoteForKey(newIndex, targetKey);
};

/**
 * Transponuje akord z zachowaniem poprawnego zapisu enharmonicznego
 * @param {string} chord - Akord do transpozycji (np. "Am7", "D/F#")
 * @param {string} fromKey - Tonacja źródłowa
 * @param {string} toKey - Tonacja docelowa
 * @returns {string} - Przetransponowany akord
 */
const transposeChord = (chord, fromKey, toKey) => {
  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const fromIndex = getNoteIndex(fromKey);
  const toIndex = getNoteIndex(toKey);
  const semitones = toIndex - fromIndex;

  const newRoot = transposeNote(parsed.root, semitones, toKey);
  let result = newRoot + parsed.modifier;

  if (parsed.bass) {
    const newBass = transposeNote(parsed.bass, semitones, toKey);
    result += '/' + newBass;
  }

  // Normalizuj wynik - usuń nieprawidłowe kombinacje #b lub b#
  return normalizeChord(result);
};

/**
 * Formatuje akord z odpowiednimi rozmiarami czcionek zgodnie z wytycznymi:
 * - Główna litera: rozmiar bazowy
 * - Modyfikatory: 2pt mniejsze
 * - Slash i bas: 1pt mniejszy, znaki przy basie: 3pt mniejsze
 * @param {string} chord - Akord do sformatowania
 * @param {number} baseFontSize - Bazowy rozmiar czcionki w px
 * @returns {string} - HTML ze sformatowanym akordem
 */
const formatChordHtml = (chord, baseFontSize = 14) => {
  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const modifierSize = baseFontSize - 2;
  const bassSize = baseFontSize - 1;
  const bassAccidentalSize = baseFontSize - 3;

  let html = `<span style="font-size:${baseFontSize}px;font-weight:bold;">${parsed.root.charAt(0)}</span>`;

  // Jeśli pryma ma znak chromatyczny
  if (parsed.root.length > 1) {
    html += `<span style="font-size:${modifierSize}px;">${parsed.root.substring(1)}</span>`;
  }

  // Modyfikator
  if (parsed.modifier) {
    html += `<span style="font-size:${modifierSize}px;">${parsed.modifier}</span>`;
  }

  // Bas (slash chord)
  if (parsed.bass) {
    html += `<span style="font-size:${bassSize}px;">/</span>`;
    html += `<span style="font-size:${bassSize}px;font-weight:bold;">${parsed.bass.charAt(0)}</span>`;

    if (parsed.bass.length > 1) {
      html += `<span style="font-size:${bassAccidentalSize}px;">${parsed.bass.substring(1)}</span>`;
    }
  }

  return html;
};

/**
 * Lista wszystkich modyfikatorów akordów (zgodnie z wytycznymi PDF)
 * Sortujemy od najdłuższych do najkrótszych aby regex działał poprawnie
 */
const CHORD_MODIFIERS = [
  // Złożone modyfikatory (najdłuższe najpierw)
  'maj13', 'maj11', 'maj9', 'maj7',
  'add13', 'add11', 'add9', 'add4', 'add2',
  'sus4-3', '4-3',
  'sus13', 'sus11', 'sus9', 'sus7', 'sus4', 'sus2', 'sus',
  '(add9)', '(add4)', '(add11)', '(add13)',
  '(#5#11)', '(#5#9)', '(b9)', '(b6)', '(b5)', '(#11)', '(#5)', '(#4)', '(no3)', '(11)', '(13)',
  '#5#9', '#5#11',
  'dim7', 'dim',
  'aug',
  'alt',
  '#7',
  'm13', 'm11', 'm9', 'm7', 'm6',
  '69',
  '13', '11', '9', '7', '6', '5', '2',
  '∆', 'ø',
  '#m', 'bm',
  'm', '#', 'b'
].sort((a, b) => b.length - a.length);

/**
 * Tworzy regex do znajdowania akordów w tekście
 * Akord = [A-G] + opcjonalnie (#|b) + opcjonalnie modyfikator + opcjonalnie /bas
 */
const createChordRegex = () => {
  // Budujemy regex dla modyfikatorów (escapujemy znaki specjalne)
  const escapedModifiers = CHORD_MODIFIERS.map(m =>
    m.replace(/[()#∆ø]/g, c => `\\${c}`)
  );
  const modifierPattern = `(?:${escapedModifiers.join('|')})*`;

  // Pełny pattern akordu: litera + opcjonalnie #/b + modyfikatory + opcjonalnie /bas
  // Nie łapiemy akordów które są już w tagach HTML (style=, class= etc.)
  return new RegExp(
    `(?<![a-zA-Z0-9_"'=])([A-G][#b]?)(${modifierPattern})(\\/[A-G][#b]?)?(?![a-zA-Z0-9])`,
    'g'
  );
};

/**
 * Formatuje wszystkie akordy w treści HTML z odpowiednimi rozmiarami czcionek
 * @param {string} htmlContent - Treść HTML z akordami
 * @param {number} baseFontSize - Bazowy rozmiar czcionki w px
 * @returns {string} - HTML ze sformatowanymi akordami
 */
const formatAllChordsInContent = (htmlContent, baseFontSize = 14) => {
  if (!htmlContent) return htmlContent;

  const modifierSize = baseFontSize - 2;
  const bassSize = baseFontSize - 1;
  const bassAccidentalSize = baseFontSize - 3;

  // Używamy DOMParser do bezpiecznego przetwarzania HTML
  // Przetwarzamy tylko tekstowe węzły, pomijając istniejące style
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // Funkcja rekurencyjnie przetwarzająca węzły tekstowe
  const processTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text || !text.trim()) return;

      // Sprawdź czy tekst zawiera potencjalne akordy
      if (!/[A-G]/.test(text)) return;

      const chordRegex = createChordRegex();
      let lastIndex = 0;
      let match;
      const fragments = [];
      let hasMatch = false;

      while ((match = chordRegex.exec(text)) !== null) {
        hasMatch = true;

        // Tekst przed akordem
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        // Parsuj akord
        const fullMatch = match[0];
        const root = match[1]; // np. "A", "Bb", "F#"
        const modifier = match[2] || ''; // np. "m7", "maj7", ""
        const bassWithSlash = match[3] || ''; // np. "/G", "/F#"

        // Twórz sformatowany element
        const chordSpan = document.createElement('span');
        chordSpan.setAttribute('data-chord', fullMatch);

        // Główna litera (pierwsza litera nuty)
        const rootMain = document.createElement('span');
        rootMain.style.fontSize = `${baseFontSize}px`;
        rootMain.style.fontWeight = 'bold';
        rootMain.textContent = root.charAt(0);
        chordSpan.appendChild(rootMain);

        // Znak chromatyczny przy prymie (#/b)
        if (root.length > 1) {
          const rootAccidental = document.createElement('span');
          rootAccidental.style.fontSize = `${modifierSize}px`;
          rootAccidental.textContent = root.substring(1);
          chordSpan.appendChild(rootAccidental);
        }

        // Modyfikator
        if (modifier) {
          const modSpan = document.createElement('span');
          modSpan.style.fontSize = `${modifierSize}px`;
          modSpan.textContent = modifier;
          chordSpan.appendChild(modSpan);
        }

        // Bas (slash chord)
        if (bassWithSlash) {
          const bass = bassWithSlash.substring(1); // usuń "/"

          const slashSpan = document.createElement('span');
          slashSpan.style.fontSize = `${bassSize}px`;
          slashSpan.textContent = '/';
          chordSpan.appendChild(slashSpan);

          const bassMain = document.createElement('span');
          bassMain.style.fontSize = `${bassSize}px`;
          bassMain.style.fontWeight = 'bold';
          bassMain.textContent = bass.charAt(0);
          chordSpan.appendChild(bassMain);

          if (bass.length > 1) {
            const bassAccidental = document.createElement('span');
            bassAccidental.style.fontSize = `${bassAccidentalSize}px`;
            bassAccidental.textContent = bass.substring(1);
            chordSpan.appendChild(bassAccidental);
          }
        }

        fragments.push(chordSpan);
        lastIndex = match.index + fullMatch.length;
      }

      // Tekst po ostatnim akordzie
      if (hasMatch) {
        if (lastIndex < text.length) {
          fragments.push(document.createTextNode(text.substring(lastIndex)));
        }

        // Zastąp oryginalny węzeł tekstowy
        const parent = node.parentNode;
        fragments.forEach(frag => parent.insertBefore(frag, node));
        parent.removeChild(node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Pomijamy elementy które już mają data-chord (już sformatowane)
      if (node.hasAttribute('data-chord')) return;

      // Pomijamy style i script
      if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;

      // Przetwarzaj dzieci (kopiujemy listę bo będziemy modyfikować DOM)
      Array.from(node.childNodes).forEach(child => processTextNodes(child));
    }
  };

  processTextNodes(tempDiv);
  return tempDiv.innerHTML;
};

// Stałe dla edytora akordów
const TAB_SIZE = 8; // Ilość spacji dla Tab
const SMALL_TAB_SIZE = 4; // Ilość spacji dla Shift+Tab
const BAR_WIDTH = 80; // Szerokość taktu w pikselach (stała jak w Pages)

// Funkcje tworzące szablony taktów (wywoływane przy każdym użyciu)
// Każdy takt ma lewą kreskę, ostatni takt w grupie ma też prawą kreskę
// Używamy 1px szerokości dla cieńszych, równych kresek
const BAR_LINE_WIDTH = '1px';
const createBar = () => `<span class="bar" style="display:inline-block;min-width:${BAR_WIDTH}px;border-left:${BAR_LINE_WIDTH} solid currentColor;padding:0 4px;margin:4px 0;vertical-align:top;">\u200B</span>`;
const createDoubleBar = () => `<span class="bar" style="display:inline-block;min-width:${BAR_WIDTH * 2}px;border-left:${BAR_LINE_WIDTH} solid currentColor;padding:0 4px;margin:4px 0;vertical-align:top;">\u200B</span>`;
// Ostatni takt - ma też prawą kreskę żeby zamknąć grupę
const createLastBar = () => `<span class="bar bar-last" style="display:inline-block;min-width:${BAR_WIDTH}px;border-left:${BAR_LINE_WIDTH} solid currentColor;border-right:${BAR_LINE_WIDTH} solid currentColor;padding:0 4px;margin:4px 0;vertical-align:top;">\u200B</span>`;
const createLastDoubleBar = () => `<span class="bar bar-last" style="display:inline-block;min-width:${BAR_WIDTH * 2}px;border-left:${BAR_LINE_WIDTH} solid currentColor;border-right:${BAR_LINE_WIDTH} solid currentColor;padding:0 4px;margin:4px 0;vertical-align:top;">\u200B</span>`;

// Szablony sekcji muzycznych - używamy funkcji getTemplate zamiast statycznych template
// Ostatni takt ma border-right żeby zamknąć grupę
const MUSIC_SECTIONS = [
  { label: 'Intro', getTemplate: () => `<div>[INTRO]</div><div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
  { label: 'Zwrotka', getTemplate: () => `<div>[ZWROTKA]</div><div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
  { label: 'Refren', getTemplate: () => `<div>[REFREN]</div><div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
  { label: 'Bridge', getTemplate: () => `<div>[BRIDGE]</div><div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
  { label: 'Solo', getTemplate: () => `<div>[SOLO]</div><div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
  { label: 'Outro', getTemplate: () => `<div>[OUTRO]</div><div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
  { label: 'Pusty Takt', getTemplate: () => `${createLastBar()}`, isHtml: true },
  { label: 'Podwójny Takt', getTemplate: () => `${createLastDoubleBar()}`, isHtml: true },
  { label: '4 Takty', getTemplate: () => `<div>${createBar()}${createBar()}${createBar()}${createLastBar()}</div>`, isHtml: true },
];

// --- KOMPONENTY POMOCNICZE ---

const TagMultiSelect = ({ label, options, value = [], onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTag = (tag) => {
    const newValue = value.includes(tag)
      ? value.filter(t => t !== tag)
      : [...value, tag];
    onChange(newValue);
  };

  const addCustomTag = () => {
    const trimmedTag = customTag.trim();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag]);
      setCustomTag('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomTag();
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      {label && <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer min-h-[50px] flex flex-wrap gap-2 hover:border-pink-400 dark:hover:border-pink-500 transition"
      >
        {value.length === 0 && <span className="text-gray-400 dark:text-gray-500 pt-0.5">Wybierz tagi...</span>}
        {value.map(tag => (
          <span key={tag} className="bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-orange-100 dark:border-orange-800">
            {tag}
            <div
              onMouseDown={(e) => { e.stopPropagation(); toggleTag(tag); }}
              className="cursor-pointer hover:text-orange-900 dark:hover:text-white"
            >
              <X size={12} />
            </div>
          </span>
        ))}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                placeholder="Dodaj własny tag..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-pink-500"
              />
              <button
                onClick={(e) => { e.stopPropagation(); addCustomTag(); }}
                className="px-3 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition text-sm font-bold"
              >
                <PlusCircle size={16} />
              </button>
            </div>
          </div>
          {options.map((tag) => {
            const isSelected = value.includes(tag);
            return (
              <div
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between transition
                  ${isSelected ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}
                `}
              >
                {tag}
                {isSelected && <Check size={14} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- GŁÓWNY FORMULARZ ---

export default function SongForm({ initialData, onSave, onCancel, allTags = [] }) {
  const [formData, setFormData] = useState({
    id: null,
    title: '',
    author: '',
    category: '',
    key: '',
    tempo: '',
    meter: '',
    tags: [],
    lyrics: '',
    chords_bars: '',
    sheet_music_url: '',
    attachments: []
  });

  const [activeTab, setActiveTab] = useState('basic'); // basic | lyrics | attachments
  const [availableTags, setAvailableTags] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newLink, setNewLink] = useState('');
  const [newLinkDescription, setNewLinkDescription] = useState('');
  const [editingAttachmentIdx, setEditingAttachmentIdx] = useState(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const chordsTextareaRef = useRef(null);

  // Ustawienia edytora akordów
  const [chordsLineHeight, setChordsLineHeight] = useState(1.8);
  const [chordsFontSize, setChordsFontSize] = useState(12); // Rozmiar czcionki w px
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [editorKey, setEditorKey] = useState(''); // Tonacja wybrana w edytorze (domyślnie z formData.key)

  // Historia dla undo/redo
  const [chordsHistory, setChordsHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);

  // Używaj tylko tagów z bazy (przekazanych przez props)
  useEffect(() => {
    setAvailableTags([...allTags].sort());
  }, [allTags]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        tags: initialData.tags || [],
        title: initialData.title || '',
        author: initialData.author || '',
        category: initialData.category || '',
        key: initialData.key || '',
        tempo: initialData.tempo || '',
        meter: initialData.meter || '',
        lyrics: initialData.lyrics || '',
        chords_bars: initialData.chords_bars || ''
      });
      // Ustaw tonację edytora na tonację pieśni
      if (initialData.key) {
        setEditorKey(initialData.key);
      }
    }
  }, [initialData]);

  // Synchronizuj editorKey gdy zmieni się formData.key
  useEffect(() => {
    if (formData.key && !editorKey) {
      setEditorKey(formData.key);
    }
  }, [formData.key, editorKey]);

  const handleSubmit = async () => {
    if (!formData.title) return alert("Podaj tytuł pieśni");

    // Formatuj akordy w chords_bars przed zapisem (zgodnie z wytycznymi PDF)
    // Rozmiary: główna litera = bazowy, modyfikatory = -2pt, slash/bas = -1pt, znaki przy basie = -3pt
    const formattedData = {
      ...formData,
      chords_bars: formData.chords_bars
        ? formatAllChordsInContent(formData.chords_bars, chordsFontSize)
        : formData.chords_bars
    };

    console.log('SongForm handleSubmit - formattedData:', formattedData);
    await onSave(formattedData);
  };

  // Funkcje do obsługi załączników
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFile(true);
    try {
      const uploadedDocs = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `song_attachments/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);

        uploadedDocs.push({
          type: 'file',
          name: file.name,
          url: data.publicUrl,
          description: '',
          date: new Date().toISOString()
        });
      }

      setFormData({
        ...formData,
        attachments: [...(formData.attachments || []), ...uploadedDocs]
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Błąd przesyłania pliku: ' + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Obsługa drag & drop dla załączników
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Filtruj pliki do akceptowanych typów
    const acceptedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.mp3', '.wav'];
    const validFiles = files.filter(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      return acceptedTypes.includes(ext);
    });

    if (validFiles.length === 0) {
      alert('Nieobsługiwany format pliku. Akceptowane: PDF, JPG, PNG, MP3, DOC');
      return;
    }

    setUploadingFile(true);
    try {
      const uploadedDocs = [];

      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `song_attachments/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);

        uploadedDocs.push({
          type: 'file',
          name: file.name,
          url: data.publicUrl,
          description: '',
          date: new Date().toISOString()
        });
      }

      setFormData({
        ...formData,
        attachments: [...(formData.attachments || []), ...uploadedDocs]
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Błąd przesyłania pliku: ' + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleAddLink = () => {
    if (!newLink) return;

    const newAttachment = {
      type: 'link',
      name: newLinkDescription || newLink,
      url: newLink,
      description: newLinkDescription,
      date: new Date().toISOString()
    };

    setFormData({
      ...formData,
      attachments: [...(formData.attachments || []), newAttachment]
    });

    setNewLink('');
    setNewLinkDescription('');
  };

  const removeAttachment = (index) => {
    setFormData({
      ...formData,
      attachments: (formData.attachments || []).filter((_, i) => i !== index)
    });
  };

  const updateAttachmentDescription = (index, newDescription) => {
    const updatedAttachments = [...(formData.attachments || [])];
    updatedAttachments[index] = {
      ...updatedAttachments[index],
      description: newDescription,
      name: newDescription || updatedAttachments[index].url
    };
    setFormData({ ...formData, attachments: updatedAttachments });
    setEditingAttachmentIdx(null);
    setEditingDescription('');
  };

  const startEditingDescription = (index) => {
    setEditingAttachmentIdx(index);
    setEditingDescription(formData.attachments[index]?.description || '');
  };

  // Funkcja zapisująca stan do historii
  const saveToHistory = (newText) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const newHistory = chordsHistory.slice(0, historyIndex + 1);
    newHistory.push(newText);
    // Limit historii do 50 elementów
    if (newHistory.length > 50) newHistory.shift();
    setChordsHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Funkcja undo
  const handleUndo = () => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setFormData({ ...formData, chords_bars: chordsHistory[prevIndex] });
    }
  };

  // Funkcja redo
  const handleRedo = () => {
    if (historyIndex < chordsHistory.length - 1) {
      isUndoRedoRef.current = true;
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setFormData({ ...formData, chords_bars: chordsHistory[nextIndex] });
    }
  };

  // Funkcja formatująca zaznaczony tekst (WYSIWYG dla contentEditable)
  const execFormat = (command, value = null) => {
    document.execCommand(command, false, value);
    // Aktualizuj stan po formatowaniu
    setTimeout(() => {
      if (chordsTextareaRef.current) {
        const newContent = chordsTextareaRef.current.innerHTML;
        setFormData({ ...formData, chords_bars: newContent });
        saveToHistory(newContent);
      }
    }, 0);
  };

  // Prosta funkcja formatowania - bez kompensacji (używamy CSS do kontroli szerokości)
  const execFontSizeFormat = (size) => {
    document.execCommand('fontSize', false, size.toString());
    setTimeout(() => {
      if (chordsTextareaRef.current) {
        const newContent = chordsTextareaRef.current.innerHTML;
        setFormData({ ...formData, chords_bars: newContent });
        saveToHistory(newContent);
      }
    }, 0);
  };

  // Funkcja wstawiania tekstu w miejscu kursora (dla contentEditable)
  const insertTextAtCursor = (text) => {
    const editor = chordsTextareaRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand('insertText', false, text);
    // Synchronicznie aktualizuj stan
    const newContent = editor.innerHTML;
    setFormData(prev => ({ ...prev, chords_bars: newContent }));
    saveToHistory(newContent);
  };

  // Funkcja wstawiania HTML w miejscu kursora (z fallbackiem na Selection API)
  const insertHtmlAtCursor = (html) => {
    const editor = chordsTextareaRef.current;
    if (!editor) return;
    editor.focus();

    // Użyj Selection API bezpośrednio (bardziej niezawodne)
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // Stwórz tymczasowy element do parsowania HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Wstaw wszystkie węzły z HTML
      const fragment = document.createDocumentFragment();
      let lastNode = null;
      while (tempDiv.firstChild) {
        lastNode = tempDiv.firstChild;
        fragment.appendChild(lastNode);
      }

      range.insertNode(fragment);

      // Przesuń kursor na koniec wstawionego elementu
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
      }
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // Fallback: użyj execCommand
      document.execCommand('insertHTML', false, html);
    }

    // Synchronicznie aktualizuj stan
    const newContent = editor.innerHTML;
    setFormData(prev => ({ ...prev, chords_bars: newContent }));
    saveToHistory(newContent);
  };

  // Funkcja wstawiania sekcji muzycznej (szablon - może być HTML lub tekst)
  const insertSection = (section) => {
    // Wywołaj getTemplate() aby uzyskać świeży szablon przy każdym użyciu
    const template = section.getTemplate();
    if (section.isHtml) {
      insertHtmlAtCursor(template);
    } else {
      insertTextAtCursor(template);
    }
  };

  // Funkcja wstawiania taktu - jeśli kursor jest wewnątrz taktu, wstaw po nim
  // Poprzedni takt traci prawą kreskę, nowy takt ma prawą kreskę
  const insertBarAtCursor = () => {
    const editor = chordsTextareaRef.current;
    if (!editor) return;
    editor.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      insertHtmlAtCursor(createLastBar());
      return;
    }

    // Sprawdź czy kursor jest wewnątrz taktu (span.bar)
    let node = selection.anchorNode;
    let barElement = null;

    // Przeszukaj w górę drzewa DOM szukając elementu .bar
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('bar')) {
        barElement = node;
        break;
      }
      node = node.parentNode;
    }

    if (barElement) {
      // Kursor jest wewnątrz taktu - wstaw nowy takt PO tym takcie

      // Usuń prawą kreskę z aktualnego taktu (zamień na zwykły takt)
      barElement.style.borderRight = 'none';
      barElement.classList.remove('bar-last');

      // Stwórz nowy takt z prawą kreską
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createLastBar();
      const newBar = tempDiv.firstChild;

      // Wstaw po aktualnym takcie
      if (barElement.nextSibling) {
        barElement.parentNode.insertBefore(newBar, barElement.nextSibling);
      } else {
        barElement.parentNode.appendChild(newBar);
      }

      // Przesuń kursor do nowego taktu
      const range = document.createRange();
      range.setStart(newBar, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      // Aktualizuj stan
      const newContent = editor.innerHTML;
      setFormData(prev => ({ ...prev, chords_bars: newContent }));
      saveToHistory(newContent);
    } else {
      // Kursor nie jest w takcie - wstaw normalnie
      insertHtmlAtCursor(createLastBar());
    }
  };

  // Funkcja wstawiania akordów z formatowaniem zgodnym z wytycznymi:
  // - główna litera: rozmiar bazowy, pogrubiona
  // - modyfikatory (#, b, m, 7, maj7, etc.): 2pt mniejsze
  // - slash i bas: 1pt mniejszy, znaki przy basie: 3pt mniejsze
  const insertChordAbove = (chord) => {
    const formattedChord = formatChordHtml(chord, chordsFontSize);
    insertHtmlAtCursor(`<span style="color: #ea580c;">[${formattedChord}]</span>`);
  };

  // Funkcja wstawiania akordu na podstawie stopnia (I-VII)
  const insertChordByDegree = (degreeIndex, chordType = '') => {
    const key = editorKey || formData.key || 'C';
    const scale = SCALE_DEGREES[key] || SCALE_DEGREES['C'];
    const rootNote = scale[degreeIndex];
    // Użyj domyślnego typu akordu jeśli nie podano
    const type = chordType !== undefined ? chordType : DEFAULT_CHORD_TYPES[degreeIndex];
    const chord = rootNote + type;
    insertChordAbove(chord);
  };

  // Obsługa skrótów klawiszowych
  const handleKeyDown = (e) => {
    const editor = chordsTextareaRef.current;
    if (!editor) return;

    // Tab = wstaw spacje (8 znaków)
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insertTextAtCursor(' '.repeat(TAB_SIZE));
      return;
    }

    // Shift+Tab = wstaw mniejszą ilość spacji (4 znaki)
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      insertTextAtCursor(' '.repeat(SMALL_TAB_SIZE));
      return;
    }

    // | (pipe) = wstaw takt ze stałą szerokością (HTML) - jeśli w takcie, wstaw po nim
    if (e.key === '|') {
      e.preventDefault();
      insertBarAtCursor();
      return;
    }

    // Ctrl/Cmd + Z = Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }
    // Ctrl/Cmd + Shift + Z lub Ctrl/Cmd + Y = Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      handleRedo();
      return;
    }
  };

  // Obsługa zmian w contentEditable
  const handleEditorInput = () => {
    if (chordsTextareaRef.current) {
      const newContent = chordsTextareaRef.current.innerHTML;
      setFormData({ ...formData, chords_bars: newContent });
    }
  };

  // Inicjalizacja historii przy pierwszym załadowaniu
  useEffect(() => {
    if (chordsHistory.length === 0 && formData.chords_bars) {
      setChordsHistory([formData.chords_bars]);
      setHistoryIndex(0);
    }
  }, []);

  // Synchronizuj zawartość edytora przy undo/redo
  useEffect(() => {
    if (isUndoRedoRef.current && chordsTextareaRef.current) {
      chordsTextareaRef.current.innerHTML = formData.chords_bars || '';
      isUndoRedoRef.current = false;
    }
  }, [formData.chords_bars]);

  // Inicjalizuj zawartość edytora gdy zmienia się initialData
  useEffect(() => {
    if (activeTab === 'lyrics' && chordsTextareaRef.current && initialData?.chords_bars) {
      const timer = setTimeout(() => {
        if (chordsTextareaRef.current) {
          const currentContent = chordsTextareaRef.current.innerHTML;
          if (!currentContent || currentContent === '' || currentContent === '<br>') {
            chordsTextareaRef.current.innerHTML = initialData.chords_bars;
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [initialData, activeTab]);

  // Zapisuj zmiany do historii (debounced)
  useEffect(() => {
    if (!isUndoRedoRef.current && formData.chords_bars !== undefined) {
      const timer = setTimeout(() => {
        if (chordsHistory[historyIndex] !== formData.chords_bars) {
          saveToHistory(formData.chords_bars);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.chords_bars]);

  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700 flex flex-col max-h-[92vh] my-4">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              {formData.id ? 'Edycja Pieśni' : 'Nowa Pieśń'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Uzupełnij szczegóły utworu</p>
          </div>
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition">
            <X size={24} />
          </button>
        </div>

        {/* CONTENT - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {/* TABS */}
          <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'basic' ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
            >
              Informacje Podstawowe
            </button>
            <button
              onClick={() => setActiveTab('lyrics')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'lyrics' ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
            >
              Tekst i Chwyty
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'attachments' ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
            >
              <FileText size={14} />
              Załączniki {(formData.attachments || []).length > 0 && <span className="bg-pink-100 dark:bg-pink-900 text-pink-600 dark:text-pink-300 px-1.5 py-0.5 rounded text-xs">{formData.attachments.length}</span>}
            </button>
          </div>

          {activeTab === 'basic' && (
            <div className="space-y-6 min-h-[500px]">
              {/* Rząd 1: Tytuł i Autor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tytuł</label>
                  <input 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-pink-500/20 outline-none transition"
                    placeholder="Np. Jak wielki jest Bóg"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Autor</label>
                  <input 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-pink-500/20 outline-none transition"
                    placeholder="Np. Chris Tomlin"
                    value={formData.author}
                    onChange={e => setFormData({...formData, author: e.target.value})}
                  />
                </div>
              </div>

              {/* Rząd 2: Dane Muzyczne */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <CustomSelect
                  label="Tonacja"
                  options={KEYS}
                  value={formData.key}
                  onChange={val => setFormData({...formData, key: val})}
                  placeholder="Klucz"
                  icon={Music}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Metrum</label>
                  <div className="relative">
                    <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-pink-500/20 outline-none transition"
                      placeholder="4/4"
                      value={formData.meter}
                      onChange={e => setFormData({...formData, meter: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tempo (BPM)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="300"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-pink-500/20 outline-none transition"
                    placeholder="120"
                    value={formData.tempo}
                    onChange={e => setFormData({...formData, tempo: e.target.value})}
                  />
                </div>
              </div>

              {/* Tagi */}
              <TagMultiSelect
                label="Tagi"
                options={availableTags}
                value={formData.tags}
                onChange={val => setFormData({...formData, tags: val})}
              />
            </div>
          )}

          {activeTab === 'lyrics' && (
            <div className="space-y-6 h-full">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[500px]">
                 {/* KOLUMNA 1: CZYSTY TEKST */}
                 <div className="flex flex-col h-full">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tekst Pieśni (Lyrics)</label>
                    <textarea
                      className="flex-1 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-pink-500/20 outline-none transition resize-none font-mono text-sm leading-relaxed"
                      placeholder="Wpisz tekst tutaj..."
                      value={formData.lyrics}
                      onChange={e => setFormData({...formData, lyrics: e.target.value})}
                    />
                 </div>

                 {/* KOLUMNA 2: CHWYTY / TAKTY (CHORDS_BARS) - ZAAWANSOWANY EDYTOR */}
                 <div className="flex flex-col h-full">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">Chwyty / Takty</label>

                    {/* PASEK NARZĘDZI - FORMATOWANIE */}
                    <div className="p-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/80 border border-b-0 border-gray-200 dark:border-gray-700 rounded-t-xl">
                      {/* Rząd 0: Formatowanie tekstu */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                        {/* Undo/Redo */}
                        <button
                          onClick={handleUndo}
                          disabled={historyIndex <= 0}
                          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Cofnij (Ctrl+Z)"
                        >
                          <Undo2 size={14} />
                        </button>
                        <button
                          onClick={handleRedo}
                          disabled={historyIndex >= chordsHistory.length - 1}
                          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Ponów (Ctrl+Y)"
                        >
                          <Redo2 size={14} />
                        </button>

                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1" />

                        {/* System stopni - wybór tonacji i akordy */}
                        <div className="flex items-center gap-2">
                          <Music size={14} className="text-orange-500" />
                          <select
                            value={editorKey}
                            onChange={(e) => setEditorKey(e.target.value)}
                            className="h-6 px-2 text-[11px] font-bold bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded text-orange-700 dark:text-orange-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-400"
                            title="Wybierz tonację"
                          >
                            <option value="">Tonacja</option>
                            {KEYS.map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>

                          {/* Stopnie durowe */}
                          {DEGREE_LABELS.map((label, idx) => {
                            const key = editorKey || 'C';
                            const scale = SCALE_DEGREES[key] || SCALE_DEGREES['C'];
                            const chordRoot = scale[idx];
                            const defaultType = DEFAULT_CHORD_TYPES[idx];
                            const fullChord = chordRoot + defaultType;
                            return (
                              <button
                                key={label}
                                onClick={() => insertChordByDegree(idx, defaultType)}
                                className={`px-1.5 h-6 flex items-center justify-center border rounded transition text-[10px] font-bold ${
                                  defaultType === 'm' || defaultType === 'dim'
                                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                                    : 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50'
                                }`}
                                title={`${label} stopień: ${fullChord}`}
                              >
                                <span className="text-[9px] opacity-60 mr-0.5">{label}</span>
                                {fullChord}
                              </button>
                            );
                          })}

                        </div>
                      </div>

                      {/* Rząd 1: Formatowanie tekstu (zaznaczenia) */}
                      <div className="flex flex-wrap items-center gap-3 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                        {/* Formatowanie */}
                        <div className="flex items-center gap-1">
                          <button
                            onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
                            className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-gray-600 hover:text-pink-600 transition"
                            title="Pogrubienie (Ctrl+B)"
                          >
                            <Bold size={14} />
                          </button>
                          <button
                            onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
                            className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-gray-600 hover:text-pink-600 transition"
                            title="Kursywa (Ctrl+I)"
                          >
                            <Italic size={14} />
                          </button>
                        </div>

                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-600" />

                        {/* Rozmiar czcionki dla zaznaczenia */}
                        <div className="flex items-center gap-1.5">
                          <Type size={14} className="text-gray-400" />
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Rozmiar:</span>
                          {[1, 2, 3, 4, 5, 6, 7].map((size) => (
                            <button
                              key={size}
                              onMouseDown={(e) => { e.preventDefault(); execFontSizeFormat(size); }}
                              className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-gray-600 hover:text-pink-600 transition text-[10px] font-bold"
                              title={`Rozmiar ${size}`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>

                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-600" />

                        {/* Globalna czcionka bazowa */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Baza:</span>
                          <button
                            onClick={() => setChordsFontSize(Math.max(10, chordsFontSize - 2))}
                            className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-10 text-center text-xs font-mono font-bold text-gray-700 dark:text-gray-200">{chordsFontSize}px</span>
                          <button
                            onClick={() => setChordsFontSize(Math.min(24, chordsFontSize + 2))}
                            className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-600" />

                        {/* Interlinia */}
                        <div className="flex items-center gap-1.5">
                          <AlignJustify size={14} className="text-gray-400" />
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Interlinia:</span>
                          <button
                            onClick={() => setChordsLineHeight(Math.max(1.2, chordsLineHeight - 0.2))}
                            className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-8 text-center text-xs font-mono font-bold text-gray-700 dark:text-gray-200">{chordsLineHeight.toFixed(1)}</span>
                          <button
                            onClick={() => setChordsLineHeight(Math.min(3.0, chordsLineHeight + 0.2))}
                            className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Rząd 2: Szybkie wstawianie */}
                      <div className="flex flex-wrap gap-1.5">
                        {/* Sekcje muzyczne */}
                        {MUSIC_SECTIONS.map((section) => (
                          <button
                            key={section.label}
                            onMouseDown={(e) => { e.preventDefault(); insertSection(section); }}
                            className="px-2.5 py-1 bg-white dark:bg-gray-700 hover:bg-pink-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-[11px] font-bold rounded-md border border-gray-200 dark:border-gray-600 transition flex items-center gap-1"
                          >
                            <PlusCircle size={10} className="text-pink-500 dark:text-pink-400"/>
                            {section.label}
                          </button>
                        ))}

                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" />

                        {/* Szybkie znaki */}
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertBarAtCursor(); }}
                          className="px-2.5 py-1 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-[11px] font-bold rounded-md border border-orange-200 dark:border-orange-800 transition font-mono"
                          title="Takt ze stałą szerokością (jeśli w takcie - dodaje po nim)"
                        >
                          |takt|
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor(' '.repeat(TAB_SIZE)); }}
                          className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[11px] font-bold rounded-md border border-blue-200 dark:border-blue-800 transition"
                          title={`Duża spacja (${TAB_SIZE} znaków) lub Tab`}
                        >
                          TAB
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor(' '.repeat(SMALL_TAB_SIZE)); }}
                          className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[11px] font-bold rounded-md border border-blue-200 dark:border-blue-800 transition"
                          title={`Mała spacja (${SMALL_TAB_SIZE} znaków) lub Shift+Tab`}
                        >
                          SPC
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor('\n'); }}
                          className="px-2.5 py-1 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 text-[11px] font-bold rounded-md border border-green-200 dark:border-green-800 transition flex items-center gap-1"
                          title="Nowa linia"
                        >
                          <CornerDownLeft size={10} />
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor('\n────────────────────────────────\n'); }}
                          className="px-2.5 py-1 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-[11px] font-bold rounded-md border border-gray-300 dark:border-gray-500 transition"
                          title="Linia pozioma (separator)"
                        >
                          ───
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor('×2'); }}
                          className="px-2.5 py-1 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-[11px] font-bold rounded-md border border-red-200 dark:border-red-800 transition font-mono"
                          title="Znak powtórzenia"
                        >
                          ×2
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor('𝄆  𝄇'); }}
                          className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[11px] font-bold rounded-md border border-purple-200 dark:border-purple-800 transition font-mono"
                          title="Znaki repetycji"
                        >
                          𝄆 𝄇
                        </button>
                      </div>
                    </div>

                    {/* EDYTOR AKORDÓW - contentEditable z trybem nadpisywania i formatowaniem */}
                    <div
                      ref={chordsTextareaRef}
                      contentEditable
                      onInput={handleEditorInput}
                      onKeyDown={handleKeyDown}
                      className="flex-1 w-full px-4 py-3 border-x border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:ring-inset min-h-[300px] overflow-auto font-mono"
                      style={{ lineHeight: chordsLineHeight, fontSize: `${chordsFontSize}px`, whiteSpace: 'pre-wrap' }}
                      suppressContentEditableWarning
                      data-placeholder="Wpisz chwyty tutaj... | = takt ze stałą szerokością, Tab = spacja"
                    />

                    {/* STOPKA Z INFORMACJAMI */}
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-xl flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          | = takt ({BAR_WIDTH}px) • Tekst w takcie nie przesuwa kresek • Zmiana rozmiaru nie wpływa na położenie
                        </span>
                        <button
                          onClick={() => setShowShortcutsHelp(!showShortcutsHelp)}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
                          title="Pokaż skróty klawiszowe"
                        >
                          <Keyboard size={12} />
                          Skróty
                        </button>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                        {(formData.chords_bars || '').length} znaków
                      </span>
                    </div>

                    {/* PANEL POMOCY - SKRÓTY KLAWISZOWE */}
                    {showShortcutsHelp && (
                      <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-t-0 border-blue-200 dark:border-blue-800 rounded-b-xl">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">Skróty klawiszowe i formatowanie</h4>
                          <button onClick={() => setShowShortcutsHelp(false)} className="text-blue-400 hover:text-blue-600">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Takt (stała szerokość)</span><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-mono border border-gray-200 dark:border-gray-600">|</kbd></div>
                          <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Duża spacja ({TAB_SIZE} znaków)</span><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-mono border border-gray-200 dark:border-gray-600">Tab</kbd></div>
                          <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Mała spacja ({SMALL_TAB_SIZE} znaki)</span><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-mono border border-gray-200 dark:border-gray-600">Shift+Tab</kbd></div>
                          <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Pogrubienie</span><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-mono border border-gray-200 dark:border-gray-600">Ctrl+B</kbd></div>
                          <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Kursywa</span><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-mono border border-gray-200 dark:border-gray-600">Ctrl+I</kbd></div>
                          <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Cofnij / Ponów</span><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-mono border border-gray-200 dark:border-gray-600">Ctrl+Z / Y</kbd></div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-blue-200 dark:border-blue-700">
                          <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium mb-1">Stałe takty (jak w Pages):</p>
                          <p className="text-[10px] text-gray-600 dark:text-gray-400">
                            Każdy takt ma stałą szerokość {BAR_WIDTH}px. Tekst wpisany w takcie (nawet z różnymi rozmiarami czcionki)
                            nie przesuwa następnych kresek. Użyj przycisków sekcji lub klawisza | aby dodać takty.
                          </p>
                        </div>
                      </div>
                    )}
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="space-y-6 min-h-[500px]">
              {/* DODAWANIE PLIKU */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-4 flex items-center gap-2">
                  <Upload size={16} className="text-pink-500" /> Prześlij plik
                </h3>
                <div
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                  className={`w-full px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                    isDragOver
                      ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-pink-400 dark:hover:border-pink-500'
                  }`}
                >
                  <Upload size={32} className={isDragOver ? 'text-pink-500' : 'text-gray-400'} />
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {uploadingFile ? 'Przesyłanie...' : isDragOver ? 'Upuść plik tutaj' : 'Kliknij lub przeciągnij plik'}
                  </span>
                  <span className="text-xs text-gray-400">PDF, JPG, PNG, MP3, DOC (max 10MB)</span>
                  <input
                    id="file-upload-input"
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.mp3,.wav"
                    disabled={uploadingFile}
                    multiple
                  />
                </div>
              </div>

              {/* DODAWANIE LINKU */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-4 flex items-center gap-2">
                  <LinkIcon size={16} className="text-orange-500" /> Dodaj link
                </h3>
                <div className="space-y-3">
                  <input
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white text-sm outline-none focus:border-pink-500 transition"
                    placeholder="https://youtube.com/watch?v=..."
                    value={newLink}
                    onChange={e => setNewLink(e.target.value)}
                  />
                  <input
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white text-sm outline-none focus:border-pink-500 transition"
                    placeholder="Opis linku (np. Tutorial na YouTube)"
                    value={newLinkDescription}
                    onChange={e => setNewLinkDescription(e.target.value)}
                  />
                  <button
                    onClick={handleAddLink}
                    disabled={!newLink}
                    className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Dodaj Link
                  </button>
                </div>
              </div>

              {/* LISTA ZAŁĄCZNIKÓW */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-4">
                  Załączniki ({(formData.attachments || []).length})
                </h3>

                {(!formData.attachments || formData.attachments.length === 0) ? (
                  <div className="text-center py-12 text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <FileText size={40} className="mx-auto mb-3 opacity-50" />
                    <p>Brak załączników</p>
                    <p className="text-sm mt-1">Dodaj pliki lub linki powyżej</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-pink-300 dark:hover:border-pink-600 transition group"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${att.type === 'link' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'bg-pink-100 dark:bg-pink-900/30 text-pink-600'}`}>
                            {att.type === 'link' ? <LinkIcon size={20} /> : <FileText size={20} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            {editingAttachmentIdx === idx ? (
                              <div className="flex gap-2">
                                <input
                                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-white outline-none focus:border-pink-500"
                                  value={editingDescription}
                                  onChange={e => setEditingDescription(e.target.value)}
                                  placeholder="Wpisz opis..."
                                  autoFocus
                                />
                                <button
                                  onClick={() => updateAttachmentDescription(idx, editingDescription)}
                                  className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-sm font-bold hover:bg-pink-700"
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => { setEditingAttachmentIdx(null); setEditingDescription(''); }}
                                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm"
                                >
                                  Anuluj
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate">
                                  {att.description || att.name || att.url}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {att.type === 'link' ? att.url : att.name}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {editingAttachmentIdx !== idx && (
                          <div className="flex gap-2 shrink-0 ml-3">
                            <button
                              onClick={() => startEditingDescription(idx)}
                              className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition"
                              title="Edytuj opis"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => removeAttachment(idx)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                              title="Usuń załącznik"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-6 py-3 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition"
          >
            Anuluj
          </button>
          <button 
            onClick={handleSubmit}
            className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-pink-600 to-orange-600 hover:shadow-lg hover:shadow-pink-500/30 transition transform hover:-translate-y-0.5"
          >
            Zapisz Pieśń
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
