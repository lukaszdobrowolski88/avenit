import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cloud, Link2, Unlink, Check, AlertCircle } from 'lucide-react';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import CloudProviderIcon from '../../../components/cloud/CloudProviderIcon';
import { PICK_PROVIDERS, pickerLabel, connectLabel, filesCallbackMessage } from '../../../components/cloud/cloudFilesLogic';
import { resetCloudStatusCache } from '../../../components/cloud/useCloudFiles';
import { invokeCloud, startCloudConnect, onCloudConnected, openBlankWindow } from '../../../lib/cloudFiles';

// Mój profil → Pliki z Dysku Google / OneDrive (Faza 3): stan WŁASNEGO połączenia, łączenie i odłączanie.
// Pliki dodaje się jako odnośniki (bez kopiowania) w Komunikatorze, materiałach wydarzeń i Plikach.
// Tokeny nie trafiają do przeglądarki poza krótko ważnym tokenem dla okna wyboru (fn cloud-files).

function Pill({ s }) {
  if (!s.connected) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{tr('Niepołączone')}</span>;
  if (s.status && s.status !== 'active') {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"><AlertCircle size={12} aria-hidden="true" />{tr('Zgoda cofnięta — połącz ponownie')}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
      <Check size={12} aria-hidden="true" />{s.account_email ? tr('Połączone jako {who}', { who: s.account_email }) : tr('Połączone')}
    </span>
  );
}

export default function CloudFilesCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    try { setStatus((await invokeCloud({ action: 'status' })).providers || {}); } catch { setStatus({}); }
    resetCloudStatusCache();
  }, []);
  useEffect(() => { load(); return onCloudConnected(() => load()); }, [load]);

  // Powrót z ekranu zgody w tej karcie (bez okna): ?files=google&files_result=connected|error&files_reason=…
  useEffect(() => {
    const p = searchParams.get('files');
    const result = searchParams.get('files_result');
    if (!p || !result) return;
    const m = filesCallbackMessage(p, result, searchParams.get('files_reason'));
    if (m.ok) toast.success(m.text); else toast.error(m.text);
    const next = new URLSearchParams(searchParams);
    ['files', 'files_result', 'files_reason'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const visible = status ? PICK_PROVIDERS.filter((p) => status[p] && status[p].enabled !== false && (status[p].available || status[p].connected)) : [];
  if (status && !visible.length) return null; // kościół nie używa plików z chmury

  const connect = async (provider) => {
    const win = openBlankWindow('avenit-cloud-connect', { width: 520, height: 700 });
    setBusy(provider);
    try { await startCloudConnect(provider, win); } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };
  const disconnect = async (provider) => {
    if (!(await confirmDialog(tr('Odłączyć {name}? Dodane wcześniej odnośniki zostają; nowych plików nie wybierzesz, dopóki nie połączysz konta ponownie.', { name: pickerLabel(provider) })))) return;
    setBusy(provider);
    try { await invokeCloud({ action: 'disconnect', provider }); toast.success(tr('Rozłączono.')); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  return (
    <div id="pliki-z-chmury" className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors duration-300">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
        <div className="p-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-xl text-accent-primary dark:text-accent-primary-light">
          <Cloud size={24} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{tr('Pliki z Dysku Google i OneDrive')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Dodawaj pliki do wiadomości i materiałów jako odnośniki — bez kopiowania. O dostępie decydują uprawnienia u dostawcy.')}</p>
        </div>
      </div>
      {!status ? <div className="py-4 flex justify-center"><Spinner /></div> : (
        <div className="space-y-3">
          {visible.map((p) => {
            const s = status[p];
            return (
              <div key={p} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0"><CloudProviderIcon provider={p} size={22} /></span>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white">{pickerLabel(p)}</div>
                    <div className="mt-1"><Pill s={s} /></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {s.connected && <Button variant="outline" size="sm" icon={Unlink} onClick={() => disconnect(p)} loading={busy === p}>{tr('Rozłącz')}</Button>}
                  {(!s.connected || (s.status && s.status !== 'active')) && (
                    <Button size="sm" icon={Link2} onClick={() => connect(p)} loading={busy === p} disabled={!s.available}>
                      {s.connected ? tr('Połącz ponownie') : connectLabel(p)}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
