import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading2, Quote, Undo, Redo
} from 'lucide-react';
import { tr } from '../i18n';

function ToolbarButton({ onClick, isActive, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition ${
        isActive
          ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

// readOnly (opcjonalne) — sam podgląd treści: bez paska narzędzi i bez edycji.
export default function SimpleRichEditor({ content, onChange, placeholder = 'Wpisz tekst...', minHeight = 200, readOnly = false }) {
  // Ostatnie HTML-e wysłane przez onChange (z czasem). Gdy rodzic w ciągu kilkunastu sekund odsyła
  // któryś z nich jako `content` (echo zapisu, często spóźnione względem pisania), NIE nadpisujemy
  // edytora — inaczej tekst wpisany w międzyczasie znikał, a kursor skakał na koniec. Starsze
  // wartości traktujemy jak zmianę z zewnątrz (np. inny rekord w tym samym edytorze).
  const emitted = useRef([]);
  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      emitted.current = [...emitted.current.slice(-49), { html, at: Date.now() }];
      onChange?.(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3',
        style: `min-height: ${minHeight}px`
      }
    }
  });

  useEffect(() => {
    if (!editor) return;
    const next = content || '';
    const echo = emitted.current.some((e) => e.html === next && Date.now() - e.at < 15000);
    if (next === editor.getHTML() || echo) return;
    emitted.current = [];
    editor.commands.setContent(next, false);
  }, [content, editor]);

  useEffect(() => { if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly); }, [editor, readOnly]);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
      {/* Toolbar */}
      {!readOnly && (
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex-wrap">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Pogrubienie">
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Kursywa">
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title={tr('Podkreślenie')}>
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title={tr('Przekreślenie')}>
          <Strikethrough size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title={tr('Nagłówek')}>
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title={tr('Lista')}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Lista numerowana">
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Cytat">
          <Quote size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Cofnij">
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title={tr('Ponów')}>
          <Redo size={15} />
        </ToolbarButton>
      </div>
      )}

      {/* Editor */}
      <div className="simple-rich-editor">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .simple-rich-editor .ProseMirror {
          outline: none;
        }
        .simple-rich-editor .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .simple-rich-editor .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .simple-rich-editor .ProseMirror li {
          margin: 0.2em 0;
        }
        .simple-rich-editor .ProseMirror h2 {
          font-size: 1.25em;
          font-weight: 700;
          margin: 0.75em 0 0.25em;
        }
        .simple-rich-editor .ProseMirror h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0.5em 0 0.25em;
        }
        .simple-rich-editor .ProseMirror blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 1em;
          margin: 0.5em 0;
          color: #6b7280;
          font-style: italic;
        }
        .dark .simple-rich-editor .ProseMirror blockquote {
          border-left-color: #4b5563;
          color: #9ca3af;
        }
        .simple-rich-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
}
