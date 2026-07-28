import React from 'react';
import * as LucideIcons from 'lucide-react';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { tr } from '../../../i18n';
import { styleToCSS, hoverClass } from '../../Settings/components/ModuleBuilder/styleToCSS';
import ModuleWidget from './ModuleWidget';
import CollectionView from './CollectionView';
import { useModuleRecords } from '../../../hooks/useModuleRecords';

const CHART_COLORS = ['#c7ab71', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316', '#06b6d4'];

// KPI — liczba wpisów w kolekcji.
function StatWidget({ el, ctx }) {
  const { records } = useModuleRecords({ moduleId: ctx.moduleId, moduleKey: ctx.moduleKey, tabId: ctx.tabId, collectionKey: el.props?.collectionKey });
  return (
    <div className="p-6 rounded-2xl bg-gradient-to-br from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 text-center">
      <div className="text-4xl font-bold bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">{records.length}</div>
      <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{el.props?.label || tr('Liczba wpisów')}</div>
    </div>
  );
}

function BarList({ data, max }) {
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-2">
          <div className="w-28 shrink-0 truncate text-xs text-gray-600 dark:text-gray-300 text-right">{d.label}</div>
          <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden">
            <div className="h-full rounded-md" style={{ width: `${max ? (d.value / max) * 100 : 0}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
          </div>
          <div className="w-8 shrink-0 text-xs font-medium text-gray-700 dark:text-gray-200">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

function PieSvg({ data, total }) {
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width="150" height="150" viewBox="0 0 150 150" className="shrink-0">
        <g transform="translate(75,75) rotate(-90)">
          {data.map((d, i) => {
            const dash = (d.value / total) * C; const off = acc; acc += dash;
            return <circle key={d.label} r={R} cx="0" cy="0" fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="26" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} />;
          })}
        </g>
      </svg>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            {d.label}: {d.value} ({Math.round((d.value / total) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

// Wykres — zliczanie wpisów kolekcji wg wybranego pola.
function ChartWidget({ el, ctx }) {
  const p = el.props || {};
  const { records } = useModuleRecords({ moduleId: ctx.moduleId, moduleKey: ctx.moduleKey, tabId: ctx.tabId, collectionKey: p.collectionKey });
  const counts = React.useMemo(() => {
    const m = new Map();
    for (const r of records) {
      const v = r.data?.[p.field];
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) { const key = (x == null || x === '') ? '—' : String(x); m.set(key, (m.get(key) || 0) + 1); }
    }
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [records, p.field]);
  if (!p.collectionKey || !p.field) return <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Wybierz kolekcję i pole do wykresu')}</div>;
  if (!counts.length) return <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Brak danych')}</div>;
  const total = counts.reduce((s, c) => s + c.value, 0);
  return (
    <div>
      {p.title && <div className="text-sm font-semibold text-gray-800 dark:text-white mb-3">{p.title}</div>}
      {p.chartType === 'pie' ? <PieSvg data={counts} total={total} /> : <BarList data={counts} max={counts[0].value} />}
    </div>
  );
}

const GAP_PX = { sm: 8, md: 16, lg: 24, xl: 32 };
const SPACER_PX = { sm: 8, md: 24, lg: 48, xl: 80 };
const ALERT_STYLES = {
  info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  success: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
};

// Zwraca URL osadzenia dla YouTube/Vimeo (albo null → traktuj jak plik wideo).
function videoEmbedSrc(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

// Licznik odliczający (live, aktualizacja co sekundę).
function Countdown({ target, label }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = target ? new Date(target).getTime() : NaN;
  if (!target || isNaN(t)) return <div className="text-sm text-gray-400 text-center">{tr('Ustaw datę w kreatorze')}</div>;
  let diff = Math.max(0, t - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  const Box = ({ v, l }) => (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[64px]">
      <span className="text-2xl font-bold text-gray-900 dark:text-white">{String(v).padStart(2, '0')}</span>
      <span className="text-[11px] uppercase text-gray-400">{l}</span>
    </div>
  );
  return (
    <div className="text-center">
      {label && <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">{label}</div>}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Box v={d} l={tr('dni')} /><Box v={h} l={tr('godz')} /><Box v={m} l={tr('min')} /><Box v={s} l={tr('sek')} />
      </div>
    </div>
  );
}

// Kontener „Zakładki" — interaktywny w runtime (każde dziecko = panel).
function TabsRuntime({ el, ctx }) {
  const [active, setActive] = React.useState(0);
  const children = el.children || [];
  const labels = el.props?.labels || [];
  if (!children.length) return null;
  const idx = Math.min(active, children.length - 1);
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-3 overflow-x-auto">
        {children.map((c, i) => (
          <button key={c.id} onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${i === idx ? 'border-accent-primary text-accent-primary' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {labels[i] || `${tr('Zakładka')} ${i + 1}`}
          </button>
        ))}
      </div>
      <ElementRenderer el={children[idx]} ctx={ctx} />
    </div>
  );
}

// Kontener „Akordeon" — rozwijane panele.
function AccordionRuntime({ el, ctx }) {
  const [open, setOpen] = React.useState(0);
  const children = el.children || [];
  const labels = el.props?.labels || [];
  return (
    <div className="space-y-2">
      {children.map((c, i) => (
        <div key={c.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button onClick={() => setOpen(open === i ? -1 : i)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left font-medium text-gray-800 dark:text-white">
            {labels[i] || `${tr('Sekcja')} ${i + 1}`}
            <LucideIcons.ChevronDown size={16} className={`transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && <div className="p-4"><ElementRenderer el={c} ctx={ctx} /></div>}
        </div>
      ))}
    </div>
  );
}

// Runtime kreatora graficznego — interpretuje drzewo `layout` na zakładce typu 'custom'.
export default function LayoutRenderer({ layout, moduleId, moduleKey, moduleName, tabId, device, publicMode }) {
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

  const ctx = { moduleId, moduleKey, moduleName, tabId, can, role: subject?.role, isAdmin: subject?.isAdmin, device: device || 'desktop', public: !!publicMode };
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
  const cls = [el.responsive?.hiddenMobile ? 'hidden md:block' : '', hoverClass(el.style)].filter(Boolean).join(' ');
  if (Object.keys(css).length || cls) return <div style={css} className={cls || undefined}>{inner}</div>;
  return inner;
}

function renderInner(el, ctx) {
  const p = el.props || {};
  const kids = (el.children || []).map((c) => <ElementRenderer key={c.id} el={c} ctx={ctx} />);

  // Na stronie publicznej dane wymagające logowania nie są renderowane.
  if (ctx.public && ['widget', 'collection', 'stat', 'chart'].includes(el.type)) {
    return <div className="p-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-center text-sm text-gray-400">{tr('Ta zawartość jest dostępna po zalogowaniu.')}</div>;
  }

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

    case 'video': {
      const src = videoEmbedSrc(p.url);
      if (src) return (
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe src={src} title="video" className="absolute inset-0 w-full h-full rounded-xl"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      );
      if (p.url) return <video src={p.url} controls className="w-full rounded-xl" />;
      return <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Wklej link do wideo (YouTube/Vimeo/mp4)')}</div>;
    }

    case 'map':
      return p.query
        ? <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingTop: '56.25%' }}>
            <iframe title="map" loading="lazy" className="absolute inset-0 w-full h-full border-0"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(p.query)}&output=embed`} />
          </div>
        : <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Podaj adres lub miejsce')}</div>;

    case 'embed':
      return p.url
        ? <iframe title="embed" src={p.url} className="w-full rounded-xl border border-gray-200 dark:border-gray-700" style={{ height: p.height || 400 }} />
        : <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Podaj adres URL do osadzenia')}</div>;

    case 'countdown':
      return <Countdown target={p.target} label={p.label} />;

    case 'gallery': {
      const imgs = (p.images || []).filter(Boolean);
      if (!imgs.length) return <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-400">{tr('Dodaj adresy zdjęć')}</div>;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ctx.device === 'mobile' ? 2 : (p.columns || 3)}, minmax(0,1fr))`, gap: 8 }}>
          {imgs.map((src, i) => <img key={i} src={src} alt="" className="w-full object-cover rounded-lg aspect-square" />)}
        </div>
      );
    }

    case 'tabs':
      return <TabsRuntime el={el} ctx={ctx} />;

    case 'accordion':
      return <AccordionRuntime el={el} ctx={ctx} />;

    case 'verse':
      return (
        <figure className="border-l-4 border-accent-primary bg-accent-primary-lightest/30 dark:bg-accent-primary-darkest/10 rounded-r-xl px-5 py-4">
          <blockquote className="text-lg italic text-gray-800 dark:text-gray-100">„{p.text}"</blockquote>
          {p.reference && <figcaption className="mt-2 text-sm font-semibold text-accent-primary">{p.reference}</figcaption>}
        </figure>
      );

    case 'giving':
      return (
        <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30">
          {p.note && <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{p.note}</p>}
          <a href={p.url || '#'} target={p.url?.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg transition">
            <LucideIcons.Heart size={18} /> {p.label || tr('Wesprzyj nas')}
          </a>
        </div>
      );

    case 'songlist':
      return (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {p.title && <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-800 dark:text-white flex items-center gap-2"><LucideIcons.Music size={16} className="text-accent-primary" />{p.title}</div>}
          <ol className="divide-y divide-gray-100 dark:divide-gray-800">
            {(p.songs || []).filter(Boolean).map((s, i) => <li key={i} className="px-4 py-2.5 text-gray-700 dark:text-gray-200 flex gap-3"><span className="text-gray-400 w-5">{i + 1}.</span>{s}</li>)}
          </ol>
        </div>
      );

    case 'widget':
      return <ModuleWidget widgetType={p.widgetType} moduleKey={ctx.moduleKey} moduleName={ctx.moduleName} />;

    case 'collection':
      return <CollectionView element={el} ctx={ctx} />;

    case 'stat':
      return <StatWidget el={el} ctx={ctx} />;

    case 'chart':
      return <ChartWidget el={el} ctx={ctx} />;

    default:
      return null;
  }
}
