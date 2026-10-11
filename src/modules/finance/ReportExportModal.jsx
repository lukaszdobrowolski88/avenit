import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { tr } from '../../i18n';
import { REPORT_SECTIONS, SECTION_GROUPS, defaultSections, loadExportPrefs, saveExportPrefs } from './reportSections';

const FORMATS = [
  { key: 'pdf', label: 'PDF', hint: 'Plik PDF do zapisania lub wysłania.' },
  { key: 'print', label: 'Drukuj', hint: 'Okno drukowania — można też wybrać „Zapisz jako PDF”.' },
  { key: 'xlsx', label: 'Excel', hint: 'Arkusze z danymi; wykresy zastępują tabele z liczbami.' },
  { key: 'csv', label: 'CSV', hint: 'Prosty plik tekstowy z liczbami.' },
];

// Przełącznik segmentowy (ten sam wzór co Miesiąc/Kwartał/Rok w Raportach) — przyciski bez
// obramowania, żeby warstwa marki nie zamieniała ich w pigułki.
function Segmented({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${value === o.key ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          {tr(o.label)}
        </button>
      ))}
    </div>
  );
}

const linkCls = 'text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline-offset-2 hover:underline';

/**
 * Okno „Pobierz / drukuj raport”: format, orientacja strony i które części raportu trafią
 * do pliku. Niezależne od sekcji widocznych na ekranie (te zostają bez zmian).
 */
export default function ReportExportModal({ isOpen, onClose, viewSections, rangeLabel, busy, onGenerate }) {
  const [prefs, setPrefs] = useState(() => loadExportPrefs(viewSections));
  // Przy każdym otwarciu — ostatnio użyte ustawienia (nowe sekcje dziedziczą widok).
  useEffect(() => { if (isOpen) setPrefs(loadExportPrefs(viewSections)); /* eslint-disable-next-line */ }, [isOpen]);

  const setSec = (key, on) => setPrefs((p) => ({ ...p, sections: { ...p.sections, [key]: on } }));
  const setAll = (sections) => setPrefs((p) => ({ ...p, sections }));
  const allAs = (on) => Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, on]));
  const chosen = REPORT_SECTIONS.filter((x) => prefs.sections[x.key] !== false).length;
  const visual = prefs.format === 'pdf' || prefs.format === 'print';
  const hint = FORMATS.find((f) => f.key === prefs.format)?.hint;

  const submit = () => {
    if (chosen === 0) return;
    saveExportPrefs(prefs);
    onGenerate(prefs);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!busy) onClose(); }} title={tr('Pobierz / drukuj raport')} subtitle={`${tr('Zakres')}: ${rangeLabel}`} icon={Download} size="lg"
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>{tr('Anuluj')}</Button>
        <Button onClick={submit} loading={busy} disabled={chosen === 0}>
          {prefs.format === 'print' ? tr('Drukuj') : tr('Pobierz')}
        </Button>
      </>}>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-[auto_auto] sm:justify-start gap-x-10 gap-y-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{tr('Format')}</div>
            <Segmented label={tr('Format')} value={prefs.format} options={FORMATS} onChange={(format) => setPrefs((p) => ({ ...p, format }))} />
          </div>
          {visual && (
            <div>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{tr('Orientacja strony')}</div>
              <Segmented label={tr('Orientacja strony')} value={prefs.orientation}
                options={[{ key: 'p', label: 'Pionowa' }, { key: 'l', label: 'Pozioma' }]}
                onChange={(orientation) => setPrefs((p) => ({ ...p, orientation }))} />
            </div>
          )}
          {hint && <p className="sm:col-span-2 -mt-1 text-xs text-gray-500 dark:text-gray-400">{tr(hint)}</p>}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {tr('Zawartość raportu')} <span className="font-normal text-gray-500 dark:text-gray-400 tabular-nums">· {chosen}/{REPORT_SECTIONS.length}</span>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setAll(allAs(true))} className={linkCls}>{tr('Wszystko')}</button>
              <button type="button" onClick={() => setAll(allAs(false))} className={linkCls}>{tr('Nic')}</button>
              <button type="button" onClick={() => setAll({ ...viewSections })} className={linkCls}>{tr('Jak na ekranie')}</button>
              <button type="button" onClick={() => setAll(defaultSections())} className={linkCls}>{tr('Domyślne')}</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
            {SECTION_GROUPS.map((g) => (
              <fieldset key={g}>
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">{tr(g)}</legend>
                {REPORT_SECTIONS.filter((x) => x.group === g).map((x) => (
                  <label key={x.key} className="flex items-center gap-2.5 py-1 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                    <input type="checkbox" checked={prefs.sections[x.key] !== false} onChange={(e) => setSec(x.key, e.target.checked)}
                      className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" />
                    {tr(x.label)}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {chosen === 0 && <p className="text-xs text-red-700 dark:text-red-400 mt-3">{tr('Wybierz co najmniej jedną sekcję raportu.')}</p>}
        </div>
      </div>
    </Modal>
  );
}
