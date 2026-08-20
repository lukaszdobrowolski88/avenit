import React, { useState, useEffect } from 'react';
import Spinner from '../../../components/Spinner';
import { useParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import LayoutRenderer from '../components/LayoutRenderer';
import { tr } from '../../../i18n';

// Publiczna (bez logowania) mikrostrona z zakładki kreatora. Pobiera opublikowany
// układ z /api/public/module-page/:slug (tenant rozpoznany po hoście) i renderuje
// go w trybie content-only (dane wymagające logowania są ukryte).
export default function PublicModulePage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/module-page/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (alive) { setData(d); setState('ok'); } })
      .catch((err) => { if (alive) setState(err === 404 ? 'notfound' : 'error'); });
    return () => { alive = false; };
  }, [slug]);

  if (state === 'loading') {
    return <div className="min-h-screen grid place-items-center bg-gray-50 dark:bg-gray-950"><Spinner size={40} /></div>;
  }
  if (state !== 'ok') {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6 bg-gray-50 dark:bg-gray-950">
        <div>
          <LucideIcons.AlertCircle size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">{state === 'notfound' ? tr('Strona nie znaleziona lub nieopublikowana.') : tr('Wystąpił błąd. Spróbuj ponownie.')}</p>
        </div>
      </div>
    );
  }

  const Icon = LucideIcons[data.moduleIcon] || LucideIcons.LayoutDashboard;
  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-primary-lightest/40 to-accent-secondary-lightest/40 dark:from-gray-900 dark:to-gray-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Icon size={32} className="text-accent-primary dark:text-accent-primary-light" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{data.tabLabel || data.moduleLabel}</h1>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <LayoutRenderer layout={data.layout} publicMode moduleName={data.moduleLabel} />
        </div>
        <div className="text-center mt-6 text-xs text-gray-400 dark:text-gray-600">Avenit</div>
      </div>
    </div>
  );
}
