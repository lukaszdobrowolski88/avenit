import React, { useEffect, useState } from 'react';
import { FileText, Printer, FileSpreadsheet, FileDown, Download, Calendar } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { tr } from '../../i18n';
import { REPORT_SECTIONS, SECTION_GROUPS, defaultSections, loadExportPrefs, saveExportPrefs } from './reportSections';

const FORMATS = [
  { key: 'pdf', label: 'PDF', hint: 'Plik do zapisania lub wysłania', icon: FileDown },
  { key: 'print', label: 'Drukuj', hint: 'Okno drukowania (także „Zapisz jako PDF”)', icon: Printer },
  { key: 'xlsx', label: 'Excel', hint: 'Arkusze z danymi (.xlsx)', icon: FileSpreadsheet },
  { key: 'csv', label: 'CSV', hint: 'Prosty plik tekstowy', icon: FileText },
];

/**
 * Okno „Pobierz / drukuj raport”: format, orientacja strony i które części raportu trafią
 * do pliku. Niezależne od sekcji widocznych na ekranie (te zostają bez zmian).
 */
export default function ReportExportModal({ isOpen, onClose, viewSections, rangeLabel, exclusionLabel, busy, onGenerate }) {
  const [prefs, setPrefs] = useState(() => loadExportPrefs(viewSections));
  // Przy każdym otwarciu — ostatnio użyte ustawienia (nowe sekcje dziedziczą widok).
  useEffect(() => { if (isOpen) setPrefs(loadExportPrefs(viewSections)); /* eslint-disable-next-line */ }, [isOpen]);

  const setSec = (key, on) => setPrefs((p) => ({ ...p, sections: { ...p.sections, [key]: on } }));
  const setAll = (sections) => setPrefs((p) => ({ ...p, sections }));
  const chosen = REPORT_SECTIONS.filter((x) => prefs.sections[x.key] !== false).length;
  const visual = prefs.format === 'pdf' || prefs.format === 'print';

  const submit = () => {
    if (chosen === 0) return;
    saveExportPrefs(prefs);
    onGenerate(prefs);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!busy) onClose(); }} title={tr('Pobierz / drukuj raport')} icon={Download} size="lg"
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>{tr('Anuluj')}</Button>
        <Button onClick={submit} loading={busy} disabled={chosen === 0}>
          {prefs.format === 'print' ? tr('Drukuj') : tr('Pobierz')} ({chosen})
        </Button>
      </>}>
      <div className="p-6 space-y-5">
        <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
          <div className="flex items-center gap-2"><Calendar size={15} /> {tr('Zakres')}: <span className="font-semibold text-gray-900 dark:text-white">{rangeLabel}</span></div>
          {exclusionLabel && <div className="text-xs">{tr('Wyłączone z raportu')}: {exclusionLabel}</div>}
          <div className="text-xs text-gray-500 dark:text-gray-400">{tr('Zakres i wykluczenia zmienisz nad raportem.')}</div>
        </div>

        {/* Format */}
        <div>
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">{tr('Format')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FORMATS.map(({ key, label, hint, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setPrefs((p) => ({ ...p, format: key }))} aria-pressed={prefs.format === key}
                className={`text-left p-3 rounded-xl border transition ${prefs.format === key ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                <div className="flex items-center gap-2 font-semibold text-sm text-gray-900 dark:text-white"><Icon size={16} /> {tr(label)}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{tr(hint)}</div>
              </button>
            ))}
          </div>
        </div>

        {visual && (
          <div>
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">{tr('Orientacja strony')}</div>
            <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
              {[['p', 'Pionowa'], ['l', 'Pozioma']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setPrefs((p) => ({ ...p, orientation: k }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${prefs.orientation === k ? 'bg-white dark:bg-gray-900 shadow text-accent-primary' : 'text-gray-500 dark:text-gray-400'}`}>{tr(l)}</button>
              ))}
            </div>
          </div>
        )}

        {/* Sekcje */}
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{tr('Co ma się znaleźć w raporcie')}</span>
            <button type="button" onClick={() => setAll(Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, true])))} className="text-xs text-accent-primary hover:underline">{tr('Zaznacz wszystko')}</button>
            <button type="button" onClick={() => setAll(Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, false])))} className="text-xs text-gray-500 hover:underline">{tr('Odznacz wszystko')}</button>
            <button type="button" onClick={() => setAll({ ...viewSections })} className="text-xs text-gray-500 hover:underline">{tr('Jak na ekranie')}</button>
            <button type="button" onClick={() => setAll(defaultSections())} className="text-xs text-gray-500 hover:underline">{tr('Domyślne')}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {SECTION_GROUPS.map((g) => (
              <div key={g}>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">{tr(g)}</div>
                {REPORT_SECTIONS.filter((x) => x.group === g).map((x) => (
                  <label key={x.key} className="flex items-center gap-2 py-1 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                    <input type="checkbox" checked={prefs.sections[x.key] !== false} onChange={(e) => setSec(x.key, e.target.checked)}
                      className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" />
                    {tr(x.label)}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {chosen === 0 && <p className="text-xs text-red-700 dark:text-red-400 mt-2">{tr('Wybierz co najmniej jedną sekcję raportu.')}</p>}
          {!visual && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{tr('Wykresy w pliku Excel/CSV zastępują tabele z liczbami.')}</p>}
        </div>
      </div>
    </Modal>
  );
}
