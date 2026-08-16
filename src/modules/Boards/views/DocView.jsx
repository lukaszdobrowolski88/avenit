import React, { useRef, useState, useEffect } from 'react';
import { FileText, Check } from 'lucide-react';
import SimpleRichEditor from '../../../components/SimpleRichEditor';

// Widok Dokument (WorkDoc) — rich text zapisywany w konfiguracji widoku (config.html).
export default function DocView({ config, onUpdateConfig }) {
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);

  const handleChange = (html) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { onUpdateConfig({ html }); setSaved(true); setTimeout(() => setSaved(false), 1500); }, 800);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3 text-sm text-gray-400">
        <FileText size={15} /> Dokument tablicy {saved && <span className="flex items-center gap-1 text-green-500"><Check size={13} /> zapisano</span>}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <SimpleRichEditor content={config.html || ''} onChange={handleChange} placeholder="Pisz notatki, dokumentację, ustalenia zespołu…" minHeight={400} />
      </div>
    </div>
  );
}
