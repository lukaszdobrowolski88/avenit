import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

// Wspólne prymitywy panelu (marka Avenit). Style w styles.css — tu tylko struktura.

const cx = (...a) => a.filter(Boolean).join(' ');

// ── Przyciski ────────────────────────────────────────────────────────
// variant: primary (kurkuma) | secondary (miękkie tło) | ghost | danger
export function Button({ variant = 'secondary', size, icon, iconRight, loading, block, className, children, type = 'button', ...rest }) {
  const iconOnly = !children && icon;
  return (
    <button
      type={type}
      className={cx('btn', variant !== 'secondary' && `btn--${variant}`, size === 'sm' && 'btn--sm', iconOnly && 'btn--icon', block && 'btn--block', className)}
      {...rest}
      disabled={rest.disabled || loading}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 16} />}
    </button>
  );
}

// ── Pigułki statusów ─────────────────────────────────────────────────
// tone: success | warning | danger | info | neutral | accent
export function Badge({ tone = 'neutral', size, dot = true, title, className, children }) {
  return (
    <span className={cx('badge', tone !== 'neutral' && `badge--${tone}`, size === 'sm' && 'badge--sm', !dot && 'badge--nodot', className)} title={title}>
      {children}
    </span>
  );
}

const STATUS_MAP = {
  // tenant
  trial: ['info', 'Trial'], active: ['success', 'Aktywny'], suspended: ['danger', 'Zawieszony'], cancelled: ['neutral', 'Anulowany'],
  provisioning: ['info', 'Zakładanie'], deleted: ['neutral', 'Usunięty'],
  // subskrypcja
  trialing: ['info', 'Trial'], past_due: ['warning', 'Zaległa płatność'],
  // faktura
  paid: ['success', 'Opłacona'], pending: ['warning', 'Oczekuje'], overdue: ['danger', 'Po terminie'], draft: ['neutral', 'Szkic'],
  // zgłoszenia
  new: ['info', 'Nowe'], contacted: ['warning', 'W kontakcie'], converted: ['success', 'Pozyskane'], rejected: ['neutral', 'Odrzucone'],
};
const INVOICE_CANCELLED = ['neutral', 'Anulowana'];

// Status tenanta / faktury / zgłoszenia jako pigułka z polską etykietą.
export function StatusBadge({ status, kind, size }) {
  if (!status) return null;
  const [tone, label] = kind === 'invoice' && status === 'cancelled' ? INVOICE_CANCELLED : STATUS_MAP[status] || ['neutral', status];
  return <Badge tone={tone} size={size}>{label}</Badge>;
}

// ── Karty / nagłówki ─────────────────────────────────────────────────
export function Card({ title, subtitle, actions, flush, className, children, ...rest }) {
  return (
    <section className={cx('card', flush && 'card--flush', className)} {...rest}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: '18px 20px 0' } : undefined}>
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="row row--wrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back, badge }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <div className="titles">
        {back && (
          <button className="back-link" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
            <Icon name="chevronLeft" size={16} /> Wróć
          </button>
        )}
        <h1 className="page-title">{title}{badge}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function SectionHead({ title, subtitle, actions }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <div className="card-sub">{subtitle}</div>}
      </div>
      {actions && <div className="row row--wrap">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone, small, icon }) {
  return (
    <div className={cx('stat', tone === 'warn' && 'stat--warn', tone === 'accent' && 'stat--accent')}>
      <div className="stat-label">{icon}{label}</div>
      <div className={cx('stat-value', small && 'stat-value--sm')}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

// ── Tabela ───────────────────────────────────────────────────────────
export function Table({ children, flush, tall, minWidth, className }) {
  return (
    <div className={cx('table-wrap', flush && 'table-wrap--flush', tall && 'table-wrap--tall', className)}>
      <table className="table" style={minWidth ? { minWidth } : undefined}>{children}</table>
    </div>
  );
}

// Klikalny wiersz: osiągalny Tabem, Enter/Spacja otwiera (gdy fokus jest na samym wierszu).
export function TR({ onClick, className, children, ...rest }) {
  const onKeyDown = onClick ? (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
  } : undefined;
  return (
    <tr className={cx(onClick && 'is-clickable', className)} onClick={onClick} onKeyDown={onKeyDown} tabIndex={onClick ? 0 : undefined} {...rest}>
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, children }) {
  return <tr><td className="empty" colSpan={colSpan}>{children}</td></tr>;
}

// Zatrzymuje kliknięcie w komórce z akcjami, żeby nie otwierało wiersza.
export const stop = (e) => e.stopPropagation();

// ── Stany ────────────────────────────────────────────────────────────
export function EmptyState({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="es-icon"><Icon name={icon} size={20} /></div>
      {title && <div className="es-title">{title}</div>}
      {children && <div className="es-body">{children}</div>}
      {action && <div className="es-action">{action}</div>}
    </div>
  );
}

const NOTICE_ICON = { success: 'check', danger: 'alert', warning: 'alert', info: 'sparkle', accent: 'sparkle', neutral: 'sparkle' };
export function Notice({ tone = 'neutral', children, action, icon }) {
  return (
    <div className={cx('notice', `notice--${tone}`)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon || NOTICE_ICON[tone]} size={16} />
      <div className="notice-body">{children}</div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

export function Loading({ children = 'Ładowanie…' }) {
  return <div className="loading"><span className="spinner" aria-hidden="true" />{children}</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return <Notice tone="danger" action={onRetry && <Button size="sm" onClick={onRetry} icon="refresh">Spróbuj ponownie</Button>}>{error}</Notice>;
}

// Krótki komunikat w rogu ekranu. useToast() → [node, show(text, tone)]
export function useToast() {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (text, tone = 'ok') => {
    clearTimeout(timer.current);
    setT({ text, tone });
    timer.current = setTimeout(() => setT(null), tone === 'error' ? 5000 : 2600);
  };
  const node = t ? (
    <div className={cx('toast', t.tone === 'error' && 'toast--error')} role="status">
      <Icon name={t.tone === 'error' ? 'alert' : 'check'} size={16} />{t.text}
    </div>
  ) : null;
  return [node, show];
}

// ── Modal ────────────────────────────────────────────────────────────
export function Modal({ title, children, footer, onClose, wide }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    const first = ref.current?.querySelector('input:not([type="checkbox"]), select, textarea');
    (first || ref.current)?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={cx('modal', wide && 'modal--wide')} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 className="modal-title" id={titleId}>{title}</h2>
          <Button variant="ghost" icon="x" onClick={onClose} aria-label="Zamknij" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── Formularze ───────────────────────────────────────────────────────
export function Field({ label, hint, children, className }) {
  const id = useId();
  const child = React.isValidElement(children) && !children.props.id ? React.cloneElement(children, { id }) : children;
  return (
    <div className={cx('field', className)}>
      {label && <label className="field-label" htmlFor={React.isValidElement(children) ? (children.props.id || id) : undefined}>{label}</label>}
      {child}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Input(props) { return <input {...props} />; }
export function Select({ children, ...props }) { return <select {...props}>{children}</select>; }
export function Textarea(props) { return <textarea rows={4} {...props} />; }

// Pole z jednostką po prawej (zł, %, dni).
export function AffixInput({ affix, ...props }) {
  return (
    <div className="input-affix">
      <input {...props} />
      <span className="affix">{affix}</span>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Szukaj…', className, ...rest }) {
  return (
    <div className={cx('input-search', className)}>
      <Icon name="search" size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} {...rest} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, title }) {
  const sw = (
    <button
      type="button" role="switch" aria-checked={!!checked} className="switch" disabled={disabled} title={title}
      aria-label={typeof label === 'string' ? label : title}
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }}
    />
  );
  if (!label) return sw;
  return (
    <label className="toggle-row" onClick={(e) => { if (e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!disabled) onChange?.(!checked); } }}>
      {sw}<span>{label}</span>
    </label>
  );
}

export function Checkbox({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

// Przełącznik segmentowy: items = [{ value, label, count? }]
export function Segmented({ items, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" aria-pressed={value === it.value} onClick={() => onChange(it.value)}>
          {it.label}{it.count != null && <span className="count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Pasek użycia dorosłych vs limit planu ────────────────────────────
export const USAGE_STATE = {
  ok: ['success', 'W limicie'],
  near: ['warning', 'Blisko limitu'],
  over: ['warning', 'Ponad limit (bufor)'],
  over_buffer: ['danger', 'Ponad bufor'],
  unlimited: ['neutral', 'Bez limitu'],
};
export function UsageBadge({ state, size }) {
  const [tone, label] = USAGE_STATE[state] || ['neutral', state || '—'];
  return <Badge tone={tone} size={size}>{label}</Badge>;
}

export function UsageBar({ usage, mini, showBadge = true }) {
  if (!usage) return null;
  const { adults, limit, bufferLimit, state } = usage;
  const unlimited = state === 'unlimited' || limit == null || limit < 0;
  const scaleMax = unlimited ? Math.max(adults || 1, 1) : Math.max(bufferLimit || limit, adults || 0, 1);
  const pct = unlimited ? 100 : Math.min(100, ((adults || 0) / scaleMax) * 100);
  const limitAt = unlimited ? null : (limit / scaleMax) * 100;
  return (
    <div className={cx('usage', `usage--${state || 'ok'}`, mini && 'usage--mini')}>
      <div className="usage-top">
        <span className="tnum"><b>{adults ?? '—'}</b> {unlimited ? 'dorosłych' : <>z {limit} dorosłych</>}</span>
        {showBadge && <UsageBadge state={state} size={mini ? 'sm' : undefined} />}
      </div>
      <div className="usage-track" role="meter" aria-valuemin={0} aria-valuemax={unlimited ? adults : limit} aria-valuenow={adults}
        aria-label={unlimited ? `${adults} dorosłych` : `${adults} z ${limit} dorosłych`}>
        <div className="usage-fill" style={{ width: `${pct}%` }} />
        {limitAt != null && limitAt < 100 && <span className="usage-mark" style={{ left: `calc(${limitAt}% - 1px)` }} title={`Limit planu: ${limit}`} />}
      </div>
    </div>
  );
}
