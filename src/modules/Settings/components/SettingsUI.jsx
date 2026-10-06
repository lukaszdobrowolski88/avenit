import React from 'react';
import CustomSelect from '../../../components/CustomSelect';
import { tr } from '../../../i18n';

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

// Przełącznik on/off. Stan włączony ma nie tylko kolor (kurkuma), ale też ptaszek w gałce
// i ciemniejszy obrys — odróżnialny od wyłączonego także przy słabym kontraście (UXD-22).
// `label` = nazwa dla czytnika ekranu, gdy obok nie ma powiązanej etykiety.
export const Toggle = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`relative inline-flex shrink-0 w-11 h-6 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-primary ${checked ? 'bg-accent-primary border-accent-primary-dark/60' : 'bg-gray-300 dark:bg-gray-600 border-gray-400/70 dark:border-gray-500'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow flex items-center justify-center transition-transform ${checked ? 'translate-x-5' : ''}`}>
      {checked && (
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" className="text-gray-800">
          <path d="M2.5 6.2 5 8.6 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  </button>
);

// Select ustawienia — wspólny CustomSelect (ta sama lista co w modułach). Wartości jako tekst,
// jak w natywnym <select>, który był tu wcześniej (wywołujący zapisują stringi).
export const SelectSetting = ({ value, onChange, options, className = '' }) => (
  <div className={`min-w-[200px] ${className}`}>
    <CustomSelect
      value={String(value ?? '')}
      onChange={(v) => onChange(String(v))}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
    />
  </div>
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
          {used}{unlimited ? '' : ` / ${max}`}{unlimited && <span className="text-gray-400"> ({tr('bez limitu')})</span>}
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
