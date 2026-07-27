import React from 'react';
import * as LucideIcons from 'lucide-react';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { tr } from '../../../i18n';
import { styleToCSS } from '../../Settings/components/ModuleBuilder/styleToCSS';
import ModuleWidget from './ModuleWidget';
import CollectionView from './CollectionView';

const GAP_PX = { sm: 8, md: 16, lg: 24, xl: 32 };
const SPACER_PX = { sm: 8, md: 24, lg: 48, xl: 80 };
const ALERT_STYLES = {
  info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  success: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
};

// Runtime kreatora graficznego — interpretuje drzewo `layout` na zakładce typu 'custom'.
export default function LayoutRenderer({ layout, moduleId, moduleKey, moduleName, tabId, device }) {
  const { can, subject } = usePermissions();
  const root = layout?.root || [];

  if (!root.length) {
    return (
      <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
        <LucideIcons.LayoutDashboard size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">{tr('Ta zakładka jest pusta. Otwórz kreator, aby dodać elementy.')}</p>
      </div>
    );
  }

  const ctx = { moduleId, moduleKey, moduleName, tabId, can, role: subject?.role, isAdmin: subject?.isAdmin, device: device || 'desktop' };
  return <div className="space-y-4">{root.map((el) => <ElementRenderer key={el.id} el={el} ctx={ctx} />)}</div>;
}

function ElementRenderer({ el, ctx }) {
  // Widoczność per rola (parytet z RBAC — superadmin/admin widzą wszystko).
  // Permisywnie dopóki rola się nie załaduje (ctx.role puste) — jak can() przed 'ready'.
  if (el.visibleForRoles?.length && ctx.role && !ctx.isAdmin && !el.visibleForRoles.includes(ctx.role)) return null;
  // Ukrycie na mobile (podgląd mobilny w kreatorze).
  if (ctx.device === 'mobile' && el.responsive?.hiddenMobile) return null;

  const inner = renderInner(el, ctx);
  if (inner == null) return null;
  const css = styleToCSS(el.style);
  const cls = el.responsive?.hiddenMobile ? 'hidden md:block' : undefined;
  if (Object.keys(css).length || cls) return <div style={css} className={cls}>{inner}</div>;
  return inner;
}

function renderInner(el, ctx) {
  const p = el.props || {};
  const kids = (el.children || []).map((c) => <ElementRenderer key={c.id} el={c} ctx={ctx} />);

  switch (el.type) {
    case 'section':
      return <div className="space-y-4">{kids}</div>;

    case 'columns':
    case 'grid': {
      const cols = ctx.device === 'mobile' ? 1 : (p.columns || 2);
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP_PX[p.gap] ?? 16 }}>
          {kids}
        </div>
      );
    }

    case 'card':
      return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          {p.title ? <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{p.title}</h3> : null}
          <div className="space-y-4">{kids}</div>
        </div>
      );

    case 'divider':
      return <hr className="border-gray-200 dark:border-gray-700" style={{ borderTopStyle: p.lineStyle || 'solid' }} />;

    case 'spacer':
      return <div style={{ height: SPACER_PX[p.size] ?? 24 }} />;

    case 'heading': {
      const Tag = `h${Math.min(Math.max(p.level || 2, 1), 6)}`;
      const sizes = { 1: 'text-3xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg', 5: 'text-base', 6: 'text-sm' };
      return (
        <Tag className={`font-bold text-gray-900 dark:text-white ${sizes[p.level] || 'text-2xl'}`} style={{ textAlign: p.align || 'left' }}>
          {p.text}
        </Tag>
      );
    }

    case 'text':
      return <div className="prose max-w-none text-gray-700 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: p.html || '' }} />;

    case 'image':
      return p.src
        ? <img src={p.src} alt={p.alt || ''} className={`max-w-full h-auto ${p.rounded && p.rounded !== 'none' ? `rounded-${p.rounded}` : ''}`} />
        : <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Brak obrazu')}</div>;

    case 'button': {
      const variants = {
        primary: 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg',
        secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
        outline: 'border border-accent-primary text-accent-primary hover:bg-accent-primary-lightest',
      };
      return (
        <div style={{ textAlign: p.align || 'left' }}>
          <a href={p.href || '#'} target={p.href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition ${variants[p.variant] || variants.primary}`}>
            {p.label}
          </a>
        </div>
      );
    }

    case 'list': {
      const Tag = p.style === 'decimal' ? 'ol' : 'ul';
      const cls = p.style === 'decimal' ? 'list-decimal' : p.style === 'none' ? 'list-none' : 'list-disc';
      return (
        <Tag className={`${cls} pl-6 space-y-1 text-gray-700 dark:text-gray-300`}>
          {(p.items || []).filter((it) => String(it).trim() !== '').map((it, i) => <li key={i}>{it}</li>)}
        </Tag>
      );
    }

    case 'quote':
      return (
        <blockquote className="border-l-4 border-accent-primary pl-4 italic text-gray-600 dark:text-gray-300">
          {p.text}
          {p.author ? <footer className="mt-1 text-sm not-italic text-gray-400">— {p.author}</footer> : null}
        </blockquote>
      );

    case 'alert':
      return <div className={`p-4 rounded-xl border text-sm ${ALERT_STYLES[p.variant] || ALERT_STYLES.info}`}>{p.text}</div>;

    case 'icon': {
      const Ico = LucideIcons[p.name] || LucideIcons.Star;
      return <Ico size={p.size || 32} className="text-accent-primary dark:text-accent-primary-light" />;
    }

    case 'widget':
      return <ModuleWidget widgetType={p.widgetType} moduleKey={ctx.moduleKey} moduleName={ctx.moduleName} />;

    case 'collection':
      return <CollectionView element={el} ctx={ctx} />;

    default:
      return null;
  }
}
