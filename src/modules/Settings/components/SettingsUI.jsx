import React from 'react';

// Reużywalne prymitywy UI dla ustawień — spójny wygląd wszystkich sekcji.

export const SettingsCard = ({ title, description, icon: Icon, children, action }) => (
  <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-2xl p-6 mb-5">
    {(title || action) && (
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="w-9 h-9 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light shrink-0">
              <Icon size={18} />
            </div>
          )}
          <div>
            {title && <h3 className="font-bold text-gray-800 dark:text-white">{title}</h3>}
            {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {action}
      </div>
    )}
    {children}
  </div>
);

// Wiersz ustawienia: etykieta + opis po lewej, kontrolka po prawej.
export const SettingRow = ({ label, hint, children, last }) => (
  <div className={`flex items-center justify-between gap-4 py-3.5 ${last ? '' : 'border-b border-gray-100 dark:border-gray-600/50'}`}>
    <div className="min-w-0">
      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</div>
      {hint && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// Przełącznik on/off.
export const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-gray-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    aria-pressed={checked}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

// Select ustawienia.
export const SelectSetting = ({ value, onChange, options, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white outline-none focus:border-accent-primary min-w-[160px] ${className}`}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

// Pole tekstowe/liczbowe zapisywane na blur.
export const TextSetting = ({ value, onSave, type = 'text', placeholder, width = 'w-48', suffix }) => {
  const [v, setV] = React.useState(value ?? '');
  React.useEffect(() => setV(value ?? ''), [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type={type}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (value ?? '') && onSave(v)}
        className={`bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white outline-none focus:border-accent-primary ${width}`}
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  );
};

// Pasek postępu (użycia limitu).
export const UsageBar = ({ used, max, label }) => {
  const unlimited = max === -1 || max == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const danger = !unlimited && pct >= 90;
  return (
    <div className="py-2">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-600 dark:text-gray-300">{label}</span>
        <span className={`font-medium ${danger ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {used}{unlimited ? '' : ` / ${max}`}{unlimited && <span className="text-gray-400"> (bez limitu)</span>}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-600 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${danger ? 'bg-red-500' : 'bg-accent-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};
