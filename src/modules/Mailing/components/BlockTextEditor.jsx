import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon, Unlink,
  Heading1, Heading2, Heading3, Quote, Minus, Undo, Redo,
  Type, Palette, Sparkles
} from 'lucide-react';
import { EMAIL_VARIABLES } from '../utils/emailVariables';

export default function BlockTextEditor({
  content,
  onChange,
  onBlur,
  placeholder = 'Wpisz tekst...',
  showHeadings = true,
  showLists = true,
  showAlignment = true,
  showColors = true,
  showVariables = true,
  minHeight = 150
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: showHeadings ? { levels: [1, 2, 3] } : false,
        bulletList: showLists,
        orderedList: showLists,
        blockquote: true,
        horizontalRule: true
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-pink-600 underline'
        }
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph']
      }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder
      })
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onBlur: () => {
      onBlur?.();
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
        style: `min-height: ${minHeight}px`
      }
    }
  });

  // Synchronizuj content z zewnątrz
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL linku:', previousUrl || 'https://');

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const insertVariable = useCallback((variable) => {
    if (!editor) return;
    editor.chain().focus().insertContent(variable).run();
  }, [editor]);

  if (!editor) return null;

  const COLORS = [
    { name: 'Domyślny', value: null },
    { name: 'Czarny', value: '#000000' },
    { name: 'Szary', value: '#6b7280' },
    { name: 'Czerwony', value: '#dc2626' },
    { name: 'Pomarańczowy', value: '#ea580c' },
    { name: 'Różowy', value: '#db2777' },
    { name: 'Fioletowy', value: '#9333ea' },
    { name: 'Niebieski', value: '#2563eb' },
    { name: 'Zielony', value: '#16a34a' }
  ];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
      {/* Toolbar */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50 p-2">
        {/* Row 1 - Basic formatting */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-gray-200 dark:border-gray-700">
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Cofnij"
            >
              <Undo size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Ponów"
            >
              <Redo size={15} />
            </ToolbarButton>
          </div>

          {/* Text formatting */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-200 dark:border-gray-700">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Pogrubienie (Ctrl+B)"
            >
              <Bold size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Kursywa (Ctrl+I)"
            >
              <Italic size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive('underline')}
              title="Podkreślenie (Ctrl+U)"
            >
              <UnderlineIcon size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              title="Przekreślenie"
            >
              <Strikethrough size={15} />
            </ToolbarButton>
          </div>

          {/* Headings */}
          {showHeadings && (
            <div className="flex items-center gap-0.5 px-2 border-r border-gray-200 dark:border-gray-700">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                isActive={editor.isActive('heading', { level: 1 })}
                title="Nagłówek 1"
              >
                <Heading1 size={15} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                isActive={editor.isActive('heading', { level: 2 })}
                title="Nagłówek 2"
              >
                <Heading2 size={15} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                isActive={editor.isActive('heading', { level: 3 })}
                title="Nagłówek 3"
              >
                <Heading3 size={15} />
              </ToolbarButton>
            </div>
          )}

          {/* Alignment */}
          {showAlignment && (
            <div className="flex items-center gap-0.5 px-2 border-r border-gray-200 dark:border-gray-700">
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                isActive={editor.isActive({ textAlign: 'left' })}
                title="Wyrównaj do lewej"
              >
                <AlignLeft size={15} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                isActive={editor.isActive({ textAlign: 'center' })}
                title="Wyśrodkuj"
              >
                <AlignCenter size={15} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                isActive={editor.isActive({ textAlign: 'right' })}
                title="Wyrównaj do prawej"
              >
                <AlignRight size={15} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                isActive={editor.isActive({ textAlign: 'justify' })}
                title="Wyjustuj"
              >
                <AlignJustify size={15} />
              </ToolbarButton>
            </div>
          )}

          {/* Lists */}
          {showLists && (
            <div className="flex items-center gap-0.5 px-2 border-r border-gray-200 dark:border-gray-700">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
                title="Lista punktowana"
              >
                <List size={15} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
                title="Lista numerowana"
              >
                <ListOrdered size={15} />
              </ToolbarButton>
            </div>
          )}

          {/* Block elements */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-200 dark:border-gray-700">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Cytat"
            >
              <Quote size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Linia pozioma"
            >
              <Minus size={15} />
            </ToolbarButton>
          </div>

          {/* Link */}
          <div className="flex items-center gap-0.5 px-2">
            <ToolbarButton
              onClick={setLink}
              isActive={editor.isActive('link')}
              title="Dodaj link"
            >
              <LinkIcon size={15} />
            </ToolbarButton>
            {editor.isActive('link') && (
              <ToolbarButton
                onClick={() => editor.chain().focus().unsetLink().run()}
                title="Usuń link"
              >
                <Unlink size={15} />
              </ToolbarButton>
            )}
          </div>
        </div>

        {/* Row 2 - Colors */}
        {showColors && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Palette size={12} />
              Kolor:
            </span>
            <div className="flex flex-wrap items-center gap-0.5">
              {COLORS.map((color) => (
                <button
                  key={color.value || 'default'}
                  onClick={() => {
                    if (color.value) {
                      editor.chain().focus().setColor(color.value).run();
                    } else {
                      editor.chain().focus().unsetColor().run();
                    }
                  }}
                  className={`w-5 h-5 rounded-md border transition-all hover:scale-110 ${
                    (color.value && editor.isActive('textStyle', { color: color.value })) ||
                    (!color.value && !editor.getAttributes('textStyle').color)
                      ? 'ring-2 ring-pink-500 ring-offset-1'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  style={{ backgroundColor: color.value || '#ffffff' }}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Row 3 - Variables (separate row) */}
        {showVariables && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Sparkles size={12} />
              Zmienne:
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {EMAIL_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  className="px-1.5 py-0.5 text-[10px] font-medium bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/30 dark:to-orange-900/30 text-pink-600 dark:text-pink-400 rounded hover:from-pink-100 hover:to-orange-100 dark:hover:from-pink-900/50 dark:hover:to-orange-900/50 transition-all border border-pink-200/50 dark:border-pink-700/30"
                  title={v.description}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="p-4">
        <EditorContent editor={editor} />
      </div>

      {/* Styles for TipTap */}
      <style>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror p {
          margin: 0.5em 0;
        }
        .ProseMirror h1 {
          font-size: 1.75em;
          font-weight: bold;
          margin: 0.5em 0;
        }
        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin: 0.5em 0;
        }
        .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: bold;
          margin: 0.5em 0;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .ProseMirror li {
          margin: 0.25em 0;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #ec4899;
          padding-left: 1em;
          margin: 0.5em 0;
          color: #6b7280;
          font-style: italic;
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 1em 0;
        }
        .ProseMirror a {
          color: #ec4899;
          text-decoration: underline;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function ToolbarButton({ onClick, isActive, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-all ${
        isActive
          ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-sm'
          : disabled
            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
