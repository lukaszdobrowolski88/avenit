import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Search, Trash2, X, FileText, Music, Calendar, ChevronDown, Check, ChevronUp, User, UserX, Link as LinkIcon, Clock, History, ExternalLink, Minus, Hash, DollarSign, ChevronLeft, ChevronRight, Tag, Upload, FileDown, MessageSquare, Download, Play, Pause, Volume2, Users, FolderOpen, Package } from 'lucide-react';
import SongForm from './SongForm';
import FinanceTab from '../shared/FinanceTab';
import WallTab from '../shared/WallTab';
import EventsTab from '../shared/EventsTab';
import MaterialsTab from '../shared/MaterialsTab';
import EquipmentTab from '../shared/EquipmentTab';
import RolesTab from '../../components/RolesTab';
import CustomSelect from '../../components/CustomSelect';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import { useUserRole } from '../../hooks/useUserRole';
import { hasTabAccess } from '../../utils/tabPermissions';
import { useScheduleAssignments } from '../../hooks/useScheduleAssignments';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PitchShifter } from 'soundtouchjs';


// Hook to calculate dropdown position with smart positioning (up/down)
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240; // max-h-60 = 15rem = 240px
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Otwórz w górę jeśli nie ma miejsca na dole, ale jest na górze
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, triggerRef]);

  return coords;
}

// Custom Date Picker Component
const CustomDatePicker = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => {
    if (value) setViewDate(new Date(value));
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-datepicker')) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDayClick = (day) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const d = String(newDate.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${d}`);
    setIsOpen(false);
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const startDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const monthName = viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const displayValue = value ? new Date(value).toLocaleDateString('pl-PL') : '';

  return (
    <div className="relative w-full">
      {label && <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all
          ${isOpen
            ? 'border-pink-500 ring-2 ring-pink-500/20 dark:border-pink-400'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-pink-300 dark:hover:border-pink-600'
          }
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <span className={displayValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {displayValue || 'Wybierz datę'}
          </span>
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-datepicker fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: coords.top,
            left: coords.left,
            width: '280px'
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronLeft size={18}/></button>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{monthName}</span>
            <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronRight size={18}/></button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {blanks.map(b => <div key={`blank-${b}`} />)}
            {days.map(day => {
              const currentDayStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = value === currentDayStr;
              const isToday = new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition flex items-center justify-center
                    ${isSelected
                      ? 'bg-pink-600 text-white shadow-md shadow-pink-500/30'
                      : isToday
                        ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-800'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// --- ZAAWANSOWANA LOGIKA TRANSPOZYCJI (zgodnie z wytycznymi PDF) ---

// Lista tonacji do wyboru
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Mapowanie stopni na akordy dla każdej tonacji (poprawny zapis enharmoniczny wg PDF)
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

// Chromatyczna skala (używamy krzyżyków dla tonacji z krzyżykami, bemoli dla tonacji z bemolami)
const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Tonacje preferujące krzyżyki vs bemole
const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

// Baza chromatyczna - dla kompatybilności wstecznej
const CHORDS_SCALE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * Pobiera indeks chromatyczny nuty (0-11)
 */
function getNoteIndex(note) {
  if (!note) return -1;
  const noteUpper = note.charAt(0).toUpperCase();
  const accidental = note.substring(1);

  let baseIndex = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 }[noteUpper];
  if (baseIndex === undefined) return -1;

  if (accidental === '#') baseIndex = (baseIndex + 1) % 12;
  else if (accidental === 'b') baseIndex = (baseIndex + 11) % 12;
  else if (accidental === '##') baseIndex = (baseIndex + 2) % 12;
  else if (accidental === 'bb') baseIndex = (baseIndex + 10) % 12;

  return baseIndex;
}

// Alias dla kompatybilności wstecznej
function getChordIndex(chord) {
  return getNoteIndex(chord);
}

/**
 * Normalizuje akord - usuwa nieprawidłowe kombinacje #b lub b#
 * np. A#b -> A, Bb# -> B, A#b7 -> A7
 * Działa na całym akordzie, nie tylko na nucie
 */
function normalizeChord(chord) {
  if (!chord || typeof chord !== 'string') return chord;

  // Usuń kombinacje #b lub b# (wzajemnie się znoszą) - wielokrotnie, aż nie będzie więcej
  let normalized = chord;
  let prev;
  do {
    prev = normalized;
    normalized = normalized.replace(/#b|b#/g, '');
  } while (normalized !== prev);

  // Upewnij się, że akord ma poprawny format
  if (normalized.length === 0) return chord;

  return normalized;
}

/**
 * Wybiera odpowiednią nutę dla danej tonacji (poprawny zapis enharmoniczny wg PDF)
 * Unika zapisów typu F##, Ab# - używa nut ze skali docelowej tonacji
 */
function getNoteForKey(noteIndex, targetKey) {
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
}

/**
 * Transponuje pojedynczą nutę z zachowaniem poprawnego zapisu enharmonicznego
 */
function transposeNoteToKey(note, semitones, targetKey) {
  const noteIndex = getNoteIndex(note);
  if (noteIndex === -1) return note;

  const newIndex = (noteIndex + semitones + 12) % 12;
  return getNoteForKey(newIndex, targetKey);
}

/**
 * Parsuje akord i zwraca jego składowe
 * Obsługuje wszystkie modyfikatory z PDF: m, #, b, 2, 5, 6, 7, 11, 13, 69, sus2, sus4, maj7, dim, aug, etc.
 */
function parseChordFull(chord) {
  if (!chord || typeof chord !== 'string') return null;

  // Regex: root (A-G + opcjonalnie # lub b) + modyfikator + opcjonalnie /bas
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
}

/**
 * Transponuje akord z zachowaniem poprawnego zapisu enharmonicznego (wg PDF)
 * - Unika zapisów typu C#2 w tonacji Ab (powinno być Db2)
 * - Prawidłowo transponuje akordy w przewrotach (D/F#, A/C#)
 */
function transposeChordToKey(chord, fromKey, toKey) {
  const parsed = parseChordFull(chord);
  if (!parsed) return chord;

  const fromIndex = getNoteIndex(fromKey);
  const toIndex = getNoteIndex(toKey);
  if (fromIndex === -1 || toIndex === -1) return chord;

  const semitones = toIndex - fromIndex;

  const newRoot = transposeNoteToKey(parsed.root, semitones, toKey);
  let result = newRoot + parsed.modifier;

  if (parsed.bass) {
    const newBass = transposeNoteToKey(parsed.bass, semitones, toKey);
    result += '/' + newBass;
  }

  // Normalizuj wynik - usuń nieprawidłowe kombinacje #b lub b#
  return normalizeChord(result);
}

// Funkcja dla kompatybilności wstecznej (transpozycja o półtony bez tonacji docelowej)
function transposeChord(chord, steps) {
  if (!chord) return "";

  const idx = getChordIndex(chord);
  if (idx === -1) return chord;

  const newIdx = (idx + steps + 120) % 12;
  return CHORDS_SCALE[newIdx];
}

/**
 * Transponuje linię tekstu z akordami do nowej tonacji
 * Używa poprawnego zapisu enharmonicznego zgodnie z PDF
 */
function transposeLineToKey(line, fromKey, toKey) {
  if (!line || !fromKey || !toKey || fromKey === toKey) return line;

  // Rozdzielamy tekst na części: tagi HTML i tekst między nimi
  const htmlTagRegex = /(<[^>]+>)/g;
  const parts = line.split(htmlTagRegex);

  // Regex dla akordów - rozbudowany dla wszystkich modyfikatorów z PDF
  // Obsługuje: m, #, b, 2, 5, 6, 7, 11, 13, 69, (no3), sus2, sus4, sus4-3, 4-3, add2, add4, (add4), (add9), (11), (13),
  // add11, add13, maj7, maj9, maj11, maj13, Δ, ø, dim, aug, alt, #7, (b5), (b6), (b9), (#4), (#5), (#5#9), (#5#11), (#11)
  const chordRegex = /([A-G][#b]?)((?:[mM#b∆ø]|maj|min|dim|aug|alt|sus[24]?(?:-3)?|add[0-9]+|\((?:no3|add[49]|b[569]|#[45](?:#[9]|#11)?|11|13)\)|[0-9]+)*)(\/[A-G][#b]?)?/g;

  return parts.map(part => {
    // Jeśli to tag HTML - nie przetwarzaj
    if (part.startsWith('<') && part.endsWith('>')) {
      return part;
    }

    // Przetwórz tekst - szukaj akordów
    return part.replace(chordRegex, (match, root, suffix, bass) => {
      // Jeśli nie ma root, zwróć oryginał
      if (!root) return match;

      // Transponujemy korzeń z poprawnym zapisem enharmonicznym
      const fromIndex = getNoteIndex(fromKey);
      const toIndex = getNoteIndex(toKey);
      const semitones = toIndex - fromIndex;

      const newRoot = transposeNoteToKey(root, semitones, toKey);

      // Transponujemy bas (jeśli istnieje)
      let newBass = "";
      if (bass) {
        const bassNote = bass.substring(1);
        newBass = "/" + transposeNoteToKey(bassNote, semitones, toKey);
      }

      // Normalizuj wynik - usuń nieprawidłowe kombinacje #b lub b#
      return normalizeChord(newRoot + (suffix || "") + newBass);
    });
  }).join('');
}

// Funkcja dla kompatybilności wstecznej (transpozycja o półtony)
function transposeLine(line, steps) {
  if (!line || steps === 0) return line;

  const htmlTagRegex = /(<[^>]+>)/g;
  const parts = line.split(htmlTagRegex);

  const chordRegex = /([A-G][#b]?)((?:[mM#b∆ø]|maj|min|dim|aug|alt|sus[24]?(?:-3)?|add[0-9]+|\((?:no3|add[49]|b[569]|#[45](?:#[9]|#11)?|11|13)\)|[0-9]+)*)(\/[A-G][#b]?)?/g;

  return parts.map(part => {
    if (part.startsWith('<') && part.endsWith('>')) {
      return part;
    }

    return part.replace(chordRegex, (match, root, suffix, bass) => {
      if (!root) return match;

      const newRoot = transposeChord(root, steps);

      let newBass = "";
      if (bass) {
        const bassNote = bass.substring(1);
        newBass = "/" + transposeChord(bassNote, steps);
      }

      // Normalizuj wynik - usuń nieprawidłowe kombinacje #b lub b#
      return normalizeChord(newRoot + (suffix || "") + newBass);
    });
  }).join('');
}

// --- FORMATOWANIE AKORDÓW (rozmiary czcionek) ---

// Lista wszystkich modyfikatorów akordów (najdłuższe najpierw, aby regex działał poprawnie)
const CHORD_MODIFIERS = [
  // Złożone modyfikatory
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
 */
const createChordRegex = () => {
  const escapedModifiers = CHORD_MODIFIERS.map(m =>
    m.replace(/[()#∆ø]/g, c => `\\${c}`)
  );
  const modifierPattern = `(?:${escapedModifiers.join('|')})*`;
  return new RegExp(
    `(?<![a-zA-Z0-9_"'=])([A-G][#b]?)(${modifierPattern})(\\/[A-G][#b]?)?(?![a-zA-Z0-9])`,
    'g'
  );
};

/**
 * Formatuje wszystkie akordy w treści HTML z odpowiednimi rozmiarami czcionek
 * - Główna litera: bazowy rozmiar, pogrubienie
 * - Modyfikatory (#, b, m, 7, sus, etc.): -2pt
 * - Slash i bas: -1pt
 * - Znaki chromatyczne basu: -3pt
 */
const formatChordsWithFontSizes = (htmlContent, baseFontSize = 14) => {
  if (!htmlContent) return htmlContent;

  const modifierSize = baseFontSize - 2;
  const bassSize = baseFontSize - 1;
  const bassAccidentalSize = baseFontSize - 3;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const processTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text || !text.trim()) return;
      if (!/[A-G]/.test(text)) return;

      const chordRegex = createChordRegex();
      let lastIndex = 0;
      let match;
      const fragments = [];
      let hasMatch = false;

      while ((match = chordRegex.exec(text)) !== null) {
        hasMatch = true;

        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        const fullMatch = match[0];
        const root = match[1];
        const modifier = match[2] || '';
        const bassWithSlash = match[3] || '';

        const chordSpan = document.createElement('span');
        chordSpan.setAttribute('data-chord', fullMatch);

        // Główna litera (pogrubiona, bazowy rozmiar)
        const rootMain = document.createElement('span');
        rootMain.style.fontSize = `${baseFontSize}px`;
        rootMain.style.fontWeight = 'bold';
        rootMain.textContent = root.charAt(0);
        chordSpan.appendChild(rootMain);

        // Znak chromatyczny przy prymie (#/b) - mniejszy o 2pt
        if (root.length > 1) {
          const rootAccidental = document.createElement('span');
          rootAccidental.style.fontSize = `${modifierSize}px`;
          rootAccidental.textContent = root.substring(1);
          chordSpan.appendChild(rootAccidental);
        }

        // Modyfikator - mniejszy o 2pt
        if (modifier) {
          const modSpan = document.createElement('span');
          modSpan.style.fontSize = `${modifierSize}px`;
          modSpan.textContent = modifier;
          chordSpan.appendChild(modSpan);
        }

        // Bas (slash chord) - mniejszy o 1pt, znak chromatyczny o 3pt
        if (bassWithSlash) {
          const bass = bassWithSlash.substring(1);

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

      if (hasMatch) {
        if (lastIndex < text.length) {
          fragments.push(document.createTextNode(text.substring(lastIndex)));
        }

        const parent = node.parentNode;
        fragments.forEach(frag => parent.insertBefore(frag, node));
        parent.removeChild(node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hasAttribute('data-chord')) return;
      if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
      Array.from(node.childNodes).forEach(child => processTextNodes(child));
    }
  };

  processTextNodes(tempDiv);
  return tempDiv.innerHTML;
};

/**
 * Formatuje akordy dla wydruku PDF z wyrównaniem do dołu
 * Wszystkie elementy mają ten sam rozmiar czcionki, ale mniejsze są w tagu <small>
 * z vertical-align: text-bottom dla wyrównania dolnych krawędzi
 */
const formatChordsForPDF = (htmlContent, baseFontSize = 14) => {
  if (!htmlContent) return htmlContent;

  // Rozmiary czcionek
  const mainSize = baseFontSize;
  const smallSize = Math.round(baseFontSize * 0.7); // 70% dla modyfikatorów

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const processTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text || !text.trim()) return;
      if (!/[A-G]/.test(text)) return;

      const chordRegex = createChordRegex();
      let lastIndex = 0;
      let match;
      const fragments = [];
      let hasMatch = false;

      while ((match = chordRegex.exec(text)) !== null) {
        hasMatch = true;

        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        const fullMatch = match[0];
        const root = match[1];
        const modifier = match[2] || '';
        const bassWithSlash = match[3] || '';

        // Kontener akordu - inline-flex z align-items flex-end
        const chordSpan = document.createElement('span');
        chordSpan.setAttribute('data-chord', fullMatch);
        chordSpan.style.whiteSpace = 'nowrap';
        chordSpan.style.display = 'inline-flex';
        chordSpan.style.alignItems = 'flex-end';
        chordSpan.style.fontFamily = 'Arial, sans-serif';
        chordSpan.style.color = '#000';

        // Główna litera (pogrubiona, bazowy rozmiar)
        const rootMain = document.createElement('span');
        rootMain.style.fontSize = `${mainSize}px`;
        rootMain.style.fontWeight = 'bold';
        rootMain.style.lineHeight = '1';
        rootMain.textContent = root.charAt(0);
        chordSpan.appendChild(rootMain);

        // Znak chromatyczny przy prymie (#/b) - mniejszy
        if (root.length > 1) {
          const rootAccidental = document.createElement('span');
          rootAccidental.style.fontSize = `${smallSize}px`;
          rootAccidental.style.lineHeight = '1';
          rootAccidental.textContent = root.substring(1);
          chordSpan.appendChild(rootAccidental);
        }

        // Modyfikator - mniejszy
        if (modifier) {
          const modSpan = document.createElement('span');
          modSpan.style.fontSize = `${smallSize}px`;
          modSpan.style.lineHeight = '1';
          modSpan.textContent = modifier;
          chordSpan.appendChild(modSpan);
        }

        // Bas (slash chord)
        if (bassWithSlash) {
          const bass = bassWithSlash.substring(1);

          const slashSpan = document.createElement('span');
          slashSpan.style.fontSize = `${mainSize}px`;
          slashSpan.style.lineHeight = '1';
          slashSpan.textContent = '/';
          chordSpan.appendChild(slashSpan);

          const bassMain = document.createElement('span');
          bassMain.style.fontSize = `${mainSize}px`;
          bassMain.style.fontWeight = 'bold';
          bassMain.style.lineHeight = '1';
          bassMain.textContent = bass.charAt(0);
          chordSpan.appendChild(bassMain);

          if (bass.length > 1) {
            const bassAccidental = document.createElement('span');
            bassAccidental.style.fontSize = `${smallSize}px`;
            bassAccidental.style.lineHeight = '1';
            bassAccidental.textContent = bass.substring(1);
            chordSpan.appendChild(bassAccidental);
          }
        }

        fragments.push(chordSpan);
        lastIndex = match.index + fullMatch.length;
      }

      if (hasMatch) {
        if (lastIndex < text.length) {
          fragments.push(document.createTextNode(text.substring(lastIndex)));
        }

        const parent = node.parentNode;
        fragments.forEach(frag => parent.insertBefore(frag, node));
        parent.removeChild(node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hasAttribute('data-chord')) return;
      if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
      Array.from(node.childNodes).forEach(child => processTextNodes(child));
    }
  };

  processTextNodes(tempDiv);
  return tempDiv.innerHTML;
};

// --- KOMPONENTY POMOCNICZE DLA GRAFIKU ---

const TableMultiSelect = ({ options, value, onChange, absentMembers = [], getAssignmentStatus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target) && !event.target.closest('.table-multi-select-portal')) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleSelection = (name, isAbsent) => {
    if (isAbsent) return;
    let newSelection;
    if (selectedItems.includes(name)) {
      newSelection = selectedItems.filter(i => i !== name);
    } else {
      newSelection = [...selectedItems, name];
    }
    onChange(newSelection.join(', '));
  };

  // Funkcja do pobierania koloru tła na podstawie statusu przypisania
  const getItemStyles = (name) => {
    const status = getAssignmentStatus ? getAssignmentStatus(name) : null;
    if (status === 'accepted') {
      return 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800';
    }
    if (status === 'pending') {
      return 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800';
    }
    // default (self-assigned lub brak statusu)
    return 'bg-pink-50 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-pink-100 dark:border-pink-800';
  };

  return (
    <div ref={triggerRef} className="relative w-full">
      <div
        className="w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:border-pink-300 dark:hover:border-pink-500 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap ${getItemStyles(item)}`}>
              {item}
            </span>
          ))
        )}
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="table-multi-select-portal fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: Math.max(180, coords.width)
          }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            const isAbsent = absentMembers.includes(person.full_name);

            return (
              <div
                key={person.id}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-pink-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}
                  ${isSelected ? 'bg-pink-50 dark:bg-gray-800 text-pink-700 dark:text-pink-300 font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name, isAbsent)}
              >
                <span className={isAbsent ? 'line-through decoration-gray-400 dark:decoration-gray-600' : ''}>
                  {person.full_name}
                </span>
                {isSelected && !isAbsent && <Check size={12} />}
                {isAbsent && <UserX size={12} className="text-red-300 dark:text-red-500" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

const AbsenceMultiSelect = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target) && !event.target.closest('.absence-multi-select-portal')) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleSelection = (name) => {
    let newSelection;
    if (selectedItems.includes(name)) {
      newSelection = selectedItems.filter(i => i !== name);
    } else {
      newSelection = [...selectedItems, name];
    }
    onChange(newSelection.join(', '));
  };

  return (
    <div ref={triggerRef} className="relative w-full">
      <div
        className="w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:border-red-300 dark:hover:border-red-700 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded text-[10px] border border-red-100 dark:border-red-800 whitespace-nowrap flex items-center gap-1">
              {item}
            </span>
          ))
        )}
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="absence-multi-select-portal fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: Math.max(180, coords.width)
          }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            return (
              <div
                key={person.id}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/30 transition ${isSelected ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                onClick={() => toggleSelection(person.full_name)}
              >
                <span>{person.full_name}</span>
                {isSelected && <UserX size={12} />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

const ScheduleTable = ({ programs, worshipTeam, onUpdateProgram, roles, memberRoles = [], currentUser, assignments = [], onCreateAssignment, onRemoveAssignment }) => {
  const [expandedMonths, setExpandedMonths] = useState({});

  const groupedPrograms = programs.reduce((acc, prog) => {
    if (!prog.date) return acc;
    const date = new Date(prog.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(prog);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedPrograms).sort().reverse();

  useEffect(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const updateRole = async (programId, field, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;
    const currentZespol = programToUpdate.zespol || {};

    // Sprawdź co się zmieniło (dodane/usunięte osoby)
    const oldNames = currentZespol[field] ? currentZespol[field].split(',').map(s => s.trim()).filter(Boolean) : [];
    const newNames = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

    const addedNames = newNames.filter(n => !oldNames.includes(n));
    const removedNames = oldNames.filter(n => !newNames.includes(n));

    // Dla każdej dodanej osoby utwórz przypisanie
    for (const name of addedNames) {
      const member = worshipTeam.find(m => m.full_name === name);
      const isSelfAssignment = currentUser?.name === name;

      console.log('[ScheduleAssignment] Creating:', { programId, name, currentUser, isSelfAssignment });

      if (onCreateAssignment && currentUser?.email) {
        const result = await onCreateAssignment({
          programId,
          teamType: 'worship',
          roleKey: field,
          assignedName: name,
          assignedEmail: member?.email || null,
          assignedByEmail: currentUser?.email,
          assignedByName: currentUser?.name,
          isSelfAssignment
        });
        console.log('[ScheduleAssignment] Result:', result);
      } else {
        console.warn('[ScheduleAssignment] Skipped - missing callback or currentUser.email', { onCreateAssignment: !!onCreateAssignment, currentUser });
      }
    }

    // Dla każdej usuniętej osoby usuń przypisanie
    for (const name of removedNames) {
      if (onRemoveAssignment) {
        await onRemoveAssignment(programId, 'worship', field, name);
      }
    }

    const updatedZespol = { ...currentZespol, [field]: value };
    await onUpdateProgram(programId, { zespol: updatedZespol });
  };

  const updateNotes = async (programId, value) => {
     const programToUpdate = programs.find(p => p.id === programId);
     if (!programToUpdate) return;
     const currentZespol = programToUpdate.zespol || {};
     const updatedZespol = { ...currentZespol, notatki: value };
     await onUpdateProgram(programId, { zespol: updatedZespol });
  };

  const updateAbsence = async (programId, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;
    const currentZespol = programToUpdate.zespol || {};
    const updatedZespol = { ...currentZespol, absencja: value };
    await onUpdateProgram(programId, { zespol: updatedZespol });
  };

  // Dynamiczne kolumny z zakładki Służby lub fallback do statycznych
  const columns = roles && roles.length > 0
    ? roles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
    : [
        { key: 'lider', label: 'Lider', roleId: null },
        { key: 'piano', label: 'Piano', roleId: null },
        { key: 'wokale', label: 'Wokal', roleId: null },
        { key: 'gitara_akustyczna', label: 'Git. Akust.', roleId: null },
        { key: 'gitara_elektryczna', label: 'Git. Elektr.', roleId: null },
        { key: 'bas', label: 'Bas', roleId: null },
        { key: 'cajon', label: 'Cajon', roleId: null },
      ];

  // Funkcja do pobierania statusu przypisania dla osoby
  const getAssignmentStatus = (programId, roleKey, assignedName) => {
    const assignment = assignments.find(
      a => a.program_id === programId &&
           a.team_type === 'worship' &&
           a.role_key === roleKey &&
           a.assigned_name === assignedName
    );
    return assignment?.status || null;
  };

  // Funkcja do filtrowania członków zespołu według przypisania do służby
  const getMembersForRole = (roleId) => {
    if (!roleId || memberRoles.length === 0) {
      // Brak przypisań lub fallback - pokaż wszystkich
      return worshipTeam;
    }
    const assignedMemberIds = memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));

    if (assignedMemberIds.length === 0) {
      // Brak przypisanych osób do tej służby - pokaż wszystkich
      return worshipTeam;
    }

    return worshipTeam.filter(member => assignedMemberIds.includes(String(member.id)));
  };

  return (
    <div className="space-y-4">
      {sortedMonths.map(monthKey => {
        const isExpanded = expandedMonths[monthKey];
        
        return (
          <div 
            key={monthKey} 
            className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative z-0 transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}
          >
            <button 
              onClick={() => toggleMonth(monthKey)}
              className={`w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 flex justify-between items-center transition border-b border-gray-200 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
            >
              <span className="font-bold text-gray-800 dark:text-gray-100 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
              {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400"/> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400"/>}
            </button>
            
            {isExpanded && (
              <div className="overflow-x-auto pb-4 bg-white dark:bg-gray-900 rounded-b-2xl">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                      <th className="p-3 font-semibold w-24 min-w-[90px]">Data</th>
                      {columns.map(col => (
                        <th key={col.key} className="p-3 font-semibold min-w-[130px]">{col.label}</th>
                      ))}
                      <th className="p-3 font-semibold min-w-[130px] text-red-500 dark:text-red-400">Absencja</th>
                      <th className="p-3 font-semibold min-w-[150px]">Notatki</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800 relative">
                    {groupedPrograms[monthKey]
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .map((prog, idx) => {
                        const absentList = prog.zespol?.absencja 
                          ? prog.zespol.absencja.split(',').map(s => s.trim()).filter(Boolean) 
                          : [];

                        return (
                          <tr key={prog.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition relative">
                            <td className="p-3 font-medium text-gray-700 dark:text-gray-300 font-mono text-xs">
                              {formatDateShort(prog.date)}
                            </td>
                            {columns.map(col => (
                              <td key={col.key} className="p-2 relative">
                                <TableMultiSelect
                                  options={getMembersForRole(col.roleId)}
                                  value={prog.zespol?.[col.key] || ''}
                                  onChange={(val) => updateRole(prog.id, col.key, val)}
                                  absentMembers={absentList}
                                  getAssignmentStatus={(name) => getAssignmentStatus(prog.id, col.key, name)}
                                />
                              </td>
                            ))}
                            <td className="p-2 relative">
                              <AbsenceMultiSelect 
                                options={worshipTeam}
                                value={prog.zespol?.absencja || ''}
                                onChange={(val) => updateAbsence(prog.id, val)}
                              />
                            </td>
                            <td className="p-2">
                              <input 
                                className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-pink-500 text-xs p-1 outline-none transition placeholder-gray-300 dark:placeholder-gray-600 text-gray-700 dark:text-gray-300"
                                placeholder="Wpisz..."
                                defaultValue={prog.zespol?.notatki || ''}
                                onBlur={(e) => updateNotes(prog.id, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// --- MODAL SZCZEGÓŁÓW PIEŚNI ---

// Ikony dla ścieżek instrumentów
const MicIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

const DrumIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="9"/>
    <line x1="12" y1="15" x2="12" y2="22"/>
  </svg>
);

const BassIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>
);

const GuitarIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m11.9 12.1 4.514-4.514"/>
    <path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A1 1 0 0 0 17.3 4.5l1.8 1.8a1 1 0 0 0 1.086.287l1.114-.115a1 1 0 0 0 0-1.414Z"/>
    <path d="m6 16 2 2"/>
    <path d="M8.2 9.9C8.7 8.8 9.8 8 11 8c2.8 0 5 2.2 5 5 0 1.2-.8 2.3-1.9 2.8l-.9.4A2 2 0 0 0 12 18a4 4 0 0 1-4 4c-3.3 0-6-2.7-6-6a4 4 0 0 1 4-4 2 2 0 0 0 1.8-1.2Z"/>
  </svg>
);

// Zaawansowany odtwarzacz MP3 z pitch shift (bez zmiany tempa) i kontrolą ścieżek
const AudioPlayer = ({ url, name }) => {
  const audioContextRef = useRef(null);
  const shifterRef = useRef(null);
  const gainNodeRef = useRef(null);
  const animationRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pitchShift, setPitchShift] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showStemControls, setShowStemControls] = useState(false);

  // Głośności ścieżek (0-100)
  const [stemVolumes, setStemVolumes] = useState({
    vocals: 100,
    drums: 100,
    bass: 100,
    other: 100
  });

  // Czy ścieżki są włączone
  const [stemEnabled, setStemEnabled] = useState({
    vocals: true,
    drums: true,
    bass: true,
    other: true
  });

  // Inicjalizacja AudioContext
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    return audioContextRef.current;
  };

  // Załaduj audio z SoundTouchJS
  const loadAudio = async () => {
    if (!url || isReady) return;

    setIsLoading(true);
    try {
      const ctx = initAudioContext();

      // Pobierz audio
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      // Utwórz PitchShifter z SoundTouchJS
      shifterRef.current = new PitchShifter(ctx, arrayBuffer, 16384);
      shifterRef.current.tempo = 1.0;
      shifterRef.current.pitch = 1.0;

      // Gain node
      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.connect(ctx.destination);

      // Podłącz shifter do gain
      shifterRef.current.connect(gainNodeRef.current);

      setDuration(shifterRef.current.duration);
      setIsReady(true);

      // Callback dla aktualizacji czasu
      shifterRef.current.on('play', (detail) => {
        setCurrentTime(detail.timePlayed);
      });

    } catch (err) {
      console.error('Błąd ładowania audio:', err);
    }
    setIsLoading(false);
  };

  // Aktualizacja pitch
  useEffect(() => {
    if (shifterRef.current) {
      const pitchFactor = Math.pow(2, pitchShift / 12);
      shifterRef.current.pitch = pitchFactor;
    }
  }, [pitchShift]);

  // Animacja czasu
  useEffect(() => {
    if (isPlaying && shifterRef.current) {
      const updateTime = () => {
        if (shifterRef.current) {
          setCurrentTime(shifterRef.current.timePlayed || 0);
          if (shifterRef.current.timePlayed >= duration) {
            setIsPlaying(false);
            setCurrentTime(0);
            shifterRef.current.percentagePlayed = 0;
          } else {
            animationRef.current = requestAnimationFrame(updateTime);
          }
        }
      };
      animationRef.current = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, duration]);

  const togglePlay = async () => {
    // Załaduj audio jeśli nie gotowe
    if (!isReady) {
      await loadAudio();
    }

    const ctx = audioContextRef.current;
    const shifter = shifterRef.current;

    if (!ctx || !shifter) return;

    // Resume context jeśli suspended
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (isPlaying) {
      shifter.disconnect();
      setIsPlaying(false);
    } else {
      shifter.connect(gainNodeRef.current);
      setIsPlaying(true);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(x / rect.width, 1));

    if (shifterRef.current) {
      shifterRef.current.percentagePlayed = percentage;
      setCurrentTime(percentage * duration);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const changePitch = (delta) => {
    setPitchShift(prev => Math.max(-12, Math.min(12, prev + delta)));
  };

  const resetPitch = () => {
    setPitchShift(0);
  };

  const getPitchLabel = () => {
    if (pitchShift === 0) return 'Oryginał';
    const sign = pitchShift > 0 ? '+' : '';
    return `${sign}${pitchShift} półton${Math.abs(pitchShift) === 1 ? '' : pitchShift >= 2 && pitchShift <= 4 ? 'y' : 'ów'}`;
  };

  const toggleStem = (stem) => {
    setStemEnabled(prev => ({ ...prev, [stem]: !prev[stem] }));
  };

  const changeStemVolume = (stem, value) => {
    setStemVolumes(prev => ({ ...prev, [stem]: value }));
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (shifterRef.current) {
        shifterRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stemConfig = [
    { key: 'vocals', label: 'Wokal', icon: MicIcon, color: 'pink' },
    { key: 'drums', label: 'Perkusja', icon: DrumIcon, color: 'orange' },
    { key: 'bass', label: 'Bas', icon: BassIcon, color: 'purple' },
    { key: 'other', label: 'Inne', icon: GuitarIcon, color: 'blue' }
  ];

  return (
    <div className="mt-3 p-3 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-gray-700 dark:to-gray-700 rounded-xl border border-pink-100 dark:border-gray-600">
      {/* Główne kontrolki */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-pink-600 dark:bg-pink-500 text-white shadow-lg shadow-pink-500/30 hover:bg-pink-700 dark:hover:bg-pink-600 transition disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <Pause size={18} />
          ) : (
            <Play size={18} className="ml-0.5" />
          )}
        </button>

        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span className="flex items-center gap-1">
              <Volume2 size={12} />
              {name || 'Odtwarzacz MP3'}
            </span>
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div
            className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full cursor-pointer overflow-hidden"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Kontrolki zmiany tonacji */}
      <div className="mt-3 pt-3 border-t border-pink-100 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
            <Music size={12} />
            Tonacja:
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changePitch(-1)}
              disabled={pitchShift <= -12}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold"
            >
              −
            </button>
            <button
              onClick={resetPitch}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition min-w-[80px] ${
                pitchShift === 0
                  ? 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                  : 'bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-300 hover:bg-pink-200 dark:hover:bg-pink-800/50'
              }`}
            >
              {getPitchLabel()}
            </button>
            <button
              onClick={() => changePitch(1)}
              disabled={pitchShift >= 12}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold"
            >
              +
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
          Zmiana tonacji bez zmiany tempa
        </p>
      </div>

      {/* Przycisk rozwijania kontrolek ścieżek */}
      <div className="mt-3 pt-3 border-t border-pink-100 dark:border-gray-600">
        <button
          onClick={() => setShowStemControls(!showStemControls)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500 transition"
        >
          <span className="flex items-center gap-2">
            <Users size={14} />
            Kontrola instrumentów
          </span>
          <ChevronDown size={14} className={`transform transition ${showStemControls ? 'rotate-180' : ''}`} />
        </button>

        {/* Panel kontroli ścieżek */}
        {showStemControls && (
          <div className="mt-3 space-y-2">
            {stemConfig.map(({ key, label, icon: Icon, color }) => (
              <div key={key} className="flex items-center gap-3 p-2 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                <button
                  onClick={() => toggleStem(key)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${
                    stemEnabled[key]
                      ? `bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600 dark:text-${color}-400`
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}
                  style={{
                    backgroundColor: stemEnabled[key]
                      ? (color === 'pink' ? '#fce7f3' : color === 'orange' ? '#ffedd5' : color === 'purple' ? '#f3e8ff' : '#dbeafe')
                      : undefined,
                    color: stemEnabled[key]
                      ? (color === 'pink' ? '#db2777' : color === 'orange' ? '#ea580c' : color === 'purple' ? '#9333ea' : '#2563eb')
                      : undefined
                  }}
                >
                  <Icon size={16} />
                </button>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{stemVolumes[key]}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={stemEnabled[key] ? stemVolumes[key] : 0}
                    onChange={(e) => changeStemVolume(key, parseInt(e.target.value))}
                    disabled={!stemEnabled[key]}
                    className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: stemEnabled[key]
                        ? `linear-gradient(to right, ${color === 'pink' ? '#ec4899' : color === 'orange' ? '#f97316' : color === 'purple' ? '#a855f7' : '#3b82f6'} 0%, ${color === 'pink' ? '#ec4899' : color === 'orange' ? '#f97316' : color === 'purple' ? '#a855f7' : '#3b82f6'} ${stemVolumes[key]}%, #e5e7eb ${stemVolumes[key]}%, #e5e7eb 100%)`
                        : undefined
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
              Wymaga oddzielnych ścieżek audio (vocals, drums, bass, other)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

function SongDetailsModal({ song, onClose, onEdit }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview | history | materials
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(null);

  // Transpozycja - używamy tonacji docelowej (zgodnie z wytycznymi PDF)
  const [targetKey, setTargetKey] = useState(song?.key || '');

  // Reset targetKey gdy zmieni się pieśń
  React.useEffect(() => {
    setTargetKey(song?.key || '');
  }, [song?.key]);

  // Funkcja pobierania pliku (obejście cross-origin)
  const handleDownloadFile = async (url, filename) => {
    setDownloadingFile(url);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Błąd pobierania:', error);
      // Fallback - otwórz w nowej karcie
      window.open(url, '_blank');
    } finally {
      setDownloadingFile(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  async function fetchHistory() {
    setLoadingHistory(true);
    try {
        const { data: programs } = await supabase.from('programs').select('*').order('date', { ascending: false });
        const songHistory = (programs || []).filter(p => {
            // Sprawdź w schedule - pieśni są w elementach "uwielbienie"
            if (p.schedule && Array.isArray(p.schedule)) {
                return p.schedule.some(row => {
                    if (row.selectedSongs && Array.isArray(row.selectedSongs)) {
                        return row.selectedSongs.some(s => s.songId === song.id);
                    }
                    // Stary format - songIds
                    if (row.songIds && Array.isArray(row.songIds)) {
                        return row.songIds.includes(song.id);
                    }
                    return false;
                });
            }
            return false;
        });
        setHistory(songHistory);
    } catch (e) {
        console.error("Błąd historii", e);
    }
    setLoadingHistory(false);
  }

  // FUNKCJA GENEROWANIA I POBIERANIA PDF (z poprawnym zapisem enharmonicznym wg PDF)
  const handleDownloadPDF = async () => {
      // Użyj transpozycji do tonacji docelowej z poprawnym zapisem enharmonicznym
      let transposedChords = song.chords_bars
        ? (isTransposed
            ? transposeLineToKey(song.chords_bars, originalKey, targetKey)
            : song.chords_bars)
        : "";

      // Formatuj akordy dla PDF (czarna czcionka, Arial, wyrównanie do baseline)
      transposedChords = formatChordsForPDF(transposedChords, 11);

      // Dostosuj style dla PDF - zmniejsz szerokości i marginesy, zachowaj strukturę
      transposedChords = transposedChords
        .replace(/background:\s*rgba\(255,\s*192,\s*203,\s*0\.15\)\s*;?/gi, '')
        .replace(/color:\s*inherit\s*;?/gi, 'color: #000;')
        // Zmniejsz szerokości taktów dla PDF
        .replace(/min-width:\s*80px/gi, 'min-width: 50px')
        .replace(/min-width:\s*100px/gi, 'min-width: 60px')
        .replace(/width:\s*80px/gi, 'width: 50px')
        .replace(/max-width:\s*80px/gi, 'max-width: 50px')
        .replace(/width:\s*40px/gi, 'width: 25px')
        .replace(/max-width:\s*40px/gi, 'max-width: 25px')
        .replace(/min-width:\s*40px/gi, 'min-width: 25px')
        // Zmniejsz marginesy dla PDF
        .replace(/margin:\s*4px\s*0/gi, 'margin: 2px 0')
        .replace(/overflow:\s*hidden/gi, 'overflow: visible')
        // Zmień kolory kresek taktów na czarny
        .replace(/border-left:\s*[\d.]+px\s*solid\s*currentColor/gi, 'border-left: 1px solid #000')
        .replace(/border-right:\s*[\d.]+px\s*solid\s*currentColor/gi, 'border-right: 1px solid #000')
        .replace(/border-left:\s*2px\s*solid\s*#ec4899/gi, 'border-left: 1px solid #000')
        .replace(/border-right:\s*2px\s*solid\s*#ec4899/gi, 'border-right: 1px solid #000');
      const currentKey = targetKey || originalKey || '-';

      // Tworzymy element HTML z pieśnią
      const container = document.createElement('div');
      container.style.width = '794px'; // A4 width at 96 DPI
      container.style.padding = '25px';
      container.style.background = 'white';
      container.style.fontFamily = 'Arial, sans-serif';
      container.style.position = 'absolute';
      container.style.left = '-9999px';

      container.innerHTML = `
        <div style="padding: 15px 0; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f0f0f0;">
          <div style="flex: 1;">
            <h1 style="font-size: 28px; font-weight: 700; color: #333; margin: 0;">${song.title}</h1>
          </div>
          <div style="display: flex; gap: 10px; align-items: stretch;">
            <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 6px; text-align: center; min-width: 65px; display: flex; flex-direction: column; justify-content: center; border: 1px solid #e0e0e0;">
              <div style="font-size: 8px; color: #999; font-weight: 600; text-transform: uppercase; margin-bottom: 3px;">Tonacja</div>
              <div style="font-size: 16px; color: #333; font-weight: 700;">${currentKey || '-'}</div>
            </div>
            <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 6px; text-align: center; min-width: 65px; display: flex; flex-direction: column; justify-content: center; border: 1px solid #e0e0e0;">
              <div style="font-size: 8px; color: #999; font-weight: 600; text-transform: uppercase; margin-bottom: 3px;">Tempo</div>
              <div style="font-size: 13px; color: #333; font-weight: 700;">${song.tempo ? song.tempo + ' BPM' : '-'}</div>
            </div>
            <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 6px; text-align: center; min-width: 65px; display: flex; flex-direction: column; justify-content: center; border: 1px solid #e0e0e0;">
              <div style="font-size: 8px; color: #999; font-weight: 600; text-transform: uppercase; margin-bottom: 3px;">Metrum</div>
              <div style="font-size: 16px; color: #333; font-weight: 700;">${song.meter || '-'}</div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
          <div style="background: #fafafa; border-radius: 6px; padding: 12px; border: 1px solid #e5e5e5;">
            <div style="font-size: 9px; text-transform: uppercase; color: #999; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5;">Tekst</div>
            <pre style="font-family: Arial, sans-serif; white-space: pre-wrap; font-size: 9px; line-height: 1.6; color: #333; margin: 0;">${song.lyrics || 'Brak tekstu'}</pre>
          </div>

          <div style="background: #fafafa; border-radius: 6px; padding: 12px; border: 1px solid #e5e5e5;">
            <div style="font-size: 9px; text-transform: uppercase; color: #999; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5;">
              Akordy w taktach
              ${isTransposed ? `<span style="background: #333; color: white; padding: 2px 5px; border-radius: 3px; font-size: 7px; margin-left: 6px; text-transform: none;">transp. ${originalKey} → ${targetKey}</span>` : ''}
            </div>
            <div style="font-family: Arial, sans-serif; font-size: 11px; line-height: 1.6; color: #000; white-space: pre-wrap;">${transposedChords || 'Brak akordów'}</div>
          </div>
        </div>

        <div style="margin-top: 20px; text-align: center; color: #999; font-size: 9px;">
          Wygenerowano ${new Date().toLocaleDateString('pl-PL')} o ${new Date().toLocaleTimeString('pl-PL')} | App SchWro Południe
        </div>
      `;

      document.body.appendChild(container);

      try {
        const canvas = await html2canvas(container, {
          scale: 2.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });

        document.body.removeChild(container);

        const imgData = canvas.toDataURL('image/png');
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4',
          compress: true
        });

        const imgWidth = doc.internal.pageSize.getWidth();
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        doc.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

        // Funkcja do transliteracji polskich znaków na ASCII
        const sanitizeFileName = (text) => {
          return text
            .replace(/ą/g, 'a')
            .replace(/Ą/g, 'A')
            .replace(/ć/g, 'c')
            .replace(/Ć/g, 'C')
            .replace(/ę/g, 'e')
            .replace(/Ę/g, 'E')
            .replace(/ł/g, 'l')
            .replace(/Ł/g, 'L')
            .replace(/ń/g, 'n')
            .replace(/Ń/g, 'N')
            .replace(/ó/g, 'o')
            .replace(/Ó/g, 'O')
            .replace(/ś/g, 's')
            .replace(/Ś/g, 'S')
            .replace(/ź/g, 'z')
            .replace(/Ź/g, 'Z')
            .replace(/ż/g, 'z')
            .replace(/Ż/g, 'Z')
            .replace(/[^a-zA-Z0-9\s-]/g, '')  // Usuń inne znaki specjalne
            .replace(/\s+/g, '_')  // Zamień spacje na podkreślenia
            .replace(/_+/g, '_')  // Usuń wielokrotne podkreślenia
            .trim();
        };

        const fileName = `${sanitizeFileName(song.title)}.pdf`;
        doc.save(fileName);
      } catch (error) {
        console.error('Błąd generowania PDF:', error);
        alert('Nie udało się wygenerować PDF');
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }
  };

  // Obliczamy transponowane wartości do wyświetlenia (zgodnie z wytycznymi PDF)
  // Używamy tonacji docelowej z poprawnym zapisem enharmonicznym
  const originalKey = song.key || '';
  const displayKey = targetKey || originalKey || '-';
  const isTransposed = originalKey && targetKey && originalKey !== targetKey;

  // Transponuj akordy do nowej tonacji z poprawnym zapisem enharmonicznym
  // Następnie zastosuj formatowanie czcionek (główna litera większa, modyfikatory mniejsze)
  const transposedChords = song.chords_bars
    ? (isTransposed
        ? transposeLineToKey(song.chords_bars, originalKey, targetKey)
        : song.chords_bars)
    : (song.chords || "Brak układu...");

  // Zastosuj formatowanie rozmiaru czcionek dla akordów (14px bazowy)
  const displayChords = formatChordsWithFontSizes(transposedChords, 14);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700 flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="flex justify-between items-start p-6 border-b border-gray-100 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-3 mb-1">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{song.title}</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                {song.author && <span>{song.author}</span>}
                {song.category && (
                    <>
                        <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                        <span>{song.category}</span>
                    </>
                )}
            </p>
          </div>
          <div className="flex gap-2">
             <button onClick={handleDownloadPDF} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-2">
                <FileDown size={16}/> PDF
            </button>
            <button onClick={onEdit} className="px-4 py-2 bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-xl font-bold text-sm hover:bg-pink-100 dark:hover:bg-pink-900/50 transition">
                Edytuj
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition">
                <X size={24} />
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="px-6 pt-6 pb-0">
             <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
                <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'overview' ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                    <FileText size={16}/> Przegląd
                </button>
                <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'history' ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                    <History size={16}/> Historia użycia
                </button>
                <button onClick={() => setActiveTab('materials')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'materials' ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                    <LinkIcon size={16}/> Materiały
                </button>
            </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    
                    {/* PŁASKI PASEK: TONACJA | TEMPO | METRUM */}
                    <div className="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                        
                        {/* TONACJA ORYGINALNA */}
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                <Music size={14}/> Tonacja
                            </div>
                            <span className="font-mono text-lg font-bold text-pink-600 dark:text-pink-400 min-w-[24px] text-center">{song.key || "-"}</span>
                        </div>

                        {/* TRANSPOZYCJA - wybór tonacji docelowej (wg wytycznych PDF) */}
                        <div className="flex items-center gap-3 bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-xl shadow-sm border border-purple-200 dark:border-purple-700">
                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase">
                                Transponuj do
                            </div>
                            <select
                                value={targetKey}
                                onChange={(e) => setTargetKey(e.target.value)}
                                className="h-8 px-3 text-sm font-bold bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-600 rounded-lg text-purple-700 dark:text-purple-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400"
                            >
                                {KEYS.map((k) => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                            {isTransposed && (
                                <button
                                    onClick={() => setTargetKey(originalKey)}
                                    className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 underline"
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* TEMPO */}
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                <Clock size={14}/> Tempo
                            </div>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{song.tempo ? `${song.tempo} BPM` : '-'}</span>
                        </div>

                        {/* METRUM */}
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                <Hash size={14}/> Metrum
                            </div>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{song.meter || '-'}</span>
                        </div>

                         {/* TAGI */}
                         <div className="flex items-center gap-2 ml-auto">
                            {(song.tags || []).map(t => (
                                <span key={t} className="px-3 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-bold border border-orange-100 dark:border-orange-800">
                                    #{t}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* TEKST / CHWYTY */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Tekst</h3>
                            <pre className="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                                {song.lyrics || "Brak tekstu..."}
                            </pre>
                        </div>
                        <div className="bg-pink-50/50 dark:bg-gray-800 rounded-xl p-5 border border-pink-100 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Akordy w taktach</h3>
                                {isTransposed && <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900 px-2 py-0.5 rounded">TRANSPONOWANO ({originalKey} → {targetKey})</span>}
                            </div>
                            {/* Ukryj różowe tło komórek w widoku szczegółów */}
                            <style>{`
                                .chords-display-view .chord-spacer {
                                    background: transparent !important;
                                }
                            `}</style>
                            <div
                                className="chords-display-view whitespace-pre-wrap font-mono text-pink-800 dark:text-pink-300 text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: displayChords || 'Brak układu...' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-4">
                    {loadingHistory ? (
                        <div className="text-center py-10 text-gray-400">Ładowanie historii...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                            Brak historii użycia tej pieśni w programach.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map(h => (
                                <div key={h.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-sm transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900 flex items-center justify-center text-pink-600 dark:text-pink-300 font-bold text-xs">
                                            {new Date(h.date).getDate()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-800 dark:text-gray-200">{new Date(h.date).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Lider: {h.zespol?.lider || 'Nieznany'}</div>
                                        </div>
                                    </div>
                                    <div className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold">
                                        Program
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'materials' && (
                <div className="space-y-6">
                     {/* INFO */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            Aby dodać lub edytować załączniki, użyj przycisku <strong>"Edytuj"</strong> i przejdź do zakładki "Załączniki".
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mt-2">
                            Załączniki i Linki ({(song.attachments || []).length})
                        </h3>

                        {(!song.attachments || song.attachments.length === 0) && (
                             <div className="text-center py-8 text-gray-400 text-sm italic border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                                 <FileText size={32} className="mx-auto mb-2 opacity-50" />
                                 Brak materiałów
                                 <p className="text-xs mt-1">Kliknij "Edytuj" aby dodać załączniki</p>
                             </div>
                        )}

                        {(song.attachments || []).map((att, idx) => {
                            const isMP3 = att.type === 'file' && (att.name?.toLowerCase().endsWith('.mp3') || att.url?.toLowerCase().endsWith('.mp3'));

                            return (
                                <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-pink-300 dark:hover:border-pink-500 transition group">
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${att.type === 'link' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : isMP3 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-pink-100 dark:bg-pink-900/30 text-pink-600'}`}>
                                                {att.type === 'link' ? <LinkIcon size={24}/> : isMP3 ? <Music size={24}/> : <FileText size={24}/>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate">
                                                    {att.description || att.name || att.url}
                                                </div>
                                                {att.description && att.name && att.description !== att.name && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                        {att.type === 'file' ? att.name : att.url}
                                                    </div>
                                                )}
                                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${att.type === 'link' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : isMP3 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-pink-100 dark:bg-pink-900/30 text-pink-600'}`}>
                                                        {att.type === 'link' ? 'Link' : isMP3 ? 'MP3' : 'Plik'}
                                                    </span>
                                                    {att.date && new Date(att.date).toLocaleDateString('pl-PL')}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0 ml-3">
                                            {att.type === 'file' && (
                                                <button
                                                    onClick={() => handleDownloadFile(att.url, att.name)}
                                                    disabled={downloadingFile === att.url}
                                                    className="p-2.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition disabled:opacity-50"
                                                    title="Pobierz plik"
                                                >
                                                    {downloadingFile === att.url ? (
                                                        <div className="w-[18px] h-[18px] border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Download size={18}/>
                                                    )}
                                                </button>
                                            )}
                                            <a
                                                href={att.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2.5 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900 hover:text-pink-600 transition"
                                                title={att.type === 'link' ? 'Otwórz link' : 'Podgląd'}
                                            >
                                                <ExternalLink size={18}/>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Odtwarzacz MP3 */}
                                    {isMP3 && (
                                        <div className="px-4 pb-4">
                                            <AudioPlayer url={att.url} name={att.description || att.name} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Kompatybilność wsteczna dla starych pól */}
                        {song.sheet_music_url && (
                             <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center"><FileText size={20}/></div>
                                    <div><div className="font-bold text-sm text-gray-800 dark:text-gray-200">Nuty / PDF (Legacy)</div></div>
                                </div>
                                <a href={song.sheet_music_url} target="_blank" rel="noreferrer" className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg hover:text-pink-600"><ExternalLink size={18}/></a>
                             </div>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
}

// --- GŁÓWNY MODUŁ ---

export default function WorshipModule() {
  const { userRole } = useUserRole();
  const [activeTab, setActiveTab] = useState('wall');
  const [team, setTeam] = useState([]);
  const [songs, setSongs] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState({ email: '', name: '' });

  // Hook do zarządzania przypisaniami do służby
  const {
    assignments,
    fetchAssignmentsForPrograms,
    createAssignment,
    removeAssignment
  } = useScheduleAssignments();

  const [showSongModal, setShowSongModal] = useState(false);
  const [songModalKey, setSongModalKey] = useState(0); // Key do wymuszenia remount SongForm
  const [showSongDetails, setShowSongDetails] = useState(null);
  const [showMemberModal, setShowMemberModal] = useState(false);

  const [songForm, setSongForm] = useState({});
  const [memberForm, setMemberForm] = useState({ id: null, full_name: '', role: '', status: 'Aktywny', phone: '', email: '' });
  const [selectedMemberRoles, setSelectedMemberRoles] = useState([]);

  const [songFilter, setSongFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [allUniqueTags, setAllUniqueTags] = useState([]);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  // Służby z team_roles
  const [worshipRoles, setWorshipRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);

  // Finance data
  const [budgetItems, setBudgetItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    payment_date: '',
    amount: '',
    contractor: '',
    category: 'Grupa Uwielbienia',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'Grupa Uwielbienia'
  });

  useEffect(() => {
    fetchData();
    fetchWorshipRoles();
  }, []);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab]);

  const fetchWorshipRoles = async () => {
    try {
      const { data: rolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', 'worship')
        .eq('is_active', true)
        .order('display_order');
      setWorshipRoles(rolesData || []);

      // Pobierz przypisania członków do służb
      const { data: memberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', 'worship_team');
      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania służb:', err);
    }
  };

  const fetchFinanceData = async () => {
    const currentYear = new Date().getFullYear();
    const ministryName = 'Grupa Uwielbienia';

    try {
      const { data: budget, error: budgetError } = await supabase
        .from('budget_items')
        .select('*')
        .eq('ministry', ministryName)
        .eq('year', currentYear)
        .order('id', { ascending: true });

      if (budgetError) throw budgetError;
      setBudgetItems(budget || []);

      const { data: exp, error: expError } = await supabase
        .from('expense_transactions')
        .select('*')
        .eq('ministry', ministryName)
        .gte('payment_date', `${currentYear}-01-01`)
        .lte('payment_date', `${currentYear}-12-31`)
        .order('payment_date', { ascending: false });

      if (expError) throw expError;
      setExpenses(exp || []);
    } catch (error) {
      console.error('Error fetching finance data:', error);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFile(true);
    try {
      const uploadedDocs = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `expense_documents/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('finance')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('finance').getPublicUrl(filePath);

        uploadedDocs.push({
          name: file.name,
          url: data.publicUrl,
          uploadedAt: new Date().toISOString()
        });
      }

      setExpenseForm({
        ...expenseForm,
        documents: [...expenseForm.documents, ...uploadedDocs]
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Błąd przesyłania pliku: ' + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const removeDocument = (index) => {
    setExpenseForm({
      ...expenseForm,
      documents: expenseForm.documents.filter((_, i) => i !== index)
    });
  };

  const addTag = () => {
    if (newTag.trim() && !expenseForm.tags.includes(newTag.trim())) {
      setExpenseForm({ ...expenseForm, tags: [...expenseForm.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const removeTag = (tag) => {
    setExpenseForm({ ...expenseForm, tags: expenseForm.tags.filter(t => t !== tag) });
  };

  const saveExpense = async () => {
    if (!expenseForm.payment_date || !expenseForm.amount || !expenseForm.contractor || !expenseForm.description || !expenseForm.responsible_person) {
      alert('Wypełnij wymagane pola');
      return;
    }

    try {
      const { error } = await supabase.from('expense_transactions').insert([{
        payment_date: expenseForm.payment_date,
        amount: parseFloat(expenseForm.amount),
        contractor: expenseForm.contractor,
        category: expenseForm.category,
        description: expenseForm.description,
        detailed_description: expenseForm.detailed_description,
        responsible_person: expenseForm.responsible_person,
        documents: expenseForm.documents,
        tags: expenseForm.tags,
        ministry: expenseForm.ministry
      }]);

      if (error) throw error;

      setShowExpenseModal(false);
      const ministryName = expenseForm.ministry;
      setExpenseForm({
        payment_date: '',
        amount: '',
        contractor: '',
        category: ministryName,
        description: '',
        detailed_description: '',
        responsible_person: '',
        documents: [],
        tags: [],
        ministry: ministryName
      });
      fetchFinanceData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  async function fetchData() {
    setLoading(true);
    try {
      const { data: t } = await supabase.from('worship_team').select('*').order('full_name');
      const { data: s } = await supabase.from('songs').select('*').order('title');
      const { data: p } = await supabase.from('programs').select('*').order('date', { ascending: false });

      // Pobierz dane zalogowanego użytkownika
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('app_users')
          .select('full_name')
          .eq('email', user.email)
          .single();
        setCurrentUser({
          email: user.email,
          name: profile?.full_name || user.email
        });
      }

      setTeam(t || []);
      setSongs(s || []);
      setPrograms(p || []);

      // Pobierz przypisania dla programów
      if (p && p.length > 0) {
        const programIds = p.map(prog => prog.id);
        await fetchAssignmentsForPrograms(programIds);
      }

      // Pobierz unikalne tagi z wszystkich pieśni + z localStorage
      const tagsSet = new Set();
      (s || []).forEach(song => {
        if (Array.isArray(song.tags)) {
          song.tags.forEach(tag => tagsSet.add(tag));
        }
      });
      // Dodaj tagi zapisane w localStorage
      try {
        const savedTags = JSON.parse(localStorage.getItem('worship_custom_tags') || '[]');
        savedTags.forEach(tag => tagsSet.add(tag));
      } catch (e) {}
      setAllUniqueTags([...tagsSet].sort());
    } catch (err) {
      console.error('Błąd pobierania danych:', err);
    }
    setLoading(false);
  }

  const saveMember = async () => {
    try {
      let memberId = memberForm.id;

      if (memberForm.id) {
        const { id, ...updateData } = memberForm;
        await supabase.from('worship_team').update(updateData).eq('id', memberForm.id);
      } else {
        const { id, ...rest } = memberForm;
        const { data: newMember, error } = await supabase.from('worship_team').insert([rest]).select().single();
        if (error) throw error;
        memberId = newMember.id;
      }

      // Zapisz przypisania do służb
      if (memberId) {
        // Usuń obecne przypisania
        await supabase
          .from('team_member_roles')
          .delete()
          .eq('member_id', String(memberId))
          .eq('member_table', 'worship_team');

        // Dodaj nowe przypisania
        if (selectedMemberRoles.length > 0) {
          const assignments = selectedMemberRoles.map(roleId => ({
            member_id: String(memberId),
            member_table: 'worship_team',
            role_id: roleId
          }));
          await supabase.from('team_member_roles').insert(assignments);
        }
      }

      setShowMemberModal(false);
      setSelectedMemberRoles([]);
      fetchData();
      fetchWorshipRoles(); // Odśwież przypisania
    } catch (err) {
      alert('Błąd: ' + err.message);
    }
  };

  const loadMemberRoles = (memberId) => {
    const roles = memberRoles
      .filter(mr => String(mr.member_id) === String(memberId))
      .map(mr => mr.role_id);
    setSelectedMemberRoles(roles);
  };

  const getMemberRoleNames = (memberId) => {
    const roleIds = memberRoles
      .filter(mr => String(mr.member_id) === String(memberId))
      .map(mr => mr.role_id);
    return worshipRoles
      .filter(r => roleIds.includes(r.id))
      .map(r => r.name);
  };

  const deleteMember = async (id) => {
    if(confirm('Usunąć?')) {
      await supabase.from('worship_team').delete().eq('id', id);
      fetchData();
    }
  };

  const deleteSong = async (id) => {
    if(confirm('Usunąć pieśń?')) {
      await supabase.from('songs').delete().eq('id', id);
      fetchData();
    }
  };

  const removeTagFromSong = async (songId, tagToRemove) => {
    const song = songs.find(s => s.id === songId);
    if (!song) return;

    const updatedTags = (song.tags || []).filter(t => t !== tagToRemove);

    try {
      await supabase.from('songs').update({ tags: updatedTags }).eq('id', songId);
      // Aktualizuj stan lokalnie
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, tags: updatedTags } : s));
    } catch (err) {
      console.error('Błąd usuwania tagu:', err);
    }
  };

  // Zmiana nazwy tagu we wszystkich pieśniach
  const renameTagGlobally = async (oldTag, newTag) => {
    if (!newTag.trim() || oldTag === newTag) return;

    const songsWithTag = songs.filter(s => Array.isArray(s.tags) && s.tags.includes(oldTag));

    try {
      for (const song of songsWithTag) {
        const updatedTags = song.tags.map(t => t === oldTag ? newTag.trim() : t);
        await supabase.from('songs').update({ tags: updatedTags }).eq('id', song.id);
      }

      // Aktualizuj stan lokalnie
      setSongs(prev => prev.map(s => {
        if (Array.isArray(s.tags) && s.tags.includes(oldTag)) {
          return { ...s, tags: s.tags.map(t => t === oldTag ? newTag.trim() : t) };
        }
        return s;
      }));

      // Aktualizuj listę unikalnych tagów
      setAllUniqueTags(prev => {
        const updated = prev.map(t => t === oldTag ? newTag.trim() : t);
        return [...new Set(updated)].sort();
      });

      setEditingTag(null);
      setEditingTagValue('');
    } catch (err) {
      console.error('Błąd zmiany nazwy tagu:', err);
    }
  };

  // Usunięcie tagu ze wszystkich pieśni
  const deleteTagGlobally = async (tagToDelete) => {
    if (!confirm(`Czy na pewno chcesz usunąć tag "${tagToDelete}" ze wszystkich pieśni?`)) return;

    const songsWithTag = songs.filter(s => Array.isArray(s.tags) && s.tags.includes(tagToDelete));

    try {
      for (const song of songsWithTag) {
        const updatedTags = song.tags.filter(t => t !== tagToDelete);
        await supabase.from('songs').update({ tags: updatedTags }).eq('id', song.id);
      }

      // Aktualizuj stan lokalnie
      setSongs(prev => prev.map(s => {
        if (Array.isArray(s.tags) && s.tags.includes(tagToDelete)) {
          return { ...s, tags: s.tags.filter(t => t !== tagToDelete) };
        }
        return s;
      }));

      // Usuń z listy unikalnych tagów
      setAllUniqueTags(prev => prev.filter(t => t !== tagToDelete));

      // Usuń z localStorage
      try {
        const savedTags = JSON.parse(localStorage.getItem('worship_custom_tags') || '[]');
        const updatedSavedTags = savedTags.filter(t => t !== tagToDelete);
        localStorage.setItem('worship_custom_tags', JSON.stringify(updatedSavedTags));
      } catch (e) {}

      // Wyczyść filtr jeśli był ustawiony na usunięty tag
      if (tagFilter === tagToDelete) {
        setTagFilter('');
      }
    } catch (err) {
      console.error('Błąd usuwania tagu:', err);
    }
  };

  // Dodanie nowego tagu (globalnie - będzie dostępny w liście)
  const addNewTag = () => {
    const trimmedTag = newTagInput.trim();
    if (!trimmedTag) return;

    // Sprawdź czy tag już istnieje (case-insensitive)
    if (allUniqueTags.some(t => t.toLowerCase() === trimmedTag.toLowerCase())) {
      alert(`Tag "${trimmedTag}" już istnieje w bazie.`);
      return;
    }

    // Dodaj do listy unikalnych tagów
    setAllUniqueTags(prev => [...prev, trimmedTag].sort());

    // Zapisz do localStorage
    try {
      const savedTags = JSON.parse(localStorage.getItem('worship_custom_tags') || '[]');
      if (!savedTags.includes(trimmedTag)) {
        savedTags.push(trimmedTag);
        localStorage.setItem('worship_custom_tags', JSON.stringify(savedTags));
      }
    } catch (e) {}

    setNewTagInput('');
  };

  const handleProgramUpdate = async (id, updates) => {
    setPrograms(prev => prev.map(p => {
      if (p.id === id) {
        if (updates.zespol) {
          return { ...p, ...updates, zespol: { ...p.zespol, ...updates.zespol } };
        }
        return { ...p, ...updates };
      }
      return p;
    }));
    await supabase.from('programs').update(updates).eq('id', id);
  };

  const filteredSongs = songs.filter(s =>
    (s.title || '').toLowerCase().includes(songFilter.toLowerCase()) &&
    (tagFilter
      ? (Array.isArray(s.tags)
        ? s.tags.some(t => String(t).toLowerCase().includes(tagFilter.toLowerCase()))
        : false)
      : true)
  );

  if (loading) return <div className="p-10 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div></div>;

  // Definicja zakładek
  const tabs = [
    { id: 'wall', label: 'Tablica', icon: MessageSquare },
    { id: 'events', label: 'Wydarzenia', icon: Calendar },
    { id: 'schedule', label: 'Grafik', icon: Calendar },
    { id: 'songs', label: 'Baza Pieśni', icon: Music },
    ...(hasTabAccess('worship', 'members', userRole) ? [{ id: 'members', label: 'Członkowie', icon: User }] : []),
    ...(hasTabAccess('worship', 'finances', userRole) ? [{ id: 'finances', label: 'Finanse', icon: DollarSign }] : []),
    ...(hasTabAccess('worship', 'members', userRole) ? [{ id: 'roles', label: 'Służby', icon: Users }] : []),
    ...(hasTabAccess('worship', 'equipment', userRole) ? [{ id: 'equipment', label: 'Wyposażenie', icon: Package }] : []),
    { id: 'files', label: 'Pliki', icon: FolderOpen },
  ];

  return (
    <div className="space-y-4 lg:space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl lg:text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Grupa Uwielbienia</h1>
      </div>

      {/* TAB NAVIGATION */}
      <ResponsiveTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* SEKCJA: WYDARZENIA */}
      {activeTab === 'events' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[50] transition-colors">
          <EventsTab ministry="worship" currentUserEmail={currentUser.email} />
        </section>
      )}

      {/* SEKCJA 1: GRAFIK ZESPOŁU */}
      {activeTab === 'schedule' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[50] transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-gray-100">Grafik Zespołu</h2>
        </div>
        <ScheduleTable
          programs={programs}
          worshipTeam={team}
          onUpdateProgram={handleProgramUpdate}
          roles={worshipRoles}
          memberRoles={memberRoles}
          currentUser={currentUser}
          assignments={assignments}
          onCreateAssignment={createAssignment}
          onRemoveAssignment={removeAssignment}
        />
      </section>
      )}

      {/* SEKCJA 2: BAZA PIEŚNI */}
      {activeTab === 'songs' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[40] transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-gray-100">Baza Pieśni</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={() => setShowTagsModal(true)} className="flex-1 sm:flex-none bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/40 dark:to-orange-900/40 text-pink-700 dark:text-pink-300 text-sm px-3 lg:px-4 py-2.5 rounded-xl font-medium border border-pink-200 dark:border-pink-800 hover:from-pink-100 hover:to-orange-100 dark:hover:from-pink-900/60 dark:hover:to-orange-900/60 transition flex items-center justify-center gap-2"><Tag size={16}/> <span className="hidden sm:inline">Zarządzaj</span> Tagi</button>
            <button onClick={() => { setSongForm({}); setShowSongModal(true); }} className="flex-1 sm:flex-none bg-gradient-to-r from-orange-600 to-pink-600 text-white text-sm px-4 lg:px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-orange-500/50 transition flex items-center justify-center gap-2"><Plus size={18}/> <span className="hidden sm:inline">Dodaj</span> Pieśń</button>
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-800 p-4 mb-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Search className="text-gray-400 dark:text-gray-500" size={20} />
              <input className="w-full outline-none text-sm bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Szukaj pieśni..." value={songFilter} onChange={e => setSongFilter(e.target.value)} />
            </div>
            <div className="flex gap-2 items-center">
              <input className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400" placeholder="Filtruj po tagach..." value={tagFilter} onChange={e => setTagFilter(e.target.value)} />
              {tagFilter && <button onClick={() => setTagFilter('')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">Wyczyść</button>}
            </div>
          </div>
          {/* Lista wszystkich tagów z bazy - filtrowane po wpisanym tekście */}
          {allUniqueTags.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Tagi:</span>
              {allUniqueTags
                .filter(tag => !tagFilter || tag.toLowerCase().includes(tagFilter.toLowerCase()))
                .map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs border transition font-medium ${
                      tagFilter === tag
                        ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white border-pink-500'
                        : 'bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/40 dark:to-orange-900/40 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800 hover:from-pink-100 hover:to-orange-100 dark:hover:from-pink-900/60 dark:hover:to-orange-900/60'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-left text-sm align-middle">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="p-4">Tytuł</th>
                <th className="p-4">Autor</th>
                <th className="p-4">Tonacja</th>
                <th className="p-4">Tempo</th>
                <th className="p-4">Tagi</th>
                <th className="p-4 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSongs.map(s => (
                <tr key={s.id} className="hover:bg-pink-50/30 dark:hover:bg-gray-800/50 transition">
                  <td className="p-4 font-bold text-gray-800 dark:text-gray-200">{s.title}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{s.author || "-"}</td>
                  <td className="p-4 font-mono font-bold text-pink-600 dark:text-pink-400">{s.key}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{s.tempo || "-"}</td>
                  <td className="p-4">
                    <div className="flex gap-1 flex-wrap">
                      {Array.isArray(s.tags) && s.tags.length > 0 ? s.tags.map((t, i) => (
                        <span key={i} className="bg-gradient-to-r from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 px-2 py-1 text-xs rounded-full text-pink-800 dark:text-pink-300 border border-pink-200 dark:border-pink-800 font-medium flex items-center gap-1 group">
                          {t}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeTagFromSong(s.id, t); }}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                            title="Usuń tag"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )) : <span className="text-gray-400 text-xs">-</span>}
                    </div>
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button onClick={() => setShowSongDetails(s)} className="text-gray-800 dark:text-gray-300 font-semibold px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition">Szczegóły</button>
                    <button onClick={() => { setSongForm(s); setShowSongModal(true); }} className="text-pink-600 dark:text-pink-400 hover:text-orange-600 dark:hover:text-orange-400 font-medium transition">Edytuj</button>
                    <button onClick={() => deleteSong(s.id)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition">Usuń</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* SEKCJA 3: CZŁONKOWIE ZESPOŁU */}
      {activeTab === 'members' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[30] transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-gray-100">Członkowie Zespołu</h2>
          <button onClick={() => { setMemberForm({ id: null, full_name: '', role: '', status: 'Aktywny', phone: '', email: '' }); setSelectedMemberRoles([]); setShowMemberModal(true); }} className="w-full sm:w-auto bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-pink-500/50 transition flex items-center justify-center gap-2"><Plus size={18}/> Dodaj członka</button>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="p-4">Imię i nazwisko</th>
                <th className="p-4">Służby</th>
                <th className="p-4">Status</th>
                <th className="p-4">Telefon</th>
                <th className="p-4">Email</th>
                <th className="p-4 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {team.map(m => {
                const roleNames = getMemberRoleNames(m.id);
                return (
                  <tr key={m.id} className="hover:bg-pink-50/30 dark:hover:bg-gray-800/50 transition">
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-200">{m.full_name}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {roleNames.length > 0 ? (
                          roleNames.map((name, idx) => (
                            <span key={idx} className="bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-lg text-xs font-medium border border-pink-100 dark:border-pink-800">
                              {name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs italic">Brak przypisanych</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4"><span className="bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full text-xs font-medium border border-green-200 dark:border-green-800">{m.status}</span></td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{m.phone}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{m.email}</td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button onClick={() => { setMemberForm(m); loadMemberRoles(m.id); setShowMemberModal(true); }} className="text-pink-600 dark:text-pink-400 hover:text-orange-600 dark:hover:text-orange-400 font-medium transition">Edytuj</button>
                      <button onClick={() => deleteMember(m.id)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition">Usuń</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </section>
      )}

      {/* FINANCES TAB */}
      {activeTab === 'finances' && (
        <FinanceTab
          ministry="Grupa Uwielbienia"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* WALL TAB */}
      {activeTab === 'wall' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 transition-colors">
          <WallTab
            ministry="Grupa Uwielbienia"
            currentUserEmail={currentUser.email}
            currentUserName={currentUser.name}
          />
        </section>
      )}

      {/* ROLES TAB */}
      {activeTab === 'roles' && (
        <RolesTab
          teamType="worship"
          teamMembers={team}
          memberTable="worship_team"
          onUpdate={fetchWorshipRoles}
        />
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <MaterialsTab moduleKey="worship" canEdit={true} />
        </section>
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="worship"
          currentUserEmail={currentUser.email}
          canEdit={hasTabAccess('worship', 'equipment', userRole)}
        />
      )}

      {/* Modale */}
      {showMemberModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{memberForm.id ? 'Edytuj członka' : 'Nowy członek'}</h3>
              <button onClick={() => setShowMemberModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Imię i nazwisko</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Jan Kowalski" value={memberForm.full_name} onChange={e => setMemberForm({...memberForm, full_name: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Służby / Instrumenty</label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                  <div className="flex flex-wrap gap-2">
                    {worshipRoles.map(role => {
                      const isSelected = selectedMemberRoles.includes(role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMemberRoles(prev => prev.filter(id => id !== role.id));
                            } else {
                              setSelectedMemberRoles(prev => [...prev, role.id]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                  {worshipRoles.length === 0 && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-2">Brak zdefiniowanych służb. Dodaj je w zakładce "Służby".</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Telefon</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Email</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowMemberModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
                <button onClick={saveMember} className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/50 transition font-medium">Zapisz</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSongModal && document.body && createPortal(
        <SongForm
          key={songModalKey}
          initialData={songForm}
          allTags={allUniqueTags}
          onSave={async (data) => {
            try {
              const cleanData = {
                title: (data.title || '').trim(),
                author: (data.author || '').trim(),
                category: (data.category || '').trim(),
                key: (data.key || 'C').trim(),
                tempo: data.tempo ? parseInt(data.tempo) : null,
                meter: (data.meter || '').trim(),
                tags: Array.isArray(data.tags) ? data.tags : [],
                chords_bars: (data.chords_bars || '').trim(),
                lyrics: (data.lyrics || '').trim(),
                sheet_music_url: (data.sheet_music_url || '').trim(),
                attachments: Array.isArray(data.attachments) ? data.attachments : []
              };

              let error;
              if (data.id) {
                const result = await supabase.from('songs').update(cleanData).eq('id', data.id);
                error = result.error;
              } else {
                const result = await supabase.from('songs').insert([cleanData]);
                error = result.error;
              }

              if (error) {
                console.error('Supabase error:', error);
                alert('Błąd zapisu: ' + (error.message || JSON.stringify(error)));
                return;
              }

              setShowSongModal(false);
              fetchData();
            } catch (err) {
              console.error('Exception:', err);
              alert('Błąd: ' + (err.message || 'Nie udało się zapisać pieśni'));
            }
          }}
          onCancel={() => setShowSongModal(false)}
        />,
        document.body
      )}

      {showSongDetails && document.body && createPortal(
        <SongDetailsModal
          song={showSongDetails}
          onClose={() => setShowSongDetails(null)}
          onEdit={() => {
            // Skopiuj dane pieśni i zamknij modal szczegółów
            const songData = { ...showSongDetails };
            setShowSongDetails(null);
            // Ustaw dane i otwórz formularz edycji (z nowym key żeby wymusić remount)
            setSongForm(songData);
            setSongModalKey(k => k + 1);
            setShowSongModal(true);
          }}
        />,
        document.body
      )}

      {/* MODAL: Zarządzanie Tagami */}
      {showTagsModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2">
                <Tag size={20} className="text-pink-500" />
                Zarządzanie Tagami
              </h3>
              <button onClick={() => { setShowTagsModal(false); setEditingTag(null); setEditingTagValue(''); setNewTagInput(''); }} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Dodaj nowe tagi lub edytuj/usuń istniejące. Zmiany zostaną zastosowane globalnie.
            </p>

            {/* Pole dodawania nowego tagu */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNewTag(); }}
                placeholder="Wpisz nowy tag..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition"
              />
              <button
                onClick={addNewTag}
                disabled={!newTagInput.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-pink-500/30 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                Dodaj
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
              {allUniqueTags.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                  Brak tagów w bazie pieśni
                </div>
              ) : (
                allUniqueTags.map(tag => {
                  const songCount = songs.filter(s => Array.isArray(s.tags) && s.tags.includes(tag)).length;
                  const isEditing = editingTag === tag;

                  return (
                    <div key={tag} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingTagValue}
                            onChange={(e) => setEditingTagValue(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-pink-300 dark:border-pink-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-pink-500/20 outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameTagGlobally(tag, editingTagValue);
                              if (e.key === 'Escape') { setEditingTag(null); setEditingTagValue(''); }
                            }}
                          />
                          <button
                            onClick={() => renameTagGlobally(tag, editingTagValue)}
                            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                            title="Zapisz"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => { setEditingTag(null); setEditingTagValue(''); }}
                            className="p-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition"
                            title="Anuluj"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{tag}</span>
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                              ({songCount} {songCount === 1 ? 'pieśń' : songCount < 5 ? 'pieśni' : 'pieśni'})
                            </span>
                          </div>
                          <button
                            onClick={() => { setEditingTag(tag); setEditingTagValue(tag); }}
                            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
                            title="Edytuj nazwę"
                          >
                            <Hash size={16} />
                          </button>
                          <button
                            onClick={() => deleteTagGlobally(tag)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                            title="Usuń tag"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => { setShowTagsModal(false); setEditingTag(null); setEditingTagValue(''); setNewTagInput(''); }}
                className="w-full py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-pink-500/30 transition"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Add Expense */}
      {showExpenseModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl p-6 border border-white/20 dark:border-gray-700 my-8">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Nowy wydatek - {expenseForm.ministry}</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              {/* Wiersz 1: Data i Kwota */}
              <div className="grid grid-cols-2 gap-4">
                <CustomDatePicker
                  label="Data dokumentu"
                  value={expenseForm.payment_date}
                  onChange={(val) => setExpenseForm({...expenseForm, payment_date: val})}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kwota (PLN)</label>
                  <input
                    type="number"
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Wiersz 2: Kontrahent i Osoba odpowiedzialna */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kontrahent</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.contractor}
                    onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
                    placeholder="Nazwa firmy/osoby"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Osoba odpowiedzialna</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.responsible_person}
                    onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                    placeholder="Imię i nazwisko"
                  />
                </div>
              </div>

              {/* Wiersz 3: Pozycja budżetowa (pełna szerokość) */}
              <div>
                <CustomSelect
                  label="Pozycja budżetowa (opis kosztu)"
                  value={expenseForm.description}
                  onChange={(value) => setExpenseForm({...expenseForm, description: value})}
                  options={[
                    { value: '', label: 'Wybierz pozycję' },
                    ...budgetItems.map(item => ({
                      value: item.description,
                      label: item.description
                    }))
                  ]}
                  placeholder="Wybierz pozycję"
                />
              </div>

              {/* Wiersz 4: Szczegółowy opis (pełna szerokość) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Szczegółowy opis</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder="Dodatkowe informacje o wydatku..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Załączniki (opcjonalnie)</label>
                <div className="space-y-2">
                  <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-pink-300 dark:hover:border-pink-600 transition flex items-center gap-2">
                    <Upload size={18} className="text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {uploadingFile ? 'Przesyłanie...' : 'Dodaj plik(i)'}
                    </span>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      disabled={uploadingFile}
                      multiple
                    />
                  </label>
                  {expenseForm.documents && expenseForm.documents.length > 0 && (
                    <div className="space-y-2">
                      {expenseForm.documents.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                          <span className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1 truncate">
                            <FileText size={14} />
                            {doc.name}
                          </span>
                          <button
                            onClick={() => removeDocument(idx)}
                            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 ml-2 flex-shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tagi</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Dodaj tag"
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <button
                    onClick={addTag}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {expenseForm.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded-lg text-xs flex items-center gap-1"
                    >
                      <Tag size={12} />
                      {tag}
                      <button onClick={() => removeTag(tag)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveExpense}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition font-medium"
                >
                  Zapisz
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
