import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Type, Image as ImageIcon, Square, Columns, Minus, Link2, Share2,
  Mail, GripVertical, Trash2, Copy, ChevronUp, ChevronDown, Settings,
  AlignLeft, AlignCenter, AlignRight, Plus, Eye, Code, Undo, Redo,
  Smartphone, Monitor, Palette, Save, Layout, MousePointer, Quote,
  List, ListOrdered, Video, Sparkles, Bold, Italic, Underline,
  Link, Heading1, Heading2, Heading3, Maximize2, Minimize2,
  RotateCcw, Download, Upload, Layers, ChevronRight, X, Check,
  Wand2, Brush, Move, ArrowUp, ArrowDown, FileText, Edit3,
  Droplet, ImagePlus, Layers2, RotateCw
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { EMAIL_VARIABLES } from '../utils/emailVariables';
import BlockTextEditor from './BlockTextEditor';

// Definicje bloków
const BLOCK_TYPES = {
  header: {
    id: 'header',
    name: 'Nagłówek',
    icon: Layout,
    category: 'structure',
    defaultContent: {
      type: 'header',
      logoUrl: '',
      title: '{{kosciol}}',
      backgroundColor: '#ffffff',
      padding: 20,
      alignment: 'center'
    }
  },
  text: {
    id: 'text',
    name: 'Tekst',
    icon: Type,
    category: 'content',
    defaultContent: {
      type: 'text',
      content: '<p>Wprowadź tekst tutaj...</p>',
      alignment: 'left',
      fontSize: 16,
      lineHeight: 1.6,
      textColor: '#333333',
      backgroundColor: 'transparent',
      padding: 15
    }
  },
  heading: {
    id: 'heading',
    name: 'Nagłówek tekstu',
    icon: Heading1,
    category: 'content',
    defaultContent: {
      type: 'heading',
      content: 'Nagłówek sekcji',
      level: 2,
      alignment: 'left',
      textColor: '#1f2937',
      backgroundColor: 'transparent',
      padding: 15
    }
  },
  image: {
    id: 'image',
    name: 'Obraz',
    icon: ImageIcon,
    category: 'content',
    defaultContent: {
      type: 'image',
      src: '',
      alt: '',
      width: '100%',
      alignment: 'center',
      linkUrl: '',
      padding: 10,
      borderRadius: 0
    }
  },
  button: {
    id: 'button',
    name: 'Przycisk',
    icon: Square,
    category: 'content',
    defaultContent: {
      type: 'button',
      text: 'Kliknij tutaj',
      linkUrl: '#',
      backgroundColor: '#ec4899',
      textColor: '#ffffff',
      borderRadius: 8,
      alignment: 'center',
      padding: 15,
      fullWidth: false,
      fontSize: 16
    }
  },
  divider: {
    id: 'divider',
    name: 'Separator',
    icon: Minus,
    category: 'structure',
    defaultContent: {
      type: 'divider',
      style: 'solid',
      color: '#e5e7eb',
      thickness: 1,
      width: '100%',
      padding: 20
    }
  },
  spacer: {
    id: 'spacer',
    name: 'Odstęp',
    icon: Maximize2,
    category: 'structure',
    defaultContent: {
      type: 'spacer',
      height: 30
    }
  },
  columns: {
    id: 'columns',
    name: 'Kolumny',
    icon: Columns,
    category: 'structure',
    defaultContent: {
      type: 'columns',
      columns: 2,
      gap: 20,
      leftContent: '<p>Lewa kolumna</p>',
      rightContent: '<p>Prawa kolumna</p>',
      padding: 10
    }
  },
  quote: {
    id: 'quote',
    name: 'Cytat',
    icon: Quote,
    category: 'content',
    defaultContent: {
      type: 'quote',
      content: 'Wpisz tutaj cytat lub wyróżniony tekst...',
      author: '',
      borderColor: '#ec4899',
      backgroundColor: '#fdf2f8',
      textColor: '#831843',
      padding: 20
    }
  },
  list: {
    id: 'list',
    name: 'Lista',
    icon: List,
    category: 'content',
    defaultContent: {
      type: 'list',
      items: ['Element 1', 'Element 2', 'Element 3'],
      listStyle: 'disc',
      textColor: '#333333',
      padding: 15
    }
  },
  video: {
    id: 'video',
    name: 'Wideo (miniatura)',
    icon: Video,
    category: 'content',
    defaultContent: {
      type: 'video',
      thumbnailUrl: '',
      videoUrl: '',
      playButtonColor: '#ec4899',
      alignment: 'center',
      padding: 10
    }
  },
  social: {
    id: 'social',
    name: 'Social Media',
    icon: Share2,
    category: 'content',
    defaultContent: {
      type: 'social',
      alignment: 'center',
      iconSize: 32,
      iconStyle: 'color',
      links: {
        facebook: '',
        instagram: '',
        youtube: '',
        twitter: ''
      },
      padding: 15
    }
  },
  footer: {
    id: 'footer',
    name: 'Stopka',
    icon: Mail,
    category: 'structure',
    defaultContent: {
      type: 'footer',
      content: '<p style="margin:0">{{kosciol}}</p><p style="margin:5px 0 0 0"><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>',
      backgroundColor: '#f9fafb',
      textColor: '#6b7280',
      alignment: 'center',
      padding: 20
    }
  }
};

const BLOCK_CATEGORIES = {
  structure: { name: 'Struktura', icon: Layers, blocks: ['header', 'columns', 'divider', 'spacer', 'footer'] },
  content: { name: 'Treść', icon: Type, blocks: ['text', 'heading', 'image', 'button', 'quote', 'list', 'video', 'social'] }
};

// Gotowe szablony bloków
const BLOCK_PRESETS = {
  hero: {
    name: 'Hero Banner',
    description: 'Duży obraz z nagłówkiem',
    icon: ImageIcon,
    color: 'pink',
    blocks: [
      { ...BLOCK_TYPES.image.defaultContent, id: 'preset-1' },
      { ...BLOCK_TYPES.heading.defaultContent, id: 'preset-2', content: 'Witaj {{imie}}!', level: 1, alignment: 'center' },
      { ...BLOCK_TYPES.text.defaultContent, id: 'preset-3', content: '<p>Mamy dla Ciebie wspaniałe wiadomości.</p>', alignment: 'center' },
      { ...BLOCK_TYPES.button.defaultContent, id: 'preset-4', text: 'Dowiedz się więcej' }
    ]
  },
  announcement: {
    name: 'Ogłoszenie',
    description: 'Wyróżniona informacja',
    icon: Sparkles,
    color: 'amber',
    blocks: [
      { ...BLOCK_TYPES.quote.defaultContent, id: 'preset-1', content: 'Ważne ogłoszenie dla naszej społeczności!', backgroundColor: '#fef3c7', borderColor: '#f59e0b', textColor: '#92400e' },
      { ...BLOCK_TYPES.text.defaultContent, id: 'preset-2', content: '<p>Szczegóły ogłoszenia...</p>' }
    ]
  },
  event: {
    name: 'Wydarzenie',
    description: 'Zaproszenie z datą i miejscem',
    icon: FileText,
    color: 'green',
    blocks: [
      { ...BLOCK_TYPES.heading.defaultContent, id: 'preset-1', content: '🎉 Nadchodzące wydarzenie', alignment: 'center' },
      { ...BLOCK_TYPES.divider.defaultContent, id: 'preset-2' },
      { ...BLOCK_TYPES.list.defaultContent, id: 'preset-3', items: ['📅 Data: [wpisz datę]', '📍 Miejsce: [wpisz miejsce]', '⏰ Godzina: [wpisz godzinę]'], listStyle: 'none' },
      { ...BLOCK_TYPES.button.defaultContent, id: 'preset-4', text: 'Zapisz się', backgroundColor: '#10b981' }
    ]
  },
  newsletter: {
    name: 'Newsletter',
    description: 'Kompletny szablon newslettera',
    icon: Mail,
    color: 'blue',
    blocks: [
      { ...BLOCK_TYPES.header.defaultContent, id: 'preset-1' },
      { ...BLOCK_TYPES.heading.defaultContent, id: 'preset-2', content: 'Newsletter - {{data}}', alignment: 'center' },
      { ...BLOCK_TYPES.text.defaultContent, id: 'preset-3', content: '<p>Drogi {{imie}},</p><p>Oto najnowsze wiadomości z naszej społeczności.</p>' },
      { ...BLOCK_TYPES.divider.defaultContent, id: 'preset-4' },
      { ...BLOCK_TYPES.heading.defaultContent, id: 'preset-5', content: '📰 Aktualności', level: 3 },
      { ...BLOCK_TYPES.text.defaultContent, id: 'preset-6', content: '<p>Treść aktualności...</p>' },
      { ...BLOCK_TYPES.footer.defaultContent, id: 'preset-7' }
    ]
  },
  twoColumn: {
    name: 'Dwie kolumny',
    description: 'Treść w dwóch kolumnach',
    icon: Columns,
    color: 'purple',
    blocks: [
      { ...BLOCK_TYPES.columns.defaultContent, id: 'preset-1', leftContent: '<h3>Kolumna 1</h3><p>Treść lewej kolumny...</p>', rightContent: '<h3>Kolumna 2</h3><p>Treść prawej kolumny...</p>' }
    ]
  }
};

// Globalne ustawienia emaila
const DEFAULT_EMAIL_SETTINGS = {
  backgroundColor: '#f3f4f6',
  contentBackgroundColor: '#ffffff',
  maxWidth: 600,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
};

export default function DragDropEmailBuilder({ content, jsonBlocks, onChange, onBlocksChange, onSave }) {
  const [blocks, setBlocks] = useState(() => {
    // Priorytet: jsonBlocks > content (HTML)
    if (jsonBlocks && Array.isArray(jsonBlocks) && jsonBlocks.length > 0) {
      return jsonBlocks;
    }
    return parseHtmlToBlocks(content);
  });
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [dragState, setDragState] = useState({ isDragging: false, draggedType: null, draggedBlockId: null, dropIndex: null });
  const [viewMode, setViewMode] = useState('desktop');
  const [showHtml, setShowHtml] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [emailSettings, setEmailSettings] = useState(DEFAULT_EMAIL_SETTINGS);
  const [expandedCategory, setExpandedCategory] = useState('content');
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const canvasRef = useRef(null);
  const dropIndicatorRef = useRef(null);
  const initializedRef = useRef(false);

  // Załaduj bloki z jsonBlocks gdy zmieni się z zewnątrz
  useEffect(() => {
    if (jsonBlocks && Array.isArray(jsonBlocks) && jsonBlocks.length > 0 && !initializedRef.current) {
      setBlocks(jsonBlocks);
      initializedRef.current = true;
    }
  }, [jsonBlocks]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockId) {
          e.preventDefault();
          removeBlock(selectedBlockId);
        }
      }
      if (e.key === 'Escape') {
        setSelectedBlockId(null);
        setEditingBlockId(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedBlockId) {
        e.preventDefault();
        const block = blocks.find(b => b.id === selectedBlockId);
        if (block) setClipboard(JSON.parse(JSON.stringify(block)));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        const newBlock = {
          ...clipboard,
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        const index = selectedBlockId ? blocks.findIndex(b => b.id === selectedBlockId) + 1 : blocks.length;
        const newBlocks = [...blocks];
        newBlocks.splice(index, 0, newBlock);
        setBlocks(newBlocks);
        setSelectedBlockId(newBlock.id);
        updateHtml(newBlocks);
        addToHistory(newBlocks);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedBlockId) {
        e.preventDefault();
        duplicateBlock(selectedBlockId);
      }
      if (e.key === 'ArrowUp' && e.altKey && selectedBlockId) {
        e.preventDefault();
        moveBlock(selectedBlockId, 'up');
      }
      if (e.key === 'ArrowDown' && e.altKey && selectedBlockId) {
        e.preventDefault();
        moveBlock(selectedBlockId, 'down');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockId, blocks, clipboard, historyIndex]);

  // Aktualizuj HTML gdy zmienią się bloki
  const updateHtml = useCallback((newBlocks, settings = emailSettings) => {
    const html = blocksToHtml(newBlocks, settings);
    onChange?.(html);
    // Eksportuj też bloki JSON dla łatwiejszego późniejszego ładowania
    onBlocksChange?.(newBlocks);
  }, [onChange, onBlocksChange, emailSettings]);

  // Dodaj do historii
  const addToHistory = useCallback((newBlocks) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.stringify(newBlocks));
    setHistory(newHistory.slice(-50));
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const restoredBlocks = JSON.parse(history[newIndex]);
      setBlocks(restoredBlocks);
      updateHtml(restoredBlocks);
    }
  }, [history, historyIndex, updateHtml]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const restoredBlocks = JSON.parse(history[newIndex]);
      setBlocks(restoredBlocks);
      updateHtml(restoredBlocks);
    }
  }, [history, historyIndex, updateHtml]);

  // Dodaj blok
  const addBlock = useCallback((blockType, index = blocks.length) => {
    const blockDef = BLOCK_TYPES[blockType];
    if (!blockDef) return;

    const newBlock = {
      ...JSON.parse(JSON.stringify(blockDef.defaultContent)),
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const newBlocks = [...blocks];
    newBlocks.splice(index, 0, newBlock);
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
    updateHtml(newBlocks);
    addToHistory(newBlocks);
  }, [blocks, updateHtml, addToHistory]);

  // Dodaj preset
  const addPreset = useCallback((presetKey) => {
    const preset = BLOCK_PRESETS[presetKey];
    if (!preset) return;

    const newBlocks = preset.blocks.map(block => ({
      ...JSON.parse(JSON.stringify(block)),
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }));

    const allBlocks = [...blocks, ...newBlocks];
    setBlocks(allBlocks);
    updateHtml(allBlocks);
    addToHistory(allBlocks);
  }, [blocks, updateHtml, addToHistory]);

  // Usuń blok
  const removeBlock = useCallback((blockId) => {
    const newBlocks = blocks.filter(b => b.id !== blockId);
    setBlocks(newBlocks);
    setSelectedBlockId(null);
    updateHtml(newBlocks);
    addToHistory(newBlocks);
  }, [blocks, updateHtml, addToHistory]);

  // Duplikuj blok
  const duplicateBlock = useCallback((blockId) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index === -1) return;

    const newBlock = {
      ...JSON.parse(JSON.stringify(blocks[index])),
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
    updateHtml(newBlocks);
    addToHistory(newBlocks);
  }, [blocks, updateHtml, addToHistory]);

  // Przesuń blok
  const moveBlock = useCallback((blockId, direction) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;

    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
    setBlocks(newBlocks);
    updateHtml(newBlocks);
    addToHistory(newBlocks);
  }, [blocks, updateHtml, addToHistory]);

  // Aktualizuj właściwości bloku
  const updateBlockProperty = useCallback((blockId, property, value) => {
    setBlocks(prevBlocks => {
      const newBlocks = prevBlocks.map(block => {
        if (block.id === blockId) {
          // Obsługuje zarówno pojedynczą właściwość jak i obiekt zmian
          if (typeof property === 'object') {
            return { ...block, ...property };
          }
          return { ...block, [property]: value };
        }
        return block;
      });
      return newBlocks;
    });
  }, []);

  // Efekt do aktualizacji HTML po zmianie bloków
  useEffect(() => {
    updateHtml(blocks);
  }, [blocks, updateHtml]);

  // Zapisz historię po zakończeniu edycji
  const commitBlockChanges = useCallback(() => {
    addToHistory(blocks);
  }, [blocks, addToHistory]);

  // Drag & Drop - rozpocznij przeciąganie z palety
  const handlePaletteDragStart = (e, blockType) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', blockType);
    setDragState({ isDragging: true, draggedType: blockType, draggedBlockId: null, dropIndex: null });

    // Dodaj wizualny feedback
    const ghost = document.createElement('div');
    ghost.className = 'bg-pink-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm';
    ghost.textContent = BLOCK_TYPES[blockType]?.name || blockType;
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 50, 20);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  // Drag & Drop - rozpocznij przeciąganie istniejącego bloku
  const handleBlockDragStart = (e, blockId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('blockId', blockId);
    setDragState({ isDragging: true, draggedType: null, draggedBlockId: blockId, dropIndex: null });
  };

  // Drag & Drop - przeciąganie nad canvasem
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragState.draggedBlockId ? 'move' : 'copy';

    if (dragState.dropIndex !== index) {
      setDragState(prev => ({ ...prev, dropIndex: index }));
    }
  };

  // Drag & Drop - opuść strefę
  const handleDragLeave = (e) => {
    // Sprawdź czy opuszczamy canvas całkowicie
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) {
      setDragState(prev => ({ ...prev, dropIndex: null }));
    }
  };

  // Drag & Drop - upuść
  const handleDrop = (e, index) => {
    e.preventDefault();

    const blockType = e.dataTransfer.getData('text/plain');
    const blockId = e.dataTransfer.getData('blockId');

    if (blockType && BLOCK_TYPES[blockType]) {
      // Nowy blok z palety
      addBlock(blockType, index);
    } else if (blockId) {
      // Przenoszenie istniejącego bloku
      const sourceIndex = blocks.findIndex(b => b.id === blockId);
      if (sourceIndex !== -1 && sourceIndex !== index) {
        const newBlocks = [...blocks];
        const [movedBlock] = newBlocks.splice(sourceIndex, 1);
        const adjustedIndex = sourceIndex < index ? index - 1 : index;
        newBlocks.splice(adjustedIndex, 0, movedBlock);
        setBlocks(newBlocks);
        updateHtml(newBlocks);
        addToHistory(newBlocks);
      }
    }

    setDragState({ isDragging: false, draggedType: null, draggedBlockId: null, dropIndex: null });
  };

  // Drag & Drop - koniec przeciągania
  const handleDragEnd = () => {
    setDragState({ isDragging: false, draggedType: null, draggedBlockId: null, dropIndex: null });
  };

  // Aktualizuj ustawienia emaila
  const updateEmailSettings = (key, value) => {
    const newSettings = { ...emailSettings, [key]: value };
    setEmailSettings(newSettings);
    updateHtml(blocks, newSettings);
  };

  // Wyczyść wszystko
  const clearAll = () => {
    if (confirm('Czy na pewno chcesz usunąć wszystkie bloki?')) {
      setBlocks([]);
      setSelectedBlockId(null);
      updateHtml([]);
      addToHistory([]);
    }
  };

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm overflow-hidden">
      {/* Lewy panel - Bloki */}
      <div className="w-72 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-r border-gray-200/50 dark:border-gray-700/50 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-500/5 to-orange-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
              <Layers size={14} className="text-white" />
            </div>
            Elementy
          </h3>
          <p className="text-xs text-gray-500 mt-1">Przeciągnij na canvas lub kliknij</p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Kategorie bloków */}
          {Object.entries(BLOCK_CATEGORIES).map(([catKey, category]) => {
            const CatIcon = category.icon;
            const isExpanded = expandedCategory === catKey;

            return (
              <div key={catKey} className="border-b border-gray-100/50 dark:border-gray-700/50">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : catKey)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gradient-to-r hover:from-pink-50/50 hover:to-orange-50/50 dark:hover:from-pink-900/10 dark:hover:to-orange-900/10 transition-all duration-200"
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <div className={`p-1 rounded-md ${isExpanded ? 'bg-pink-100 dark:bg-pink-900/30' : 'bg-gray-100 dark:bg-gray-700'} transition-colors`}>
                      <CatIcon size={14} className={isExpanded ? 'text-pink-500' : 'text-gray-500'} />
                    </div>
                    {category.name}
                  </span>
                  <ChevronRight size={16} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-pink-500' : ''}`} />
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-200">
                    {category.blocks.map(blockKey => {
                      const block = BLOCK_TYPES[blockKey];
                      const Icon = block.icon;
                      return (
                        <div
                          key={blockKey}
                          draggable
                          onDragStart={(e) => handlePaletteDragStart(e, blockKey)}
                          onDragEnd={handleDragEnd}
                          onClick={() => addBlock(blockKey)}
                          className={`group flex flex-col items-center gap-1.5 p-3 bg-white dark:bg-gray-700/50 rounded-xl cursor-grab hover:bg-gradient-to-br hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/20 dark:hover:to-orange-900/20 border border-gray-100 dark:border-gray-600/50 hover:border-pink-200 dark:hover:border-pink-700/50 transition-all duration-200 active:scale-95 hover:shadow-md ${
                            dragState.draggedType === blockKey ? 'opacity-50 scale-95' : ''
                          }`}
                        >
                          <div className="p-2 bg-gray-50 dark:bg-gray-600/50 rounded-lg group-hover:bg-pink-100 dark:group-hover:bg-pink-900/30 transition-colors">
                            <Icon size={18} className="text-gray-500 dark:text-gray-400 group-hover:text-pink-500 transition-colors" />
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400 text-center leading-tight font-medium">
                            {block.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Gotowe szablony */}
          <div className="p-4 bg-gradient-to-b from-transparent to-gray-50/50 dark:to-gray-800/50">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <div className="p-1 bg-gradient-to-br from-amber-400 to-orange-500 rounded-md">
                <Wand2 size={10} className="text-white" />
              </div>
              Gotowe sekcje
            </h4>
            <div className="space-y-2">
              {Object.entries(BLOCK_PRESETS).map(([key, preset]) => {
                const Icon = preset.icon;
                const colorClasses = {
                  pink: 'from-pink-50 to-pink-100/80 dark:from-pink-900/20 dark:to-pink-900/30 hover:from-pink-100 hover:to-pink-200/80 border-pink-200/50 hover:border-pink-300',
                  amber: 'from-amber-50 to-amber-100/80 dark:from-amber-900/20 dark:to-amber-900/30 hover:from-amber-100 hover:to-amber-200/80 border-amber-200/50 hover:border-amber-300',
                  green: 'from-green-50 to-green-100/80 dark:from-green-900/20 dark:to-green-900/30 hover:from-green-100 hover:to-green-200/80 border-green-200/50 hover:border-green-300',
                  blue: 'from-blue-50 to-blue-100/80 dark:from-blue-900/20 dark:to-blue-900/30 hover:from-blue-100 hover:to-blue-200/80 border-blue-200/50 hover:border-blue-300',
                  purple: 'from-purple-50 to-purple-100/80 dark:from-purple-900/20 dark:to-purple-900/30 hover:from-purple-100 hover:to-purple-200/80 border-purple-200/50 hover:border-purple-300'
                };
                const iconBg = {
                  pink: 'from-pink-400 to-pink-600',
                  amber: 'from-amber-400 to-orange-500',
                  green: 'from-green-400 to-emerald-500',
                  blue: 'from-blue-400 to-indigo-500',
                  purple: 'from-purple-400 to-violet-500'
                };

                return (
                  <button
                    key={key}
                    onClick={() => addPreset(key)}
                    className={`w-full flex items-start gap-3 p-3 bg-gradient-to-r ${colorClasses[preset.color]} rounded-xl transition-all duration-200 text-left group border hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${iconBg[preset.color]} shadow-sm`}>
                      <Icon size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block">{preset.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{preset.description}</span>
                    </div>
                    <div className="p-1 rounded-full bg-white/50 dark:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:rotate-90">
                      <Plus size={14} className="text-gray-500" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Środek - Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50 px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-1">
              <button
                onClick={undo}
                disabled={historyIndex <= 0}
                className="p-2 rounded-lg hover:bg-white dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-sm"
                title="Cofnij (Ctrl+Z)"
              >
                <Undo size={16} className="text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="p-2 rounded-lg hover:bg-white dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-sm"
                title="Ponów (Ctrl+Shift+Z)"
              >
                <Redo size={16} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />

            <button
              onClick={clearAll}
              disabled={blocks.length === 0}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              title="Wyczyść wszystko"
            >
              <RotateCcw size={16} className="text-gray-500" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setViewMode('desktop')}
              className={`p-2 rounded-lg transition-all duration-200 ${viewMode === 'desktop' ? 'bg-white dark:bg-gray-600 shadow-md text-pink-500' : 'text-gray-500 hover:text-gray-700'}`}
              title="Widok desktop"
            >
              <Monitor size={16} />
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={`p-2 rounded-lg transition-all duration-200 ${viewMode === 'mobile' ? 'bg-white dark:bg-gray-600 shadow-md text-pink-500' : 'text-gray-500 hover:text-gray-700'}`}
              title="Widok mobile"
            >
              <Smartphone size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHtml(!showHtml)}
              className={`p-2 rounded-lg transition-all duration-200 ${showHtml ? 'bg-gradient-to-r from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 text-pink-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'}`}
              title="Pokaż HTML"
            >
              <Code size={16} />
            </button>
            {onSave && (
              <button
                onClick={onSave}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-pink-500/25 transition-all duration-200 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Save size={14} />
                Zapisz
              </button>
            )}
          </div>
        </div>

        {/* Canvas area */}
        <div
          className="flex-1 overflow-y-auto p-8"
          style={{
            backgroundColor: emailSettings.backgroundColor,
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)',
            backgroundSize: '20px 20px'
          }}
        >
          <div
            ref={canvasRef}
            className={`mx-auto shadow-2xl rounded-xl transition-all duration-300 ring-1 ring-gray-200/50 dark:ring-gray-700/50 ${
              viewMode === 'mobile' ? 'max-w-[375px]' : ''
            }`}
            style={{
              maxWidth: viewMode === 'desktop' ? `${emailSettings.maxWidth}px` : '375px',
              backgroundColor: emailSettings.contentBackgroundColor,
              minHeight: '400px'
            }}
            onDragLeave={handleDragLeave}
          >
            {showHtml ? (
              <div className="p-4">
                <pre className="text-xs whitespace-pre-wrap overflow-x-auto font-mono bg-gray-900 text-green-400 p-4 rounded-xl max-h-[500px] overflow-y-auto border border-gray-700">
                  {blocksToHtml(blocks, emailSettings)}
                </pre>
              </div>
            ) : (
              <div className="relative">
                {blocks.length === 0 ? (
                  <div
                    className={`h-full min-h-[400px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-xl m-4 transition-all duration-300 ${
                      dragState.isDragging
                        ? 'border-pink-400 bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onDragOver={(e) => handleDragOver(e, 0)}
                    onDrop={(e) => handleDrop(e, 0)}
                  >
                    <div className={`p-4 rounded-2xl mb-4 transition-all duration-300 ${
                      dragState.isDragging
                        ? 'bg-gradient-to-br from-pink-500 to-orange-500 shadow-lg shadow-pink-500/30'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}>
                      <Plus size={32} strokeWidth={1.5} className={dragState.isDragging ? 'text-white' : 'text-gray-400'} />
                    </div>
                    <p className={`font-semibold text-base mb-1 transition-colors ${dragState.isDragging ? 'text-pink-600 dark:text-pink-400' : ''}`}>
                      {dragState.isDragging ? 'Upuść tutaj!' : 'Przeciągnij elementy tutaj'}
                    </p>
                    <p className="text-sm text-gray-400">lub wybierz gotową sekcję z panelu po lewej</p>
                  </div>
                ) : (
                  <div className="relative">
                    {blocks.map((block, index) => (
                      <React.Fragment key={block.id}>
                        {/* Drop indicator przed blokiem */}
                        <DropZone
                          index={index}
                          isActive={dragState.dropIndex === index}
                          isDragging={dragState.isDragging}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={(e) => handleDrop(e, index)}
                        />

                        {/* Blok */}
                        <BlockRenderer
                          block={block}
                          isSelected={selectedBlockId === block.id}
                          isEditing={editingBlockId === block.id}
                          isDragging={dragState.draggedBlockId === block.id}
                          onSelect={() => setSelectedBlockId(block.id)}
                          onDoubleClick={() => {
                            if (['text', 'heading', 'quote', 'footer'].includes(block.type)) {
                              setEditingBlockId(block.id);
                            }
                          }}
                          onRemove={() => removeBlock(block.id)}
                          onDuplicate={() => duplicateBlock(block.id)}
                          onMoveUp={() => moveBlock(block.id, 'up')}
                          onMoveDown={() => moveBlock(block.id, 'down')}
                          onDragStart={(e) => handleBlockDragStart(e, block.id)}
                          onDragEnd={handleDragEnd}
                          onContentChange={(content) => {
                            updateBlockProperty(block.id, 'content', content);
                          }}
                          onFinishEditing={() => {
                            setEditingBlockId(null);
                            commitBlockChanges();
                          }}
                          canMoveUp={index > 0}
                          canMoveDown={index < blocks.length - 1}
                        />
                      </React.Fragment>
                    ))}

                    {/* Drop indicator na końcu */}
                    <DropZone
                      index={blocks.length}
                      isActive={dragState.dropIndex === blocks.length}
                      isDragging={dragState.isDragging}
                      onDragOver={(e) => handleDragOver(e, blocks.length)}
                      onDrop={(e) => handleDrop(e, blocks.length)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Liczba bloków */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-t border-gray-200/50 dark:border-gray-700/50 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-full">
              {blocks.length}
            </span>
            {blocks.length === 1 ? 'blok' : blocks.length < 5 ? 'bloki' : 'bloków'}
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-mono">⌘Z</kbd> cofnij</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-mono">Del</kbd> usuń</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-mono">⌘D</kbd> duplikuj</span>
          </div>
        </div>
      </div>

      {/* Prawy panel - Właściwości */}
      <div className="w-80 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-l border-gray-200/50 dark:border-gray-700/50 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-500/5 to-orange-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
              <Settings size={14} className="text-white" />
            </div>
            {selectedBlock ? 'Właściwości bloku' : 'Ustawienia emaila'}
          </h3>
          {selectedBlock && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              Edytujesz: <span className="font-medium text-pink-600 dark:text-pink-400">{BLOCK_TYPES[selectedBlock.type]?.name || selectedBlock.type}</span>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {selectedBlock ? (
            <BlockPropertiesEditor
              block={selectedBlock}
              onChange={(property, value) => updateBlockProperty(selectedBlockId, property, value)}
              onCommit={commitBlockChanges}
            />
          ) : (
            <EmailSettingsEditor
              settings={emailSettings}
              onChange={updateEmailSettings}
            />
          )}
        </div>

        {/* Zmienne personalizacji */}
        <div className="border-t border-gray-200/50 dark:border-gray-700/50 p-4 bg-gradient-to-t from-gray-50/50 to-transparent dark:from-gray-800/50">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div className="p-1 bg-gradient-to-br from-purple-400 to-pink-500 rounded-md">
              <Sparkles size={10} className="text-white" />
            </div>
            Zmienne personalizacji
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {EMAIL_VARIABLES.map(v => (
              <button
                key={v.key}
                onClick={() => {
                  navigator.clipboard.writeText(v.key);
                }}
                className="px-2.5 py-1 text-xs font-medium bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 text-pink-600 dark:text-pink-400 rounded-lg hover:from-pink-100 hover:to-orange-100 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30 transition-all duration-200 border border-pink-200/50 dark:border-pink-700/30 hover:shadow-sm hover:scale-105 active:scale-95"
                title={`${v.description} - kliknij aby skopiować`}
              >
                {v.key}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Drop Zone komponent
function DropZone({ index, isActive, isDragging, onDragOver, onDrop }) {
  // Gdy nie przeciągamy, DropZone nie przechwytuje zdarzeń myszy
  if (!isDragging) {
    return <div className="h-0" />;
  }

  return (
    <div
      className={`transition-all duration-300 ease-out ${
        isDragging ? 'min-h-[80px] my-2' : 'h-0'
      } ${
        isActive
          ? 'min-h-[120px] my-3 bg-gradient-to-r from-pink-100/80 to-orange-100/80 dark:from-pink-900/30 dark:to-orange-900/30 border-2 border-dashed border-pink-400 dark:border-pink-500 rounded-xl mx-3 flex items-center justify-center shadow-inner backdrop-blur-sm scale-[1.02]'
          : 'mx-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-center'
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isActive ? (
        <span className="text-pink-500 text-base font-semibold flex items-center gap-2">
          <Plus size={20} />
          Upuść tutaj
        </span>
      ) : (
        <span className="text-gray-400 dark:text-gray-500 text-sm flex items-center gap-1.5">
          <Plus size={16} />
          Upuść tutaj
        </span>
      )}
    </div>
  );
}

// Renderer pojedynczego bloku
function BlockRenderer({
  block,
  isSelected,
  isEditing,
  isDragging,
  onSelect,
  onDoubleClick,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onContentChange,
  onFinishEditing,
  canMoveUp,
  canMoveDown
}) {
  const contentRef = useRef(null);

  useEffect(() => {
    if (isEditing && contentRef.current) {
      contentRef.current.focus();
      // Zaznacz cały tekst
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [isEditing]);

  const handleContentBlur = () => {
    if (contentRef.current) {
      onContentChange(contentRef.current.innerHTML);
      onFinishEditing();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onFinishEditing();
    }
  };

  // Pobierz style tła dla podglądu na canvas
  const backgroundStyle = getBlockBackgroundStyle(block);

  return (
    <div
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      style={backgroundStyle}
      className={`relative group transition-all duration-200 ${
        isDragging ? 'opacity-50 scale-[0.98]' : ''
      } ${
        isSelected
          ? 'ring-2 ring-pink-500 ring-offset-2 dark:ring-offset-gray-900 z-10 shadow-lg shadow-pink-500/10'
          : 'hover:ring-2 hover:ring-pink-300/50 hover:ring-offset-1 dark:hover:ring-offset-gray-900'
      }`}
    >
      {/* Kontrolki bloku - lewa strona */}
      <div className={`absolute left-2 top-2 flex flex-col gap-1 transition-all duration-200 z-20 ${
        isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
      }`}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1.5 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-lg cursor-grab hover:bg-white dark:hover:bg-gray-600 border border-gray-200/50 dark:border-gray-600/50 hover:scale-110 transition-all duration-200"
          title="Przeciągnij"
        >
          <GripVertical size={14} className="text-gray-500" />
        </button>
        {canMoveUp && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            className="p-1.5 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white dark:hover:bg-gray-600 border border-gray-200/50 dark:border-gray-600/50 hover:scale-110 hover:-translate-y-0.5 transition-all duration-200"
            title="Przesuń w górę (Alt+↑)"
          >
            <ArrowUp size={14} className="text-gray-500" />
          </button>
        )}
        {canMoveDown && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            className="p-1.5 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white dark:hover:bg-gray-600 border border-gray-200/50 dark:border-gray-600/50 hover:scale-110 hover:translate-y-0.5 transition-all duration-200"
            title="Przesuń w dół (Alt+↓)"
          >
            <ArrowDown size={14} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* Kontrolki bloku - prawa strona */}
      <div className={`absolute right-2 top-2 flex flex-row gap-1.5 transition-all duration-200 z-20 ${
        isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
      }`}>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1.5 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200/50 dark:border-gray-600/50 hover:scale-110 hover:border-blue-300 transition-all duration-200 group/btn"
          title="Duplikuj (Ctrl+D)"
        >
          <Copy size={14} className="text-blue-500 group-hover/btn:text-blue-600" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-red-50 dark:hover:bg-red-900/30 border border-gray-200/50 dark:border-gray-600/50 hover:scale-110 hover:border-red-300 transition-all duration-200 group/btn"
          title="Usuń (Delete)"
        >
          <Trash2 size={14} className="text-red-500 group-hover/btn:text-red-600" />
        </button>
      </div>

      {/* Label typu bloku */}
      {isSelected && (() => {
        const BlockIcon = BLOCK_TYPES[block.type]?.icon;
        return (
          <div className="absolute -top-7 left-0 px-3 py-1 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-xs rounded-t-xl font-semibold flex items-center gap-1.5 shadow-lg shadow-pink-500/30">
            {BlockIcon && <BlockIcon size={12} />}
            {BLOCK_TYPES[block.type]?.name || block.type}
          </div>
        );
      })()}

      {/* Renderuj zawartość bloku */}
      {isEditing && ['text', 'heading', 'quote', 'footer'].includes(block.type) ? (
        <div
          ref={contentRef}
          contentEditable
          onBlur={handleContentBlur}
          onKeyDown={handleKeyDown}
          className="outline-none min-h-[40px]"
          style={getBlockEditingStyle(block)}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: blockToHtml(block) }} />
      )}
    </div>
  );
}

// Funkcja pomocnicza do konwersji wartości spacing na CSS
function spacingToCss(value) {
  if (typeof value === 'object' && value !== null) {
    return `${value.top || 0}px ${value.right || 0}px ${value.bottom || 0}px ${value.left || 0}px`;
  }
  return value ? `${value}px` : '0px';
}

// Generowanie stylów dla wrappera bloku na canvas (tylko marginesy zewnętrzne)
// Tło, border, shadow są renderowane przez wewnętrzny HTML (blockToHtml)
function getBlockBackgroundStyle(block) {
  const style = {};

  // Tylko marginesy zewnętrzne dla wrappera - reszta stylów jest w blockToHtml
  if (block.margin) {
    style.margin = spacingToCss(block.margin);
  }

  return style;
}

// Style dla edycji inline - zawiera wszystkie style wizualne
function getBlockEditingStyle(block) {
  const baseStyle = {
    padding: spacingToCss(block.padding || 15),
    textAlign: block.alignment || 'left',
  };

  // Tło
  if (block.backgroundGradient) {
    const { type, angle, color1, color2 } = block.backgroundGradient;
    if (type === 'linear') {
      baseStyle.background = `linear-gradient(${angle || 135}deg, ${color1 || '#ec4899'}, ${color2 || '#f97316'})`;
    } else {
      baseStyle.background = `radial-gradient(circle, ${color1 || '#ec4899'}, ${color2 || '#f97316'})`;
    }
  } else if (block.backgroundImage) {
    baseStyle.backgroundImage = `url(${block.backgroundImage})`;
    baseStyle.backgroundSize = 'cover';
    baseStyle.backgroundPosition = 'center';
  } else if (block.backgroundColor && block.backgroundColor !== 'transparent') {
    baseStyle.backgroundColor = block.backgroundColor;
  }

  // Zaokrąglenie
  if (block.borderRadius) {
    baseStyle.borderRadius = `${block.borderRadius}px`;
  }

  // Opacity
  if (block.backgroundOpacity !== undefined && block.backgroundOpacity < 100) {
    baseStyle.opacity = block.backgroundOpacity / 100;
  }

  // Border
  if (block.border && block.border.width > 0) {
    const { width, color, sides } = block.border;
    const bStyle = block.border.style || 'solid';
    if (sides && (!sides.top || !sides.right || !sides.bottom || !sides.left)) {
      if (sides.top) baseStyle.borderTop = `${width}px ${bStyle} ${color}`;
      if (sides.right) baseStyle.borderRight = `${width}px ${bStyle} ${color}`;
      if (sides.bottom) baseStyle.borderBottom = `${width}px ${bStyle} ${color}`;
      if (sides.left) baseStyle.borderLeft = `${width}px ${bStyle} ${color}`;
    } else {
      baseStyle.border = `${width}px ${bStyle} ${color}`;
    }
  }

  // Box shadow
  if (block.boxShadow && block.boxShadow.enabled) {
    const { offsetX = 0, offsetY = 4, blur = 12, spread = 0, color = '#00000033', inset, direction = 'all' } = block.boxShadow;
    const insetStr = inset ? 'inset ' : '';
    const absOffsetX = Math.abs(offsetX || 4);
    const absOffsetY = Math.abs(offsetY || 4);

    let shadowValue;
    switch (direction) {
      case 'bottom':
        shadowValue = `${insetStr}0px ${absOffsetY}px ${blur}px ${spread}px ${color}`;
        break;
      case 'top':
        shadowValue = `${insetStr}0px -${absOffsetY}px ${blur}px ${spread}px ${color}`;
        break;
      case 'left':
        shadowValue = `${insetStr}-${absOffsetX}px 0px ${blur}px ${spread}px ${color}`;
        break;
      case 'right':
        shadowValue = `${insetStr}${absOffsetX}px 0px ${blur}px ${spread}px ${color}`;
        break;
      case 'horizontal':
        const hBlur = Math.max(4, blur / 2);
        shadowValue = `${insetStr}${absOffsetX}px 0px ${hBlur}px 0px ${color}, ${insetStr}-${absOffsetX}px 0px ${hBlur}px 0px ${color}`;
        break;
      case 'vertical':
        const vBlur = Math.max(4, blur / 2);
        shadowValue = `${insetStr}0px ${absOffsetY}px ${vBlur}px 0px ${color}, ${insetStr}0px -${absOffsetY}px ${vBlur}px 0px ${color}`;
        break;
      default:
        shadowValue = `${insetStr}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`;
    }
    baseStyle.boxShadow = shadowValue;
  }

  if (block.type === 'text') {
    return {
      ...baseStyle,
      fontSize: `${block.fontSize || 16}px`,
      color: block.textColor || '#333333',
      lineHeight: block.lineHeight || 1.6
    };
  }

  if (block.type === 'heading') {
    const sizes = { 1: 32, 2: 24, 3: 20 };
    return {
      ...baseStyle,
      fontSize: `${sizes[block.level] || 24}px`,
      fontWeight: 'bold',
      color: block.textColor || '#1f2937'
    };
  }

  if (block.type === 'quote') {
    return {
      ...baseStyle,
      borderLeft: `4px solid ${block.borderColor || '#ec4899'}`,
      backgroundColor: block.backgroundColor || '#fdf2f8',
      color: block.textColor || '#831843',
      fontStyle: 'italic'
    };
  }

  return baseStyle;
}

// Edytor ustawień emaila
function EmailSettingsEditor({ settings, onChange }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Palette size={16} className="text-pink-500" />
        <span className="font-medium text-gray-900 dark:text-white">Ogólne ustawienia</span>
      </div>

      <PropertyField
        label="Kolor tła (zewnętrzny)"
        type="color"
        value={settings.backgroundColor}
        onChange={(v) => onChange('backgroundColor', v)}
      />

      <PropertyField
        label="Kolor tła treści"
        type="color"
        value={settings.contentBackgroundColor}
        onChange={(v) => onChange('contentBackgroundColor', v)}
      />

      <PropertyField
        label="Maksymalna szerokość (px)"
        type="range"
        min={400}
        max={800}
        value={settings.maxWidth}
        onChange={(v) => onChange('maxWidth', v)}
      />

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Kliknij na blok, aby edytować jego właściwości. Dwukrotne kliknięcie na tekst umożliwia edycję inline.
        </p>
      </div>
    </div>
  );
}

// Edytor właściwości bloku
function BlockPropertiesEditor({ block, onChange, onCommit }) {
  const blockType = BLOCK_TYPES[block.type];

  const handleChange = (property, value) => {
    onChange(property, value);
  };

  const handleBlur = () => {
    onCommit();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        {blockType && <blockType.icon size={16} className="text-pink-500" />}
        <span className="font-medium text-gray-900 dark:text-white">
          {blockType?.name || block.type}
        </span>
      </div>

      {/* Wspólne właściwości - Marginesy i Padding */}
      {block.padding !== undefined && (
        <SpacingEditor
          label="Marginesy wewnętrzne (padding)"
          icon={Square}
          value={block.padding}
          onChange={(v) => handleChange('padding', v)}
          onBlur={handleBlur}
          max={60}
        />
      )}

      {block.backgroundColor !== undefined && block.type !== 'button' && block.type !== 'divider' && block.type !== 'spacer' && (
        <SpacingEditor
          label="Marginesy zewnętrzne (margin)"
          icon={Move}
          value={block.margin || 0}
          onChange={(v) => handleChange('margin', v)}
          onBlur={handleBlur}
          max={60}
        />
      )}

      {block.backgroundColor !== undefined && block.type !== 'button' && (
        <BackgroundEditor
          backgroundColor={block.backgroundColor || 'transparent'}
          backgroundGradient={block.backgroundGradient || null}
          backgroundImage={block.backgroundImage || ''}
          backgroundOpacity={block.backgroundOpacity ?? 100}
          onChange={(property, value) => handleChange(property, value)}
          onBlur={handleBlur}
        />
      )}

      {/* Zaokrąglenia - tylko dla bloków z tłem */}
      {block.backgroundColor !== undefined && block.type !== 'button' && block.type !== 'divider' && block.type !== 'spacer' && (
        <PropertyField
          label="Zaokrąglenie rogów"
          type="range"
          min={0}
          max={32}
          value={block.borderRadius || 0}
          onChange={(v) => handleChange('borderRadius', v)}
          onBlur={handleBlur}
        />
      )}

      {/* Obramowanie - dla bloków z tłem */}
      {block.backgroundColor !== undefined && block.type !== 'button' && block.type !== 'divider' && block.type !== 'spacer' && (
        <BorderEditor
          value={block.border}
          onChange={(v) => handleChange('border', v)}
          onBlur={handleBlur}
        />
      )}

      {/* Cień - dla bloków z tłem */}
      {block.backgroundColor !== undefined && block.type !== 'divider' && block.type !== 'spacer' && (
        <ShadowEditor
          value={block.boxShadow}
          onChange={(v) => handleChange('boxShadow', v)}
          onBlur={handleBlur}
        />
      )}

      {block.alignment !== undefined && (
        <PropertyField label="Wyrównanie" type="alignment" value={block.alignment} onChange={(v) => handleChange('alignment', v)} onBlur={handleBlur} />
      )}

      {/* Właściwości specyficzne dla typu bloku */}
      {block.type === 'text' && (
        <>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <Edit3 size={12} />
              Treść (edytor WYSIWYG)
            </label>
            <BlockTextEditor
              content={block.content}
              onChange={(v) => handleChange('content', v)}
              onBlur={handleBlur}
              placeholder="Wpisz treść bloku tekstowego..."
              showHeadings={true}
              showLists={true}
              showAlignment={true}
              showColors={true}
              showVariables={true}
              minHeight={200}
            />
          </div>
          <PropertyField label="Rozmiar czcionki bazowy" type="range" min={12} max={32} value={block.fontSize} onChange={(v) => handleChange('fontSize', v)} onBlur={handleBlur} />
          <PropertyField label="Wysokość linii" type="range" min={1} max={2.5} step={0.1} value={block.lineHeight} onChange={(v) => handleChange('lineHeight', v)} onBlur={handleBlur} />
          <PropertyField label="Domyślny kolor tekstu" type="color" value={block.textColor} onChange={(v) => handleChange('textColor', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'heading' && (
        <>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <Edit3 size={12} />
              Treść nagłówka
            </label>
            <BlockTextEditor
              content={block.content}
              onChange={(v) => handleChange('content', v)}
              onBlur={handleBlur}
              placeholder="Wpisz treść nagłówka..."
              showHeadings={false}
              showLists={false}
              showAlignment={false}
              showColors={true}
              showVariables={true}
              minHeight={80}
            />
          </div>
          <PropertyField label="Poziom nagłówka" type="select" value={block.level} options={[{value: 1, label: 'H1 - Największy'}, {value: 2, label: 'H2 - Średni'}, {value: 3, label: 'H3 - Mniejszy'}]} onChange={(v) => handleChange('level', parseInt(v))} onBlur={handleBlur} />
          <PropertyField label="Kolor tekstu" type="color" value={block.textColor} onChange={(v) => handleChange('textColor', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'image' && (
        <>
          <PropertyField label="URL obrazu" type="image" value={block.src} onChange={(v) => handleChange('src', v)} onBlur={handleBlur} />
          <PropertyField label="Tekst alternatywny" type="text" value={block.alt} onChange={(v) => handleChange('alt', v)} onBlur={handleBlur} />
          <PropertyField label="Szerokość" type="text" value={block.width} onChange={(v) => handleChange('width', v)} onBlur={handleBlur} placeholder="100% lub 300px" />
          <PropertyField label="Zaokrąglenie" type="range" min={0} max={30} value={block.borderRadius} onChange={(v) => handleChange('borderRadius', v)} onBlur={handleBlur} />
          <PropertyField label="Link (opcjonalnie)" type="text" value={block.linkUrl} onChange={(v) => handleChange('linkUrl', v)} onBlur={handleBlur} placeholder="https://..." />
        </>
      )}

      {block.type === 'button' && (
        <>
          <PropertyField label="Tekst przycisku" type="text" value={block.text} onChange={(v) => handleChange('text', v)} onBlur={handleBlur} />
          <PropertyField label="Link URL" type="text" value={block.linkUrl} onChange={(v) => handleChange('linkUrl', v)} onBlur={handleBlur} />
          <PropertyField label="Kolor przycisku" type="color" value={block.backgroundColor} onChange={(v) => handleChange('backgroundColor', v)} onBlur={handleBlur} />
          <PropertyField label="Kolor tekstu" type="color" value={block.textColor} onChange={(v) => handleChange('textColor', v)} onBlur={handleBlur} />
          <PropertyField label="Rozmiar czcionki" type="range" min={12} max={24} value={block.fontSize} onChange={(v) => handleChange('fontSize', v)} onBlur={handleBlur} />
          <PropertyField label="Zaokrąglenie" type="range" min={0} max={30} value={block.borderRadius} onChange={(v) => handleChange('borderRadius', v)} onBlur={handleBlur} />
          <PropertyField label="Pełna szerokość" type="checkbox" value={block.fullWidth} onChange={(v) => handleChange('fullWidth', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'quote' && (
        <>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <Edit3 size={12} />
              Treść cytatu
            </label>
            <BlockTextEditor
              content={block.content}
              onChange={(v) => handleChange('content', v)}
              onBlur={handleBlur}
              placeholder="Wpisz treść cytatu..."
              showHeadings={false}
              showLists={false}
              showAlignment={true}
              showColors={true}
              showVariables={true}
              minHeight={100}
            />
          </div>
          <PropertyField label="Autor (opcjonalnie)" type="text" value={block.author} onChange={(v) => handleChange('author', v)} onBlur={handleBlur} />
          <PropertyField label="Kolor ramki" type="color" value={block.borderColor} onChange={(v) => handleChange('borderColor', v)} onBlur={handleBlur} />
          <PropertyField label="Kolor tekstu" type="color" value={block.textColor} onChange={(v) => handleChange('textColor', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'list' && (
        <>
          <PropertyField
            label="Elementy listy"
            type="list"
            value={block.items}
            onChange={(v) => handleChange('items', v)}
            onBlur={handleBlur}
          />
          <PropertyField
            label="Styl listy"
            type="select"
            value={block.listStyle}
            options={[
              {value: 'disc', label: '• Kropki'},
              {value: 'decimal', label: '1. Numerowanie'},
              {value: 'none', label: 'Bez znaczników'}
            ]}
            onChange={(v) => handleChange('listStyle', v)}
            onBlur={handleBlur}
          />
          <PropertyField label="Kolor tekstu" type="color" value={block.textColor} onChange={(v) => handleChange('textColor', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'video' && (
        <>
          <PropertyField label="URL miniatury" type="image" value={block.thumbnailUrl} onChange={(v) => handleChange('thumbnailUrl', v)} onBlur={handleBlur} />
          <PropertyField label="URL wideo" type="text" value={block.videoUrl} onChange={(v) => handleChange('videoUrl', v)} onBlur={handleBlur} placeholder="https://youtube.com/..." />
          <PropertyField label="Kolor przycisku play" type="color" value={block.playButtonColor} onChange={(v) => handleChange('playButtonColor', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'divider' && (
        <>
          <PropertyField label="Styl" type="select" value={block.style} options={[{value: 'solid', label: 'Ciągły'}, {value: 'dashed', label: 'Przerywany'}, {value: 'dotted', label: 'Kropkowany'}]} onChange={(v) => handleChange('style', v)} onBlur={handleBlur} />
          <PropertyField label="Kolor" type="color" value={block.color} onChange={(v) => handleChange('color', v)} onBlur={handleBlur} />
          <PropertyField label="Grubość" type="range" min={1} max={5} value={block.thickness} onChange={(v) => handleChange('thickness', v)} onBlur={handleBlur} />
          <PropertyField label="Szerokość" type="text" value={block.width} onChange={(v) => handleChange('width', v)} onBlur={handleBlur} placeholder="100% lub 200px" />
        </>
      )}

      {block.type === 'spacer' && (
        <PropertyField label="Wysokość" type="range" min={10} max={100} value={block.height} onChange={(v) => handleChange('height', v)} onBlur={handleBlur} />
      )}

      {block.type === 'columns' && (
        <>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <Edit3 size={12} />
              Lewa kolumna
            </label>
            <BlockTextEditor
              content={block.leftContent}
              onChange={(v) => handleChange('leftContent', v)}
              onBlur={handleBlur}
              placeholder="Treść lewej kolumny..."
              showHeadings={true}
              showLists={true}
              showAlignment={true}
              showColors={true}
              showVariables={true}
              minHeight={150}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <Edit3 size={12} />
              Prawa kolumna
            </label>
            <BlockTextEditor
              content={block.rightContent}
              onChange={(v) => handleChange('rightContent', v)}
              onBlur={handleBlur}
              placeholder="Treść prawej kolumny..."
              showHeadings={true}
              showLists={true}
              showAlignment={true}
              showColors={true}
              showVariables={true}
              minHeight={150}
            />
          </div>
          <PropertyField label="Odstęp między kolumnami" type="range" min={0} max={40} value={block.gap} onChange={(v) => handleChange('gap', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'header' && (
        <>
          <PropertyField label="Tytuł" type="text" value={block.title} onChange={(v) => handleChange('title', v)} onBlur={handleBlur} />
          <PropertyField label="URL logo" type="image" value={block.logoUrl} onChange={(v) => handleChange('logoUrl', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'footer' && (
        <>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <Edit3 size={12} />
              Treść stopki
            </label>
            <BlockTextEditor
              content={block.content}
              onChange={(v) => handleChange('content', v)}
              onBlur={handleBlur}
              placeholder="Treść stopki emaila..."
              showHeadings={false}
              showLists={false}
              showAlignment={true}
              showColors={true}
              showVariables={true}
              minHeight={100}
            />
          </div>
          <PropertyField label="Kolor tekstu" type="color" value={block.textColor} onChange={(v) => handleChange('textColor', v)} onBlur={handleBlur} />
        </>
      )}

      {block.type === 'social' && (
        <>
          <PropertyField label="Facebook URL" type="text" value={block.links?.facebook || ''} onChange={(v) => handleChange('links', { ...block.links, facebook: v })} onBlur={handleBlur} />
          <PropertyField label="Instagram URL" type="text" value={block.links?.instagram || ''} onChange={(v) => handleChange('links', { ...block.links, instagram: v })} onBlur={handleBlur} />
          <PropertyField label="YouTube URL" type="text" value={block.links?.youtube || ''} onChange={(v) => handleChange('links', { ...block.links, youtube: v })} onBlur={handleBlur} />
          <PropertyField label="Twitter/X URL" type="text" value={block.links?.twitter || ''} onChange={(v) => handleChange('links', { ...block.links, twitter: v })} onBlur={handleBlur} />
          <PropertyField label="Rozmiar ikon" type="range" min={24} max={48} value={block.iconSize} onChange={(v) => handleChange('iconSize', v)} onBlur={handleBlur} />
        </>
      )}
    </div>
  );
}

// Zaawansowany edytor tła z gradientami, obrazkami i opacity
function BackgroundEditor({ backgroundColor, backgroundGradient, backgroundImage, backgroundOpacity, onChange, onBlur }) {
  const [activeTab, setActiveTab] = useState(() => {
    if (backgroundGradient) return 'gradient';
    if (backgroundImage) return 'image';
    return 'color';
  });
  const [gradientType, setGradientType] = useState(backgroundGradient?.type || 'linear');
  const [gradientAngle, setGradientAngle] = useState(backgroundGradient?.angle || 135);
  const [gradientColor1, setGradientColor1] = useState(backgroundGradient?.color1 || '#ec4899');
  const [gradientColor2, setGradientColor2] = useState(backgroundGradient?.color2 || '#f97316');

  // Synchronizacja stanów z propsami
  useEffect(() => {
    if (backgroundGradient) {
      setActiveTab('gradient');
      setGradientType(backgroundGradient.type || 'linear');
      setGradientAngle(backgroundGradient.angle || 135);
      setGradientColor1(backgroundGradient.color1 || '#ec4899');
      setGradientColor2(backgroundGradient.color2 || '#f97316');
    } else if (backgroundImage) {
      setActiveTab('image');
    } else {
      setActiveTab('color');
    }
  }, [backgroundGradient, backgroundImage]);

  // Predefiniowane gradienty
  const PRESET_GRADIENTS = [
    { name: 'Różowo-pomarańczowy', color1: '#ec4899', color2: '#f97316' },
    { name: 'Niebieski', color1: '#3b82f6', color2: '#8b5cf6' },
    { name: 'Zielony', color1: '#10b981', color2: '#06b6d4' },
    { name: 'Zachód słońca', color1: '#f43f5e', color2: '#fbbf24' },
    { name: 'Nocne niebo', color1: '#1e3a5f', color2: '#312e81' },
    { name: 'Pastelowy', color1: '#fce7f3', color2: '#dbeafe' },
  ];

  const handleColorChange = (color, commit = false) => {
    onChange('backgroundColor', color);
    onChange('backgroundGradient', null);
    onChange('backgroundImage', '');
    if (commit) onBlur?.();
  };

  const handleGradientChange = (overrides = {}) => {
    const gradient = {
      type: overrides.type ?? gradientType,
      angle: overrides.angle ?? gradientAngle,
      color1: overrides.color1 ?? gradientColor1,
      color2: overrides.color2 ?? gradientColor2
    };
    onChange('backgroundGradient', gradient);
    onChange('backgroundColor', 'transparent');
    onChange('backgroundImage', '');
    onBlur?.();
  };

  const applyPresetGradient = (preset) => {
    setGradientColor1(preset.color1);
    setGradientColor2(preset.color2);
    handleGradientChange({ color1: preset.color1, color2: preset.color2 });
  };

  const handleImageUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `mailing-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('messenger-attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('messenger-attachments')
          .getPublicUrl(filePath);

        onChange('backgroundImage', urlData.publicUrl);
        onChange('backgroundGradient', null);
        onChange('backgroundColor', 'transparent');
        onBlur?.();
      } catch (err) {
        console.error('Error uploading image:', err);
        alert('Błąd podczas przesyłania obrazu');
      }
    };

    input.click();
  };

  const handleOpacityChange = (value, commit = false) => {
    onChange('backgroundOpacity', value);
    if (commit) onBlur?.();
  };

  const getGradientStyle = () => {
    if (gradientType === 'linear') {
      return `linear-gradient(${gradientAngle}deg, ${gradientColor1}, ${gradientColor2})`;
    }
    return `radial-gradient(circle, ${gradientColor1}, ${gradientColor2})`;
  };

  const getCurrentPreview = () => {
    if (activeTab === 'gradient' || backgroundGradient) {
      return getGradientStyle();
    }
    if (activeTab === 'image' && backgroundImage) {
      return `url(${backgroundImage})`;
    }
    return backgroundColor || '#ffffff';
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Palette size={12} />
        Tło bloku
      </label>

      {/* Podgląd aktualnego tła */}
      <div
        className="h-12 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden relative"
        style={{
          background: getCurrentPreview(),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: backgroundOpacity / 100
        }}
      >
        {backgroundImage && activeTab === 'image' && (
          <img src={backgroundImage} alt="bg" className="w-full h-full object-cover" style={{ opacity: backgroundOpacity / 100 }} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveTab('color')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'color'
              ? 'bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Droplet size={12} />
          Kolor
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gradient')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'gradient'
              ? 'bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Layers2 size={12} />
          Gradient
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('image')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'image'
              ? 'bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <ImagePlus size={12} />
          Obraz
        </button>
      </div>

      {/* Zawartość tabów */}
      {activeTab === 'color' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="color"
              value={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor}
              onChange={(e) => handleColorChange(e.target.value)}
              onBlur={onBlur}
              className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600"
            />
            <input
              type="text"
              value={backgroundColor}
              onChange={(e) => handleColorChange(e.target.value)}
              onBlur={onBlur}
              placeholder="transparent"
              className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() => handleColorChange('transparent', true)}
            className="w-full px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors border border-dashed border-gray-300 dark:border-gray-600"
          >
            Przezroczyste (brak tła)
          </button>
        </div>
      )}

      {activeTab === 'gradient' && (
        <div className="space-y-3">
          {/* Predefiniowane gradienty */}
          <div className="grid grid-cols-3 gap-1.5">
            {PRESET_GRADIENTS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPresetGradient(preset)}
                className="h-8 rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden hover:ring-2 hover:ring-pink-500 transition-all"
                style={{ background: `linear-gradient(135deg, ${preset.color1}, ${preset.color2})` }}
                title={preset.name}
              />
            ))}
          </div>

          {/* Typ gradientu */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setGradientType('linear'); handleGradientChange({ type: 'linear' }); }}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                gradientType === 'linear'
                  ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 border border-pink-300 dark:border-pink-700'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600'
              }`}
            >
              Liniowy
            </button>
            <button
              type="button"
              onClick={() => { setGradientType('radial'); handleGradientChange({ type: 'radial' }); }}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                gradientType === 'radial'
                  ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 border border-pink-300 dark:border-pink-700'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600'
              }`}
            >
              Radialny
            </button>
          </div>

          {/* Kolory gradientu */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 dark:text-gray-400">Kolor 1</label>
              <input
                type="color"
                value={gradientColor1}
                onChange={(e) => { setGradientColor1(e.target.value); handleGradientChange({ color1: e.target.value }); }}
                className="w-full h-8 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 dark:text-gray-400">Kolor 2</label>
              <input
                type="color"
                value={gradientColor2}
                onChange={(e) => { setGradientColor2(e.target.value); handleGradientChange({ color2: e.target.value }); }}
                className="w-full h-8 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Kąt (dla liniowego) */}
          {gradientType === 'linear' && (
            <div className="space-y-1">
              <label className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <RotateCw size={10} />
                  Kąt
                </span>
                <span>{gradientAngle}°</span>
              </label>
              <input
                type="range"
                min={0}
                max={360}
                value={gradientAngle}
                onChange={(e) => { setGradientAngle(parseInt(e.target.value)); }}
                onMouseUp={(e) => handleGradientChange({ angle: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'image' && (
        <div className="space-y-2">
          {backgroundImage ? (
            <div className="relative">
              <img
                src={backgroundImage}
                alt="Background"
                className="w-full h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
              />
              <button
                type="button"
                onClick={() => { onChange('backgroundImage', ''); onBlur?.(); }}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleImageUpload}
              className="w-full px-4 py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-pink-400 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/10 transition-all text-center"
            >
              <Upload size={20} className="mx-auto mb-2 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Kliknij aby wybrać obraz</span>
            </button>
          )}
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            ⚠️ Obrazy jako tło mogą nie wyświetlać się we wszystkich klientach email
          </p>
        </div>
      )}

      {/* Opacity (dla wszystkich typów) */}
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <label className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
          <span className="flex items-center gap-1">
            <Droplet size={10} />
            Przezroczystość
          </span>
          <span>{backgroundOpacity}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={backgroundOpacity}
          onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
          onMouseUp={onBlur}
          className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
        />
      </div>
    </div>
  );
}

// Edytor marginesów/paddingu z opcją ustawienia każdej strony osobno
function SpacingEditor({ label, icon: Icon, value, onChange, onBlur, max = 60 }) {
  const [isAdvanced, setIsAdvanced] = useState(() => {
    // Sprawdź czy wartości są różne dla każdej strony
    if (typeof value === 'object' && value !== null) {
      const { top, right, bottom, left } = value;
      return !(top === right && right === bottom && bottom === left);
    }
    return false;
  });

  // Normalizuj wartość do obiektu
  const normalizedValue = typeof value === 'object' && value !== null
    ? value
    : { top: value || 0, right: value || 0, bottom: value || 0, left: value || 0 };

  const [localValues, setLocalValues] = useState(normalizedValue);

  useEffect(() => {
    const newNormalized = typeof value === 'object' && value !== null
      ? value
      : { top: value || 0, right: value || 0, bottom: value || 0, left: value || 0 };
    setLocalValues(newNormalized);
  }, [value]);

  const handleUnifiedChange = (newValue) => {
    const unified = { top: newValue, right: newValue, bottom: newValue, left: newValue };
    setLocalValues(unified);
    onChange(unified);
  };

  const handleSideChange = (side, newValue) => {
    const updated = { ...localValues, [side]: newValue };
    setLocalValues(updated);
    onChange(updated);
  };

  const allEqual = localValues.top === localValues.right &&
                   localValues.right === localValues.bottom &&
                   localValues.bottom === localValues.left;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          {Icon && <Icon size={12} />}
          {label}
        </label>
        <button
          type="button"
          onClick={() => setIsAdvanced(!isAdvanced)}
          className={`text-[10px] px-2 py-0.5 rounded-md transition-all ${
            isAdvanced
              ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {isAdvanced ? 'Uproszczony' : 'Zaawansowany'}
        </button>
      </div>

      {!isAdvanced ? (
        // Tryb uproszczony - jeden suwak
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>0</span>
            <span className="font-medium text-gray-600 dark:text-gray-300">{allEqual ? localValues.top : '~'}px</span>
            <span>{max}</span>
          </div>
          <input
            type="range"
            min={0}
            max={max}
            value={allEqual ? localValues.top : 0}
            onChange={(e) => handleUnifiedChange(parseInt(e.target.value))}
            onMouseUp={onBlur}
            className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
        </div>
      ) : (
        // Tryb zaawansowany - 4 inputy
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: 'top', label: '↑' },
            { key: 'right', label: '→' },
            { key: 'bottom', label: '↓' },
            { key: 'left', label: '←' }
          ].map(({ key, label: sideLabel }) => (
            <div key={key} className="text-center">
              <span className="text-[9px] text-gray-400 block mb-1">{sideLabel}</span>
              <input
                type="number"
                min={0}
                max={max}
                value={localValues[key]}
                onChange={(e) => handleSideChange(key, parseInt(e.target.value) || 0)}
                onBlur={onBlur}
                className="w-full px-1.5 py-1 text-xs text-center bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-pink-500/50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Edytor obramowania (border)
function BorderEditor({ value, onChange, onBlur }) {
  const defaultBorder = {
    width: 0,
    style: 'solid',
    color: '#e5e7eb',
    sides: { top: true, right: true, bottom: true, left: true }
  };

  const border = { ...defaultBorder, ...value };
  const [isAdvanced, setIsAdvanced] = useState(false);

  const handleChange = (property, newValue) => {
    onChange({ ...border, [property]: newValue });
  };

  const handleSideToggle = (side) => {
    const newSides = { ...border.sides, [side]: !border.sides[side] };
    onChange({ ...border, sides: newSides });
  };

  const allSidesActive = border.sides.top && border.sides.right && border.sides.bottom && border.sides.left;

  return (
    <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Square size={12} />
          Obramowanie
        </label>
        <button
          type="button"
          onClick={() => setIsAdvanced(!isAdvanced)}
          className={`text-[10px] px-2 py-0.5 rounded-md transition-all ${
            isAdvanced
              ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {isAdvanced ? 'Uproszczony' : 'Zaawansowany'}
        </button>
      </div>

      {/* Grubość */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>Grubość</span>
          <span className="font-medium text-gray-600 dark:text-gray-300">{border.width}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          value={border.width}
          onChange={(e) => handleChange('width', parseInt(e.target.value))}
          onMouseUp={onBlur}
          className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
        />
      </div>

      {border.width > 0 && (
        <>
          {/* Styl */}
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400">Styl</span>
            <div className="grid grid-cols-3 gap-1">
              {[
                { value: 'solid', label: 'Ciągła' },
                { value: 'dashed', label: 'Przerywana' },
                { value: 'dotted', label: 'Kropkowana' }
              ].map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => { handleChange('style', style.value); onBlur?.(); }}
                  className={`px-2 py-1.5 text-[10px] rounded-md transition-all ${
                    border.style === style.value
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Kolor */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Kolor</span>
            <input
              type="color"
              value={border.color}
              onChange={(e) => handleChange('color', e.target.value)}
              onBlur={onBlur}
              className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600"
            />
            <input
              type="text"
              value={border.color}
              onChange={(e) => handleChange('color', e.target.value)}
              onBlur={onBlur}
              className="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md"
            />
          </div>

          {/* Tryb zaawansowany - wybór stron */}
          {isAdvanced && (
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Strony</span>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { key: 'top', label: '↑ Góra' },
                  { key: 'right', label: '→ Prawa' },
                  { key: 'bottom', label: '↓ Dół' },
                  { key: 'left', label: '← Lewa' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { handleSideToggle(key); onBlur?.(); }}
                    className={`px-1.5 py-1 text-[9px] rounded-md transition-all ${
                      border.sides[key]
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Edytor cienia (box-shadow)
function ShadowEditor({ value, onChange, onBlur }) {
  const defaultShadow = {
    enabled: false,
    offsetX: 0,
    offsetY: 4,
    blur: 12,
    spread: 0,
    color: '#00000033',
    inset: false,
    direction: 'all' // 'all', 'bottom', 'top', 'left', 'right', 'horizontal', 'vertical'
  };

  const shadow = { ...defaultShadow, ...value };
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = (property, newValue) => {
    onChange({ ...shadow, [property]: newValue });
  };

  const presets = [
    { name: 'Brak', shadow: { enabled: false } },
    { name: 'Lekki', shadow: { enabled: true, offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: '#00000020', direction: 'all' } },
    { name: 'Średni', shadow: { enabled: true, offsetX: 0, offsetY: 4, blur: 12, spread: 0, color: '#00000030', direction: 'all' } },
    { name: 'Mocny', shadow: { enabled: true, offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: '#00000040', direction: 'all' } },
    { name: 'Uniesiony', shadow: { enabled: true, offsetX: 0, offsetY: 12, blur: 32, spread: -4, color: '#00000025', direction: 'all' } }
  ];

  const directionOptions = [
    { value: 'all', label: 'Wszystkie', icon: '◻' },
    { value: 'bottom', label: 'Dół', icon: '⬇' },
    { value: 'top', label: 'Góra', icon: '⬆' },
    { value: 'left', label: 'Lewo', icon: '⬅' },
    { value: 'right', label: 'Prawo', icon: '➡' },
    { value: 'horizontal', label: 'Boki', icon: '↔' },
    { value: 'vertical', label: 'Góra/dół', icon: '↕' }
  ];

  return (
    <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Layers size={12} />
        Cień
      </label>

      {/* Presety */}
      <div className="grid grid-cols-5 gap-1">
        {presets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => { onChange({ ...shadow, ...preset.shadow }); onBlur?.(); }}
            className={`px-1.5 py-1.5 text-[9px] rounded-md transition-all ${
              !shadow.enabled && !preset.shadow.enabled
                ? 'bg-pink-500 text-white'
                : shadow.enabled && preset.shadow.enabled &&
                  shadow.offsetY === preset.shadow.offsetY &&
                  shadow.blur === preset.shadow.blur
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {shadow.enabled && (
        <>
          {/* Kierunek cienia */}
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400">Kierunek cienia</span>
            <div className="grid grid-cols-4 gap-1">
              {directionOptions.slice(0, 4).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { handleChange('direction', opt.value); onBlur?.(); }}
                  className={`px-1.5 py-1.5 text-[9px] rounded-md transition-all flex flex-col items-center gap-0.5 ${
                    shadow.direction === opt.value
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {directionOptions.slice(4).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { handleChange('direction', opt.value); onBlur?.(); }}
                  className={`px-1.5 py-1.5 text-[9px] rounded-md transition-all flex flex-col items-center gap-0.5 ${
                    shadow.direction === opt.value
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Przycisk zaawansowane */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`w-full text-[10px] px-2 py-1 rounded-md transition-all ${
              showAdvanced
                ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {showAdvanced ? '▼ Ukryj zaawansowane' : '▶ Pokaż zaawansowane'}
          </button>

          {showAdvanced && (
            <>
              {/* Przesunięcie X */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Przesunięcie X</span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">{shadow.offsetX}px</span>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={shadow.offsetX}
                  onChange={(e) => handleChange('offsetX', parseInt(e.target.value))}
                  onMouseUp={onBlur}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* Przesunięcie Y */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Przesunięcie Y</span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">{shadow.offsetY}px</span>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={shadow.offsetY}
                  onChange={(e) => handleChange('offsetY', parseInt(e.target.value))}
                  onMouseUp={onBlur}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>
            </>
          )}

          {/* Rozmycie */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span>Rozmycie</span>
              <span className="font-medium text-gray-600 dark:text-gray-300">{shadow.blur}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={shadow.blur}
              onChange={(e) => handleChange('blur', parseInt(e.target.value))}
              onMouseUp={onBlur}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          {/* Rozszerzenie */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span>Rozszerzenie</span>
              <span className="font-medium text-gray-600 dark:text-gray-300">{shadow.spread}px</span>
            </div>
            <input
              type="range"
              min={-10}
              max={20}
              value={shadow.spread}
              onChange={(e) => handleChange('spread', parseInt(e.target.value))}
              onMouseUp={onBlur}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          {/* Kolor */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Kolor</span>
            <input
              type="color"
              value={shadow.color.substring(0, 7)}
              onChange={(e) => handleChange('color', e.target.value + '40')}
              onBlur={onBlur}
              className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600"
            />
            <input
              type="text"
              value={shadow.color}
              onChange={(e) => handleChange('color', e.target.value)}
              onBlur={onBlur}
              placeholder="#00000040"
              className="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md"
            />
          </div>

          {/* Inset */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={shadow.inset}
              onChange={(e) => { handleChange('inset', e.target.checked); onBlur?.(); }}
              className="w-4 h-4 rounded text-pink-500 focus:ring-pink-500 border-gray-300 dark:border-gray-600"
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Cień wewnętrzny (inset)</span>
          </label>
        </>
      )}
    </div>
  );
}

// Pole właściwości
function PropertyField({ label, type, value, onChange, onBlur, min, max, step, options, placeholder }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleImageUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `mailing-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('messenger-attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('messenger-attachments')
          .getPublicUrl(filePath);

        onChange(urlData.publicUrl);
        onBlur?.();
      } catch (err) {
        console.error('Error uploading image:', err);
        alert('Błąd podczas przesyłania obrazu');
      }
    };

    input.click();
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>

      {type === 'text' && (
        <input
          type="text"
          value={localValue || ''}
          onChange={(e) => { setLocalValue(e.target.value); onChange(e.target.value); }}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
        />
      )}

      {type === 'textarea' && (
        <textarea
          value={localValue || ''}
          onChange={(e) => { setLocalValue(e.target.value); onChange(e.target.value); }}
          onBlur={onBlur}
          rows={4}
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-mono transition-all"
        />
      )}

      {type === 'color' && (
        <div className="flex gap-2">
          <input
            type="color"
            value={localValue || '#ffffff'}
            onChange={(e) => { setLocalValue(e.target.value); onChange(e.target.value); }}
            onBlur={onBlur}
            className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600"
          />
          <input
            type="text"
            value={localValue || ''}
            onChange={(e) => { setLocalValue(e.target.value); onChange(e.target.value); }}
            onBlur={onBlur}
            className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-mono"
          />
        </div>
      )}

      {type === 'range' && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={step || 1}
            value={localValue || min}
            onChange={(e) => {
              const val = step ? parseFloat(e.target.value) : parseInt(e.target.value);
              setLocalValue(val);
              onChange(val);
            }}
            onMouseUp={onBlur}
            onTouchEnd={onBlur}
            className="flex-1 accent-pink-500"
          />
          <span className="text-sm text-gray-500 w-10 text-right font-mono">
            {typeof localValue === 'number' ? (step ? localValue.toFixed(1) : localValue) : min}
          </span>
        </div>
      )}

      {type === 'alignment' && (
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {['left', 'center', 'right'].map((align) => (
            <button
              key={align}
              onClick={() => { onChange(align); onBlur?.(); }}
              className={`flex-1 p-2 rounded-lg transition-all ${localValue === align ? 'bg-white dark:bg-gray-600 shadow text-pink-500' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {align === 'left' && <AlignLeft size={16} className="mx-auto" />}
              {align === 'center' && <AlignCenter size={16} className="mx-auto" />}
              {align === 'right' && <AlignRight size={16} className="mx-auto" />}
            </button>
          ))}
        </div>
      )}

      {type === 'select' && (
        <select
          value={localValue || ''}
          onChange={(e) => { setLocalValue(e.target.value); onChange(e.target.value); onBlur?.(); }}
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50"
        >
          {options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {type === 'checkbox' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={localValue || false}
            onChange={(e) => { setLocalValue(e.target.checked); onChange(e.target.checked); onBlur?.(); }}
            className="w-4 h-4 accent-pink-500 rounded"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Włączone</span>
        </label>
      )}

      {type === 'image' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={localValue || ''}
              onChange={(e) => { setLocalValue(e.target.value); onChange(e.target.value); }}
              onBlur={onBlur}
              placeholder="https://... lub prześlij"
              className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
            <button
              onClick={handleImageUpload}
              className="px-3 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
              title="Prześlij obraz"
            >
              <Upload size={16} />
            </button>
          </div>
          {localValue && (
            <img src={localValue} alt="Preview" className="w-full h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600" />
          )}
        </div>
      )}

      {type === 'list' && (
        <div className="space-y-2">
          {(localValue || []).map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => {
                  const newItems = [...(localValue || [])];
                  newItems[index] = e.target.value;
                  setLocalValue(newItems);
                  onChange(newItems);
                }}
                onBlur={onBlur}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50"
              />
              <button
                onClick={() => {
                  const newItems = (localValue || []).filter((_, i) => i !== index);
                  setLocalValue(newItems);
                  onChange(newItems);
                  onBlur?.();
                }}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newItems = [...(localValue || []), 'Nowy element'];
              setLocalValue(newItems);
              onChange(newItems);
            }}
            className="w-full py-2 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg flex items-center justify-center gap-1"
          >
            <Plus size={14} />
            Dodaj element
          </button>
        </div>
      )}
    </div>
  );
}

// Funkcja pomocnicza do konwersji spacing na CSS (dla HTML)
function spacingToCssString(value, property) {
  if (!value) return '';
  if (typeof value === 'object' && value !== null) {
    return `${property}: ${value.top || 0}px ${value.right || 0}px ${value.bottom || 0}px ${value.left || 0}px;`;
  }
  return `${property}: ${value}px;`;
}

// Konwersja bloku na HTML
function blockToHtml(block) {
  const alignStyle = block.alignment ? `text-align: ${block.alignment};` : '';
  const paddingStyle = spacingToCssString(block.padding, 'padding');
  const marginStyle = spacingToCssString(block.margin, 'margin');
  const borderRadiusStyle = block.borderRadius ? `border-radius: ${block.borderRadius}px;` : '';

  // Budowanie stylu tła z obsługą gradientów, obrazków i opacity
  let bgStyle = '';
  const opacity = (block.backgroundOpacity ?? 100) / 100;

  if (block.backgroundGradient) {
    const { type, angle, color1, color2 } = block.backgroundGradient;
    if (type === 'linear') {
      bgStyle = `background: linear-gradient(${angle}deg, ${color1}, ${color2});`;
    } else {
      bgStyle = `background: radial-gradient(circle, ${color1}, ${color2});`;
    }
  } else if (block.backgroundImage) {
    bgStyle = `background-image: url(${block.backgroundImage}); background-size: cover; background-position: center;`;
  } else if (block.backgroundColor && block.backgroundColor !== 'transparent') {
    bgStyle = `background-color: ${block.backgroundColor};`;
  }

  // Dodaj opacity jeśli różne od 100%
  const opacityStyle = opacity < 1 ? `opacity: ${opacity};` : '';

  // Obramowanie (border)
  let borderStyle = '';
  if (block.border && block.border.width > 0) {
    const { width, color, sides } = block.border;
    const bStyle = block.border.style || 'solid';
    if (sides && (!sides.top || !sides.right || !sides.bottom || !sides.left)) {
      // Różne strony
      if (sides.top) borderStyle += `border-top: ${width}px ${bStyle} ${color};`;
      if (sides.right) borderStyle += `border-right: ${width}px ${bStyle} ${color};`;
      if (sides.bottom) borderStyle += `border-bottom: ${width}px ${bStyle} ${color};`;
      if (sides.left) borderStyle += `border-left: ${width}px ${bStyle} ${color};`;
    } else {
      borderStyle = `border: ${width}px ${bStyle} ${color};`;
    }
  }

  // Cień (box-shadow)
  let boxShadowStyle = '';
  if (block.boxShadow && block.boxShadow.enabled) {
    const { offsetX = 0, offsetY = 4, blur = 12, spread = 0, color = '#00000033', inset, direction = 'all' } = block.boxShadow;
    const insetStr = inset ? 'inset ' : '';
    const absOffsetX = Math.abs(offsetX || 4);
    const absOffsetY = Math.abs(offsetY || 4);

    let shadowValue;
    switch (direction) {
      case 'bottom':
        shadowValue = `${insetStr}0px ${absOffsetY}px ${blur}px ${spread}px ${color}`;
        break;
      case 'top':
        shadowValue = `${insetStr}0px -${absOffsetY}px ${blur}px ${spread}px ${color}`;
        break;
      case 'left':
        shadowValue = `${insetStr}-${absOffsetX}px 0px ${blur}px ${spread}px ${color}`;
        break;
      case 'right':
        shadowValue = `${insetStr}${absOffsetX}px 0px ${blur}px ${spread}px ${color}`;
        break;
      case 'horizontal':
        const hBlur = Math.max(4, blur / 2);
        shadowValue = `${insetStr}${absOffsetX}px 0px ${hBlur}px 0px ${color}, ${insetStr}-${absOffsetX}px 0px ${hBlur}px 0px ${color}`;
        break;
      case 'vertical':
        const vBlur = Math.max(4, blur / 2);
        shadowValue = `${insetStr}0px ${absOffsetY}px ${vBlur}px 0px ${color}, ${insetStr}0px -${absOffsetY}px ${vBlur}px 0px ${color}`;
        break;
      default:
        shadowValue = `${insetStr}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`;
    }
    boxShadowStyle = `box-shadow: ${shadowValue};`;
  }

  switch (block.type) {
    case 'text':
      return `<div style="${alignStyle} ${paddingStyle} ${marginStyle} ${bgStyle} ${borderRadiusStyle} ${borderStyle} ${boxShadowStyle} ${opacityStyle} font-size: ${block.fontSize || 16}px; line-height: ${block.lineHeight || 1.6}; color: ${block.textColor || '#333333'};">${block.content || ''}</div>`;

    case 'heading':
      const headingSizes = { 1: 32, 2: 24, 3: 20 };
      const headingTag = `h${block.level || 2}`;
      return `<${headingTag} style="${alignStyle} ${paddingStyle} ${marginStyle} ${bgStyle} ${borderRadiusStyle} ${borderStyle} ${boxShadowStyle} ${opacityStyle} font-size: ${headingSizes[block.level] || 24}px; color: ${block.textColor || '#1f2937'};">${block.content || ''}</${headingTag}>`;

    case 'image':
      const imgStyle = `max-width: 100%; width: ${block.width || '100%'}; height: auto; display: block; margin: 0 auto; ${block.borderRadius ? `border-radius: ${block.borderRadius}px;` : ''} ${boxShadowStyle}`;
      const imgHtml = `<img src="${block.src || 'https://placehold.co/600x300/f3f4f6/9ca3af?text=Obraz'}" alt="${block.alt || ''}" style="${imgStyle}" />`;
      if (block.linkUrl) {
        return `<div style="${alignStyle} ${paddingStyle}"><a href="${block.linkUrl}" target="_blank">${imgHtml}</a></div>`;
      }
      return `<div style="${alignStyle} ${paddingStyle}">${imgHtml}</div>`;

    case 'button':
      const btnWidth = block.fullWidth ? 'display: block; width: 100%;' : 'display: inline-block;';
      return `<div style="${alignStyle} ${paddingStyle}"><a href="${block.linkUrl || '#'}" style="${btnWidth} padding: 12px 24px; background-color: ${block.backgroundColor || '#ec4899'}; color: ${block.textColor || '#ffffff'}; text-decoration: none; border-radius: ${block.borderRadius || 8}px; font-weight: 600; font-size: ${block.fontSize || 16}px; ${boxShadowStyle}">${block.text || 'Kliknij'}</a></div>`;

    case 'quote':
      return `<blockquote style="${paddingStyle} ${marginStyle} ${borderRadiusStyle} ${borderStyle} ${boxShadowStyle} border-left: 4px solid ${block.borderColor || '#ec4899'}; ${bgStyle} ${opacityStyle} color: ${block.textColor || '#831843'}; font-style: italic;">
        <p style="margin: 0;">${block.content || ''}</p>
        ${block.author ? `<footer style="margin-top: 8px; font-style: normal; font-size: 14px; opacity: 0.8;">— ${block.author}</footer>` : ''}
      </blockquote>`;

    case 'list':
      const listItems = (block.items || []).map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('');
      const listTag = block.listStyle === 'decimal' ? 'ol' : 'ul';
      const listStyleType = block.listStyle === 'none' ? 'none' : block.listStyle;
      return `<${listTag} style="${paddingStyle} ${marginStyle} ${borderRadiusStyle} ${borderStyle} ${boxShadowStyle} ${bgStyle} color: ${block.textColor || '#333333'}; padding-left: ${block.listStyle === 'none' ? '0' : '24px'}; list-style-type: ${listStyleType};">${listItems}</${listTag}>`;

    case 'video':
      const thumbSrc = block.thumbnailUrl || 'https://placehold.co/600x340/1f2937/ffffff?text=Video';
      return `<div style="${alignStyle} ${paddingStyle}">
        <a href="${block.videoUrl || '#'}" target="_blank" style="display: block; position: relative;">
          <img src="${thumbSrc}" alt="Video thumbnail" style="width: 100%; height: auto; display: block; border-radius: 8px;" />
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; background-color: ${block.playButtonColor || '#ec4899'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; border-left: 20px solid white; margin-left: 4px;"></div>
          </div>
        </a>
      </div>`;

    case 'divider':
      return `<div style="${paddingStyle}"><hr style="border: none; border-top: ${block.thickness || 1}px ${block.style || 'solid'} ${block.color || '#e5e7eb'}; width: ${block.width || '100%'}; margin: 0 auto;" /></div>`;

    case 'spacer':
      return `<div style="height: ${block.height || 30}px;"></div>`;

    case 'columns':
      return `<div style="${paddingStyle}">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td width="48%" valign="top" style="padding-right: ${(block.gap || 20) / 2}px;">${block.leftContent || ''}</td>
            <td width="48%" valign="top" style="padding-left: ${(block.gap || 20) / 2}px;">${block.rightContent || ''}</td>
          </tr>
        </table>
      </div>`;

    case 'header':
      return `<div style="${alignStyle} ${paddingStyle} ${bgStyle} ${opacityStyle}">
        ${block.logoUrl ? `<img src="${block.logoUrl}" alt="Logo" style="max-height: 60px; margin-bottom: 10px;" />` : ''}
        <h1 style="margin: 0; font-size: 24px; color: #333333;">${block.title || '{{kosciol}}'}</h1>
      </div>`;

    case 'footer':
      return `<div style="${alignStyle} ${paddingStyle} ${bgStyle} ${opacityStyle} font-size: 12px; color: ${block.textColor || '#6b7280'};">${block.content || ''}</div>`;

    case 'social':
      const socialIcons = [];
      if (block.links?.facebook) {
        socialIcons.push(`<a href="${block.links.facebook}" target="_blank" style="display: inline-block; margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" width="${block.iconSize || 32}" height="${block.iconSize || 32}" alt="Facebook" /></a>`);
      }
      if (block.links?.instagram) {
        socialIcons.push(`<a href="${block.links.instagram}" target="_blank" style="display: inline-block; margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" width="${block.iconSize || 32}" height="${block.iconSize || 32}" alt="Instagram" /></a>`);
      }
      if (block.links?.youtube) {
        socialIcons.push(`<a href="${block.links.youtube}" target="_blank" style="display: inline-block; margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/174/174883.png" width="${block.iconSize || 32}" height="${block.iconSize || 32}" alt="YouTube" /></a>`);
      }
      if (block.links?.twitter) {
        socialIcons.push(`<a href="${block.links.twitter}" target="_blank" style="display: inline-block; margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/733/733579.png" width="${block.iconSize || 32}" height="${block.iconSize || 32}" alt="Twitter/X" /></a>`);
      }
      return socialIcons.length > 0
        ? `<div style="${alignStyle} ${paddingStyle}">${socialIcons.join('')}</div>`
        : `<div style="${alignStyle} ${paddingStyle} color: #9ca3af; font-size: 14px;">Dodaj linki do mediów społecznościowych</div>`;

    default:
      return `<div style="${paddingStyle}">[Nieznany blok: ${block.type}]</div>`;
  }
}

// Konwersja wszystkich bloków na pełny HTML
function blocksToHtml(blocks, settings = DEFAULT_EMAIL_SETTINGS) {
  if (!blocks || blocks.length === 0) return '';

  const bodyContent = blocks.map(block => blockToHtml(block)).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    td { padding: 0; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${settings.backgroundColor}; font-family: ${settings.fontFamily};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="${settings.maxWidth}" cellspacing="0" cellpadding="0" border="0" style="max-width: ${settings.maxWidth}px; width: 100%; background-color: ${settings.contentBackgroundColor};">
          <tr>
            <td>
              ${bodyContent}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Parsowanie HTML na bloki (uproszczone)
function parseHtmlToBlocks(html) {
  if (!html || html.trim() === '') return [];
  return [];
}
