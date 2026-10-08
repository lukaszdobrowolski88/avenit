import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Spinner from '../../components/Spinner';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Search, Trash2, X, FileText, Music, Calendar, ChevronDown, Check, ChevronUp, User, UserX, Link as LinkIcon, Clock, History, ExternalLink, Minus, Hash, DollarSign, ChevronLeft, ChevronRight, Tag, Upload, FileDown, MessageSquare, Download, Play, Pause, Volume2, Users, FolderOpen, Package, Send, CalendarPlus, Pencil } from 'lucide-react';
import SongForm from './SongForm';
import { AddSongToProgramModal, ProgramsSongsManagerModal } from './ProgramSuggestionsModals';
import { CampusBadge, useCampusBadge } from '../../components/CampusBadge';
import FinanceTab from '../shared/FinanceTab';
import WallTab from '../shared/WallTab';
import EventsTab from '../shared/EventsTab';
import EventScheduleTab from '../shared/ScheduleTab';
import MaterialsTab from '../shared/MaterialsTab';
import EquipmentTab from '../shared/EquipmentTab';
import RolesTab from '../../components/RolesTab';
import CustomSelect from '../../components/CustomSelect';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import PageHeader from '../../components/PageHeader';
import { useUserRole } from '../../hooks/useUserRole';
import { useTabAccess } from '../../components/Can';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useT } from '../../i18n';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PitchShifter } from 'soundtouchjs';
import { tr, appLocale } from '../../i18n';
import { toast } from '../../lib/toast';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../components/ui/DataTable';
import { confirmDialog } from '../../lib/dialog';
import { buildSongTagList, readLegacyTags, clearLegacyTags, saveSongTags, SONG_TAGS_KEY } from './songTags';
import CustomDatePicker from '../../components/CustomDatePicker';  // wspólne pole daty (wcześniej lokalna kopia bez ramki pola)




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

// Zaawansowany odtwarzacz MP3 z pitch shift (bez zmiany tempa) i kontrolą ścieżek.
// Przywrócony: sprzątanie w PR5 (a2f0726) usunęło definicję, a szczegóły pieśni dalej go używają —
// otwarcie pieśni z załącznikiem MP3 kończyło się błędem „AudioPlayer is not defined”.
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
    if (pitchShift === 0) return tr('Oryginał');
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
    { key: 'other', label: tr('Inne'), icon: GuitarIcon, color: 'blue' }
  ];

  return (
    <div className="mt-3 p-3 bg-gradient-to-r from-accent-primary-lightest to-purple-50 dark:from-gray-700 dark:to-gray-700 rounded-xl border border-accent-primary-lighter dark:border-gray-600">
      {/* Główne kontrolki */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-accent-primary dark:bg-accent-primary-light text-white shadow-lg shadow-accent-primary-light/30 hover:bg-accent-primary dark:hover:bg-accent-primary transition disabled:opacity-50"
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
              className="h-full bg-gradient-to-r from-accent-primary-light to-purple-500 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Kontrolki zmiany tonacji */}
      <div className="mt-3 pt-3 border-t border-accent-primary-lighter dark:border-gray-600">
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
                  : 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/50 text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-dark/50'
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
      <div className="mt-3 pt-3 border-t border-accent-primary-lighter dark:border-gray-600">
        <button
          onClick={() => setShowStemControls(!showStemControls)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500 transition"
        >
          <span className="flex items-center gap-2">
            <Users size={14} />
            {tr('Kontrola instrumentów')}
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
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
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
  }, [activeTab, selectedCampusId]);

  async function fetchHistory() {
    setLoadingHistory(true);
    try {
        const { data: programs } = await withCampusFilter(supabase.from('programs').select('*')).order('date', { ascending: false });
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
            <div style="font-family: Arial, sans-serif; font-size: 11px; line-height: 1.6; color: #000; white-space: pre-wrap;">${transposedChords || tr('Brak akordów')}</div>
          </div>
        </div>

        <div style="margin-top: 20px; text-align: center; color: #999; font-size: 9px;">
          Wygenerowano ${new Date().toLocaleDateString(appLocale())} o ${new Date().toLocaleTimeString(appLocale())} | Avenit
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
        toast.error(tr('Nie udało się wygenerować PDF'));
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
    : (song.chords || tr('Brak układu...'));

  // Zastosuj formatowanie rozmiaru czcionek dla akordów (14px bazowy)
  const displayChords = formatChordsWithFontSizes(transposedChords, 14);

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      size="full"
      title={song.title}
      subtitle={(song.author || song.category) ? (
        <span className="flex items-center gap-2">
            {song.author && <span>{song.author}</span>}
            {song.category && (
                <>
                    <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                    <span>{song.category}</span>
                </>
            )}
        </span>
      ) : undefined}
      footer={<>
        <Button variant="secondary" icon={FileDown} onClick={handleDownloadPDF}>
            PDF
        </Button>
        <Button onClick={onEdit}>
            {tr('Edytuj')}
        </Button>
      </>}
    >
        {/* TABS */}
        <div className="px-6 pt-6 pb-0">
             <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
                <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'overview' ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                    <FileText size={16}/> {tr('Przegląd')}
                </button>
                <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'history' ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                    <History size={16}/> {tr('Historia użycia')}
                </button>
                <button onClick={() => setActiveTab('materials')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'materials' ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                    <LinkIcon size={16}/> {tr('Materiały')}
                </button>
            </div>
        </div>

        {/* CONTENT */}
        <div className="p-6">
            
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    
                    {/* PŁASKI PASEK: TONACJA | TEMPO | METRUM */}
                    <div className="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                        
                        {/* TONACJA ORYGINALNA */}
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                <Music size={14}/> {tr('Tonacja')}
                            </div>
                            <span className="tabular-nums text-lg font-bold text-accent-primary dark:text-accent-primary-light min-w-[24px] text-center">{song.key || "-"}</span>
                        </div>

                        {/* TRANSPOZYCJA - wybór tonacji docelowej (wg wytycznych PDF) */}
                        <div className="flex items-center gap-3 bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-xl shadow-sm border border-purple-200 dark:border-purple-700">
                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase">
                                {tr('Transponuj do')}
                            </div>
                            <select
                                value={targetKey}
                                onChange={(e) => setTargetKey(e.target.value)}
                                className="h-8 px-3 text-sm font-bold bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-600 rounded-lg text-purple-700 dark:text-purple-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
                                    {tr('Reset')}
                                </button>
                            )}
                        </div>

                        {/* TEMPO */}
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                <Clock size={14}/> {tr('Tempo')}
                            </div>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{song.tempo ? `${song.tempo} BPM` : '-'}</span>
                        </div>

                        {/* METRUM */}
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                <Hash size={14}/> {tr('Metrum')}
                            </div>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{song.meter || '-'}</span>
                        </div>

                         {/* TAGI */}
                         <div className="flex items-center gap-2 ml-auto">
                            {(song.tags || []).map(t => (
                                <span key={t} className="px-3 py-1 rounded-lg bg-accent-secondary-lightest dark:bg-accent-secondary-darkest/20 text-accent-secondary dark:text-accent-secondary-light text-xs font-bold border border-accent-secondary-lighter dark:border-accent-secondary-dark">
                                    #{t}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* TEKST / CHWYTY */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">{tr('Tekst')}</h3>
                            <pre className="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                                {song.lyrics || tr('Brak tekstu...')}
                            </pre>
                        </div>
                        <div className="bg-accent-primary-lightest/50 dark:bg-gray-800 rounded-xl p-5 border border-accent-primary-lighter dark:border-gray-700">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{tr('Akordy w taktach')}</h3>
                                {isTransposed && <span className="text-[10px] font-bold text-accent-primary dark:text-accent-primary-light bg-accent-primary-lighter dark:bg-accent-primary-darkest px-2 py-0.5 rounded">{tr('TRANSPONOWANO')} ({originalKey} → {targetKey})</span>}
                            </div>
                            {/* Ukryj różowe tło komórek w widoku szczegółów */}
                            <style>{`
                                .chords-display-view .chord-spacer {
                                    background: transparent !important;
                                }
                            `}</style>
                            <div
                                className="chords-display-view whitespace-pre-wrap font-mono text-accent-primary-dark dark:text-accent-primary-light text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: displayChords || tr('Brak układu...') }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-4">
                    {loadingHistory ? (
                        <Spinner center label={tr('Ładowanie historii...')} />
                    ) : history.length === 0 ? (
                        <EmptyState compact icon={History} title={tr('Brak historii użycia tej pieśni w programach.')} />
                    ) : (
                        <div className="space-y-2">
                            {history.map(h => (
                                <div key={h.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-sm transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-accent-primary-lighter dark:bg-accent-primary-darkest flex items-center justify-center text-accent-primary dark:text-accent-primary-light font-bold text-xs">
                                            {new Date(h.date).getDate()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-800 dark:text-gray-200">{new Date(h.date).toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' })}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{tr('Lider:')} {h.zespol?.lider || tr('Nieznany')}</div>
                                        </div>
                                    </div>
                                    <div className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold">
                                        {tr('Program')}
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
                            {tr('Aby dodać lub edytować załączniki, użyj przycisku')} <strong>"{tr('Edytuj')}"</strong> {tr('i przejdź do zakładki "Załączniki".')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mt-2">
                            {tr('Załączniki i Linki')} ({(song.attachments || []).length})
                        </h3>

                        {(!song.attachments || song.attachments.length === 0) && (
                             <EmptyState compact icon={FileText} title={tr('Brak materiałów')} subtitle={tr('Kliknij "Edytuj" aby dodać załączniki')} />
                        )}

                        {(song.attachments || []).map((att, idx) => {
                            const isMP3 = att.type === 'file' && (att.name?.toLowerCase().endsWith('.mp3') || att.url?.toLowerCase().endsWith('.mp3'));

                            return (
                                <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-accent-primary-light dark:hover:border-accent-primary-light transition group">
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${att.type === 'link' ? 'bg-accent-secondary-lighter dark:bg-accent-secondary-darkest/30 text-accent-secondary' : isMP3 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary'}`}>
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
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${att.type === 'link' ? 'bg-accent-secondary-lighter dark:bg-accent-secondary-darkest/30 text-accent-secondary' : isMP3 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary'}`}>
                                                        {att.type === 'link' ? tr('Link') : isMP3 ? 'MP3' : tr('Plik')}
                                                    </span>
                                                    {att.date && new Date(att.date).toLocaleDateString(appLocale())}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0 ml-3">
                                            {att.type === 'file' && (
                                                <button
                                                    onClick={() => handleDownloadFile(att.url, att.name)}
                                                    disabled={downloadingFile === att.url}
                                                    className="p-2.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition disabled:opacity-50"
                                                    title={tr('Pobierz plik')}
                                                >
                                                    {downloadingFile === att.url ? (
                                                        <Spinner size={18} />
                                                    ) : (
                                                        <Download size={18}/>
                                                    )}
                                                </button>
                                            )}
                                            <a
                                                href={att.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2.5 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest hover:text-accent-primary transition"
                                                title={att.type === 'link' ? tr('Otwórz link') : tr('Podgląd')}
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
                                    <div><div className="font-bold text-sm text-gray-800 dark:text-gray-200">{tr('Nuty / PDF (Legacy)')}</div></div>
                                </div>
                                <a href={song.sheet_music_url} target="_blank" rel="noreferrer" className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg hover:text-accent-primary"><ExternalLink size={18}/></a>
                             </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    </Modal>
  );
}

// --- GŁÓWNY MODUŁ ---

export default function WorshipModule() {
  const t = useT();
  const { userRole } = useUserRole();
  const hasTabAccess = useTabAccess();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [activeTab, setActiveTab] = useState('wall');
  const [team, setTeam] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState({ email: '', name: '' });
  const [addToProgramSong, setAddToProgramSong] = useState(null);
  const [showProgramsManager, setShowProgramsManager] = useState(false);

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
  const [showAllTags, setShowAllTags] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

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
  }, [selectedCampusId]);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab, selectedCampusId]);

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
      const { data: budget, error: budgetError } = await withCampusFilter(supabase
        .from('budget_items')
        .select('*'))
        .eq('team_type', ministryName)
        .eq('year', currentYear)
        .order('id', { ascending: true });

      if (budgetError) throw budgetError;
      setBudgetItems(budget || []);

      const { data: exp, error: expError } = await supabase
        .from('expense_transactions')
        .select('*')
        .eq('team_type', ministryName)
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
      toast.error(tr('Błąd przesyłania pliku: ') + error.message);
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
    const missingFields = [
      !expenseForm.payment_date && tr('Data'),
      !expenseForm.amount && tr('Kwota (PLN)'),
      !expenseForm.description && tr('Pozycja budżetowa'),
      !expenseForm.contractor && tr('Kontrahent'),
      !expenseForm.responsible_person && tr('Osoba odpowiedzialna'),
    ].filter(Boolean);
    if (missingFields.length) {
      toast.error(tr('Uzupełnij: {fields}', { fields: missingFields.join(', ') }));
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
        team_type: expenseForm.ministry
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
      toast.error(tr('Błąd zapisywania: ') + error.message);
    }
  };

  // quiet = odświeżenie po zapisie bez zamiany całego modułu w spinner (lista i przewinięcie zostają).
  async function fetchData({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      const { data: t } = await supabase.from('worship_team').select('*').order('full_name');
      const { data: s } = await supabase.from('songs').select('*').order('title');
      const { data: dictRow } = await supabase.from('app_settings').select('value').eq('key', SONG_TAGS_KEY).maybeSingle().then((r) => r, () => ({ data: null }));

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

      // Tagi = wspólny słownik w bazie (app_settings `song_tags`) + tagi użyte na pieśniach.
      // Stare tagi zapisane tylko w tej przeglądarce (localStorage) przenosimy do słownika.
      const dict = buildSongTagList({ dictValue: dictRow?.value });
      const legacy = readLegacyTags();
      setAllUniqueTags(buildSongTagList({ dictValue: dict, songs: s || [], legacy }));
      if (legacy.length && legacy.some((tg) => !dict.some((d) => d.toLowerCase() === tg.toLowerCase()))) {
        const { tags: merged, error } = await saveSongTags({ action: 'merge', tags: legacy });
        if (!error && merged) clearLegacyTags();
      } else if (legacy.length) {
        clearLegacyTags();
      }
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wczytać danych zespołu. Odśwież stronę.') });
    }
    if (!quiet) setLoading(false);
  }

  // Głęboki link (np. z wyszukiwarki ⌘K): /worship?song=<id> otwiera kartę pieśni.
  const deepSongId = searchParams.get('song');
  useEffect(() => {
    if (!deepSongId || loading) return;
    const song = songs.find((x) => String(x.id) === String(deepSongId));
    if (song) { setActiveTab('songs'); setShowSongDetails(song); }
    else toast.info(tr('Nie znaleziono tej pieśni. Mogła zostać usunięta.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepSongId, loading]);

  const closeSongDetails = () => {
    setShowSongDetails(null);
    if (searchParams.get('song')) {
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('song'); return p; }, { replace: true });
    }
  };

  const saveMember = async () => {
    try {
      let memberId = memberForm.id;

      if (memberForm.id) {
        const { id, ...updateData } = memberForm;
        const { error } = await supabase.from('worship_team').update(updateData).eq('id', memberForm.id);
        if (error) throw error;
      } else {
        const { id, ...rest } = memberForm;
        const { data: newMember, error } = await supabase.from('worship_team').insert([rest]).select().single();
        if (error) throw error;
        memberId = newMember.id;
      }

      // Zapisz przypisania do służb
      if (memberId) {
        // Tylko zmiany: dopisz nowe służby, usuń odznaczone (bez kasowania wszystkiego naraz —
        // błąd w połowie nie zostawi osoby bez służb).
        const current = memberRoles.filter((mr) => String(mr.member_id) === String(memberId)).map((mr) => mr.role_id);
        const toAdd = selectedMemberRoles.filter((rid) => !current.includes(rid));
        const toRemove = current.filter((rid) => !selectedMemberRoles.includes(rid));
        if (toAdd.length > 0) {
          const assignments = toAdd.map(roleId => ({
            member_id: String(memberId),
            member_table: 'worship_team',
            role_id: roleId
          }));
          const { error } = await supabase.from('team_member_roles').insert(assignments);
          if (error) throw error;
        }
        if (toRemove.length > 0) {
          const { error } = await supabase
            .from('team_member_roles')
            .delete()
            .eq('member_id', String(memberId))
            .eq('member_table', 'worship_team')
            .in('role_id', toRemove);
          if (error) throw error;
        }
      }

      toast.success(memberForm.id ? tr('Zapisano: {name}', { name: memberForm.full_name }) : tr('Dodano: {name}', { name: memberForm.full_name }));
      setShowMemberModal(false);
      setSelectedMemberRoles([]);
      fetchData({ quiet: true });
      fetchWorshipRoles(); // Odśwież przypisania
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać członka zespołu.') });
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

  const deleteMember = async (m) => {
    if (!await confirmDialog({ title: tr('Usunąć „{name}” z zespołu?', { name: m.full_name }), message: tr('Osoba zniknie z listy członków zespołu i z jego służb. Zostanie w bazie członków kościoła.'), confirmLabel: tr('Usuń z zespołu'), danger: true })) return;
    const { error } = await supabase.from('worship_team').delete().eq('id', m.id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć osoby z zespołu.') }); return; }
    toast.success(tr('Usunięto: {name}', { name: m.full_name }));
    fetchData({ quiet: true });
  };

  const deleteSong = async (song) => {
    if (!await confirmDialog({ title: tr('Usunąć pieśń „{title}”?', { title: song.title }), message: tr('Zniknie z Bazy pieśni. Programy, w których była, zachowają jej tytuł. Tej operacji nie można cofnąć.'), confirmLabel: tr('Usuń pieśń'), danger: true })) return;
    const { error } = await supabase.from('songs').delete().eq('id', song.id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć pieśni.') }); return; }
    toast.success(tr('Usunięto pieśń „{title}”', { title: song.title }));
    fetchData({ quiet: true });
  };

  // Zmiana nazwy tagu we wszystkich pieśniach
  const renameTagGlobally = async (oldTag, newTag) => {
    if (!newTag.trim() || oldTag === newTag) return;

    const songsWithTag = songs.filter(s => Array.isArray(s.tags) && s.tags.includes(oldTag));

    try {
      for (const song of songsWithTag) {
        const updatedTags = [...new Set(song.tags.map(t => t === oldTag ? newTag.trim() : t))];
        const { error } = await supabase.from('songs').update({ tags: updatedTags }).eq('id', song.id);
        if (error) throw error;
      }
      // Słownik w bazie (dla tagów jeszcze nieużytych na pieśniach).
      await saveSongTags({ action: 'rename', tag: oldTag, to: newTag.trim() });

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
      toast.success(tr('Zmieniono nazwę tagu na „{tag}”', { tag: newTag.trim() }));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zmienić nazwy tagu we wszystkich pieśniach.') });
      fetchData({ quiet: true });
    }
  };

  // Usunięcie tagu ze wszystkich pieśni
  const deleteTagGlobally = async (tagToDelete) => {
    const songsWithTag = songs.filter(s => Array.isArray(s.tags) && s.tags.includes(tagToDelete));
    if (!await confirmDialog({
      title: tr('Usunąć tag „{tag}”?', { tag: tagToDelete }),
      message: songsWithTag.length ? tr('Tag zniknie ze wszystkich pieśni, które go mają ({n}).', { n: songsWithTag.length }) : tr('Tag nie jest użyty w żadnej pieśni.'),
      confirmLabel: tr('Usuń tag'),
      danger: true,
    })) return;

    try {
      for (const song of songsWithTag) {
        const updatedTags = song.tags.filter(t => t !== tagToDelete);
        const { error } = await supabase.from('songs').update({ tags: updatedTags }).eq('id', song.id);
        if (error) throw error;
      }
      const { error: dictErr } = await saveSongTags({ action: 'remove', tag: tagToDelete });
      if (dictErr) throw dictErr;

      // Aktualizuj stan lokalnie
      setSongs(prev => prev.map(s => {
        if (Array.isArray(s.tags) && s.tags.includes(tagToDelete)) {
          return { ...s, tags: s.tags.filter(t => t !== tagToDelete) };
        }
        return s;
      }));

      // Usuń z listy unikalnych tagów
      setAllUniqueTags(prev => prev.filter(t => t !== tagToDelete));

      // Wyczyść filtr jeśli był ustawiony na usunięty tag
      if (tagFilter === tagToDelete) {
        setTagFilter('');
      }
      toast.success(tr('Usunięto tag „{tag}”', { tag: tagToDelete }));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się usunąć tagu.') });
      fetchData({ quiet: true });
    }
  };

  // Dodanie nowego tagu do wspólnego słownika w bazie — widzą go wszyscy liderzy, na każdym urządzeniu.
  const addNewTag = async () => {
    const trimmedTag = newTagInput.trim();
    if (!trimmedTag) return;

    // Sprawdź czy tag już istnieje (case-insensitive)
    if (allUniqueTags.some(t => t.toLowerCase() === trimmedTag.toLowerCase())) {
      toast.error(tr('Tag „{tag}” już istnieje.', { tag: trimmedTag }));
      return;
    }

    const { error } = await saveSongTags({ action: 'add', tag: trimmedTag });
    if (error) { toast.error(error, { fallback: tr('Nie udało się zapisać tagu. Spróbuj ponownie.') }); return; }
    setAllUniqueTags(prev => [...new Set([...prev, trimmedTag])].sort((a, b) => a.localeCompare(b, 'pl')));
    toast.success(tr('Dodano tag „{tag}”', { tag: trimmedTag }));
    setNewTagInput('');
  };

  const filteredSongs = songs.filter(s =>
    (s.title || '').toLowerCase().includes(songFilter.toLowerCase()) &&
    (tagFilter
      ? (Array.isArray(s.tags)
        ? s.tags.some(t => String(t).toLowerCase().includes(tagFilter.toLowerCase()))
        : false)
      : true)
  );

  if (loading) return <Spinner center />;

  // Definicja zakładek
  const tabs = [
    { id: 'wall', label: t('Tablica'), icon: MessageSquare },
    { id: 'events', label: t('Wydarzenia'), icon: Calendar },
    { id: 'schedule', label: t('Grafik'), icon: Calendar, tour: 'grafik-tab' },
    { id: 'songs', label: tr('Baza pieśni'), icon: Music },
    ...(hasTabAccess('worship', 'members') ? [{ id: 'members', label: t('Członkowie'), icon: User }] : []),
    ...(hasTabAccess('worship', 'finances') ? [{ id: 'finances', label: t('Finanse'), icon: DollarSign }] : []),
    ...(hasTabAccess('worship', 'members') ? [{ id: 'roles', label: t('Służby'), icon: Users }] : []),
    ...(hasTabAccess('worship', 'equipment') ? [{ id: 'equipment', label: t('Wyposażenie'), icon: Package }] : []),
    { id: 'files', label: t('Pliki'), icon: FolderOpen },
  ];

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader moduleKey="worship" icon={Music} title={tr('Grupa Uwielbienia')} />

      {/* TAB NAVIGATION */}
      <ResponsiveTabs moduleKey="worship"
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

      {/* SEKCJA 1: GRAFIK ZESPOŁU — nad wydarzeniami (twardy switch z programów) */}
      {activeTab === 'schedule' && (
      <section data-tour="grafik-section" className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[50] transition-colors">
        <EventScheduleTab moduleKey="worship" />
      </section>
      )}

      {/* SEKCJA 2: BAZA PIEŚNI */}
      {activeTab === 'songs' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[40] transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-gray-100">{tr('Baza pieśni')}</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={() => setShowProgramsManager(true)} className="flex-1 sm:flex-none bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm px-3 lg:px-4 py-2.5 rounded-xl font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light dark:hover:border-accent-primary hover:text-accent-primary dark:hover:text-accent-primary-light transition flex items-center justify-center gap-2"><Calendar size={16}/> {tr('Programy')}</button>
            <button onClick={() => setShowTagsModal(true)} className="flex-1 sm:flex-none bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/40 dark:to-accent-secondary-darkest/40 text-accent-primary dark:text-accent-primary-light text-sm px-3 lg:px-4 py-2.5 rounded-xl font-medium border border-accent-primary-lighter dark:border-accent-primary-dark hover:from-accent-primary-lighter hover:to-accent-secondary-lighter dark:hover:from-accent-primary-darkest/60 dark:hover:to-accent-secondary-darkest/60 transition flex items-center justify-center gap-2"><Tag size={16} aria-hidden="true" /> <span className="hidden sm:inline">{tr('Zarządzaj tagami')}</span><span className="sm:hidden">{tr('Tagi')}</span></button>
            <button onClick={() => { setSongForm({}); setSongModalKey(k => k + 1); setShowSongModal(true); }} className="flex-1 sm:flex-none bg-gradient-to-r from-accent-secondary to-accent-primary text-white text-sm px-4 lg:px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-accent-secondary-light/50 transition flex items-center justify-center gap-2"><Plus size={18} aria-hidden="true" /> {tr('Dodaj pieśń')}</button>
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-800 p-4 mb-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Search className="text-gray-400 dark:text-gray-500" size={20} />
              <input className="w-full outline-none text-sm bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Szukaj pieśni...')} value={songFilter} onChange={e => setSongFilter(e.target.value)} />
            </div>
            <div className="flex gap-2 items-center">
              <input className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400" placeholder={t('Filtruj po tagach...')} value={tagFilter} onChange={e => setTagFilter(e.target.value)} />
              {tagFilter && <button onClick={() => setTagFilter('')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">{t('Wyczyść')}</button>}
            </div>
          </div>
          {/* Lista wszystkich tagów z bazy - filtrowane po wpisanym tekście */}
          {allUniqueTags.length > 0 && (() => {
            const matching = allUniqueTags.filter(tag => !tagFilter || tag.toLowerCase().includes(tagFilter.toLowerCase()));
            const LIMIT = 12; // jeden wiersz zamiast ściany 50+ tagów
            const visible = showAllTags || tagFilter ? matching : matching.slice(0, LIMIT);
            const hidden = matching.length - visible.length;
            return (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{tr('Tagi:')}</span>
              {visible
                .map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs border transition font-medium ${
                      tagFilter === tag
                        ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white border-accent-primary-light'
                        : 'bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/40 dark:to-accent-secondary-darkest/40 text-accent-primary-dark dark:text-accent-primary-light border-accent-primary-lighter dark:border-accent-primary-dark hover:from-accent-primary-lighter hover:to-accent-secondary-lighter dark:hover:from-accent-primary-darkest/60 dark:hover:to-accent-secondary-darkest/60'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              {hidden > 0 && (
                <button type="button" onClick={() => setShowAllTags(true)} className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline">
                  {tr('+{n} więcej', { n: hidden })}
                </button>
              )}
              {showAllTags && !tagFilter && matching.length > LIMIT && (
                <button type="button" onClick={() => setShowAllTags(false)} className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline">
                  {tr('Zwiń')}
                </button>
              )}
            </div>
            );
          })()}
        </div>

        <DataTable>
          <THead>
            <tr>
              <TH>{tr('Tytuł')}</TH>
              <TH className="w-24">{tr('Tonacja')}</TH>
              <TH className="w-24">{tr('Tempo')}</TH>
              <TH>{tr('Tagi')}</TH>
              <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
            </tr>
          </THead>
          <tbody>
            {filteredSongs.map(s => {
              // Najwyżej 3 tagi w wierszu (reszta jako „+N” z podpowiedzią) — wiersze mają równą wysokość.
              const tags = Array.isArray(s.tags) ? s.tags : [];
              const shown = tags.slice(0, 3);
              const rest = tags.slice(3);
              return (
              <TR key={s.id} onClick={() => setShowSongDetails(s)}>
                <TD className="min-w-[200px]">
                  <div className="font-semibold text-gray-900 dark:text-white leading-snug">{s.title}</div>
                  {s.author && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.author}</div>}
                </TD>
                <TD className="tabular-nums font-bold text-accent-primary dark:text-accent-primary-light">{s.key || ''}</TD>
                <TD muted numeric>{s.tempo || ''}</TD>
                <TD>
                  {/* Tło pigułki półprzezroczyste: zostaje widoczne na podświetlonym wierszu (pełny beż zlewał się z hoverem). */}
                  <div className="flex gap-1 flex-wrap">
                    {shown.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded-full font-medium whitespace-nowrap bg-[rgba(42,35,18,0.06)] text-gray-700 dark:bg-white/[0.08] dark:text-gray-200">{tag}</span>
                    ))}
                    {rest.length > 0 && (
                      <span className="px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400" title={rest.join(', ')}>+{rest.length}</span>
                    )}
                  </div>
                </TD>
                <TD align="right">
                  <div className="flex justify-end items-center gap-1 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAddToProgramSong(s); }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200 hover:bg-[rgba(42,35,18,0.07)] dark:hover:bg-white/10 transition-colors"
                      title={t('Dodaj do programu jako sugerowaną pieśń')}>
                      <CalendarPlus size={14} aria-hidden="true" />{tr('Do programu')}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSongForm(s); setShowSongModal(true); }}
                      className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-[rgba(42,35,18,0.07)] dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                      title={tr('Edytuj')} aria-label={tr('Edytuj pieśń {title}', { title: s.title })}>
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); deleteSong(s); }}
                      className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                      title={tr('Usuń')} aria-label={tr('Usuń pieśń {title}', { title: s.title })}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </TD>
              </TR>
              );
            })}
          </tbody>
        </DataTable>
        {filteredSongs.length === 0 && (
          songFilter || tagFilter ? (
            <EmptyState icon={Search} title={tr('Brak pieśni pasujących do wyszukiwania')}
              action={<Button variant="secondary" onClick={() => { setSongFilter(''); setTagFilter(''); }}>{tr('Wyczyść filtry')}</Button>} />
          ) : (
            <EmptyState icon={Music} title={tr('Baza pieśni jest pusta')} subtitle={tr('Dodaj pierwszą pieśń przyciskiem „Dodaj pieśń”.')} />
          )
        )}
      </section>
      )}

      {/* SEKCJA 3: CZŁONKOWIE ZESPOŁU */}
      {activeTab === 'members' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl lg:rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 relative z-[30] transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-gray-100">{tr('Członkowie zespołu')}</h2>
          <button onClick={() => { setMemberForm({ id: null, full_name: '', role: '', status: 'Aktywny', phone: '', email: '' }); setSelectedMemberRoles([]); setShowMemberModal(true); }} className="w-full sm:w-auto bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-accent-primary-light/50 transition flex items-center justify-center gap-2"><Plus size={18}/> {tr('Dodaj członka')}</button>
        </div>
        <DataTable tableClassName="min-w-[800px]">
          <THead>
            <tr>
              <TH>{tr('Imię i nazwisko')}</TH>
              <TH>{tr('Służby')}</TH>
              <TH>{tr('Status')}</TH>
              <TH>{tr('Telefon')}</TH>
              <TH>{tr('Email')}</TH>
              <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
            </tr>
          </THead>
          <tbody>
            {team.map(m => {
              const roleNames = getMemberRoleNames(m.id);
              return (
                <TR key={m.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{m.full_name}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {roleNames.length > 0 ? (
                        roleNames.map((name, idx) => (
                          <StatusPill key={idx} color={STATUS_COLORS.accent}>{name}</StatusPill>
                        ))
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs italic">{tr('Brak przypisanych')}</span>
                      )}
                    </div>
                  </TD>
                  <TD>{m.status && <StatusPill color={STATUS_COLORS.success}>{tr(m.status)}</StatusPill>}</TD>
                  <TD muted numeric>{m.phone}</TD>
                  <TD muted>{m.email}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button onClick={() => { setMemberForm(m); loadMemberRoles(m.id); setShowMemberModal(true); }} className="text-accent-primary dark:text-accent-primary-light hover:text-accent-secondary dark:hover:text-accent-secondary-light font-medium transition">{tr('Edytuj')}</button>
                      <button onClick={() => deleteMember(m)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition">{tr('Usuń')}</button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </DataTable>
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
          canEdit={hasTabAccess('worship', 'equipment')}
        />
      )}

      {/* Modale */}
      <Modal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        closeOnBackdrop={false}
        size="md"
        title={memberForm.id ? tr('Edytuj członka') : tr('Nowy członek')}
        footer={<>
          <Button variant="secondary" onClick={() => setShowMemberModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveMember}>{tr('Zapisz')}</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Imię i nazwisko')}</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Jan Kowalski')} value={memberForm.full_name} onChange={e => setMemberForm({...memberForm, full_name: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Służby / Instrumenty')}</label>
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
                              ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md'
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
                    <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-2">{t('Brak zdefiniowanych służb. Dodaj je w zakładce "Służby".')}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Telefon')}</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Email')}</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} />
                </div>
              </div>
            </div>
      </Modal>

      {showSongModal && (
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
                // Bez wybranej tonacji zostaje pusta — nie udajemy „C”, którego nikt nie ustalił.
                key: (data.key || '').trim() || null,
                tempo: data.tempo ? parseFloat(data.tempo) : null,
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
                toast.error(error, { fallback: tr('Nie udało się zapisać pieśni.') });
                return;
              }

              toast.success(data.id ? tr('Zapisano pieśń „{title}”', { title: cleanData.title }) : tr('Dodano pieśń „{title}”', { title: cleanData.title }));
              setShowSongModal(false);
              fetchData({ quiet: true });
            } catch (err) {
              toast.error(err, { fallback: tr('Nie udało się zapisać pieśni.') });
            }
          }}
          onCancel={() => setShowSongModal(false)}
        />
      )}

      {showSongDetails && (
        <SongDetailsModal
          song={showSongDetails}
          onClose={closeSongDetails}
          onEdit={() => {
            // Skopiuj dane pieśni i zamknij modal szczegółów
            const songData = { ...showSongDetails };
            closeSongDetails();
            // Ustaw dane i otwórz formularz edycji (z nowym key żeby wymusić remount)
            setSongForm(songData);
            setSongModalKey(k => k + 1);
            setShowSongModal(true);
          }}
        />
      )}

      {/* MODAL: Zarządzanie Tagami */}
      <Modal
        isOpen={showTagsModal}
        onClose={() => { setShowTagsModal(false); setEditingTag(null); setEditingTagValue(''); setNewTagInput(''); }}
        closeOnBackdrop={false}
        size="md"
        icon={Tag}
        title={tr('Zarządzanie tagami')}
        footer={
          <Button variant="secondary" onClick={() => { setShowTagsModal(false); setEditingTag(null); setEditingTagValue(''); setNewTagInput(''); }}>
            {tr('Zamknij')}
          </Button>
        }
      >
          <div className="p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {tr('Tagi są wspólne dla wszystkich liderów. Zmiana nazwy albo usunięcie tagu dotyczy wszystkich pieśni.')}
            </p>

            {/* Pole dodawania nowego tagu */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNewTag(); }}
                placeholder={t('Wpisz nowy tag...')}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light outline-none transition"
              />
              <button
                onClick={addNewTag}
                disabled={!newTagInput.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium hover:shadow-lg hover:shadow-accent-primary-light/30 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                {tr('Dodaj')}
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
              {allUniqueTags.length === 0 ? (
                <EmptyState compact icon={Tag} title={tr('Brak tagów w bazie pieśni')} />
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
                            className="flex-1 px-3 py-2 rounded-lg border border-accent-primary-light dark:border-accent-primary bg-white dark:bg-gray-900 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameTagGlobally(tag, editingTagValue);
                              if (e.key === 'Escape') { e.preventDefault(); setEditingTag(null); setEditingTagValue(''); }
                            }}
                          />
                          <button
                            onClick={() => renameTagGlobally(tag, editingTagValue)}
                            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                            title={t('Zapisz')}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => { setEditingTag(null); setEditingTagValue(''); }}
                            className="p-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition"
                            title={t('Anuluj')}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{tag}</span>
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                              ({songCount === 1 ? tr('1 pieśń') : tr('{n} pieśni', { n: songCount })})
                            </span>
                          </div>
                          <button
                            onClick={() => { setEditingTag(tag); setEditingTagValue(tag); }}
                            className="p-2 text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 rounded-lg transition"
                            title={t('Edytuj nazwę')}
                          >
                            <Hash size={16} />
                          </button>
                          <button
                            onClick={() => deleteTagGlobally(tag)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                            title={t('Usuń tag')}
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
          </div>
      </Modal>

      {/* MODAL: Add Expense */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        closeOnBackdrop={false}
        size="xl"
        title={tr('Nowy wydatek - {ministry}', { ministry: expenseForm.ministry })}
        footer={<>
          <Button variant="secondary" onClick={() => setShowExpenseModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveExpense}>{tr('Zapisz')}</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              {/* Wiersz 1: Data i Kwota */}
              <div className="grid grid-cols-2 gap-4">
                <CustomDatePicker
                  label={tr('Data dokumentu')}
                  value={expenseForm.payment_date}
                  onChange={(val) => setExpenseForm({...expenseForm, payment_date: val})}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (PLN)')}</label>
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kontrahent')}</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.contractor}
                    onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
                    placeholder={t('Nazwa firmy/osoby')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Osoba odpowiedzialna')}</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.responsible_person}
                    onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                    placeholder={t('Imię i nazwisko')}
                  />
                </div>
              </div>

              {/* Wiersz 3: Pozycja budżetowa (pełna szerokość) */}
              <div>
                <CustomSelect
                  label={tr('Pozycja budżetowa (opis kosztu)')}
                  value={expenseForm.description}
                  onChange={(value) => setExpenseForm({...expenseForm, description: value})}
                  options={[
                    { value: '', label: t('Wybierz pozycję') },
                    ...budgetItems.map(item => ({
                      value: item.description,
                      label: item.description
                    }))
                  ]}
                  placeholder={tr('Wybierz pozycję')}
                />
              </div>

              {/* Wiersz 4: Szczegółowy opis (pełna szerokość) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Szczegółowy opis')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder={tr('Dodatkowe informacje o wydatku...')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Załączniki (opcjonalnie)')}</label>
                <div className="space-y-2">
                  <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-accent-primary-light dark:hover:border-accent-primary transition flex items-center gap-2">
                    <Upload size={18} className="text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {uploadingFile ? tr('Przesyłanie...') : tr('Dodaj plik(i)')}
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
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tagi')}</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder={tr('Dodaj tag')}
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
                      className="px-2 py-1 bg-accent-primary-lighter dark:bg-accent-primary-darkest text-accent-primary dark:text-accent-primary-light rounded-lg text-xs flex items-center gap-1"
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
            </div>
      </Modal>

      {addToProgramSong && (
        <AddSongToProgramModal
          song={addToProgramSong}
          onClose={() => setAddToProgramSong(null)}
        />
      )}

      {showProgramsManager && (
        <ProgramsSongsManagerModal
          songs={songs}
          onClose={() => setShowProgramsManager(false)}
        />
      )}
    </div>
  );
}
