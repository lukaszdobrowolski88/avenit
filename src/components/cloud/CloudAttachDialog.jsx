import React, { useCallback, useEffect, useState } from 'react';
import { Info, Link2, RefreshCw, CloudOff } from 'lucide-react';
import Modal from '../Modal';
import Button from '../Button';
import Spinner from '../Spinner';
import CloudProviderIcon from './CloudProviderIcon';
import CloudFileLink from './CloudFileLink';
import { providerChoices, connectLabel, accessNotice, shareHint } from './cloudFilesLogic';
import { invokeCloud, startCloudConnect, onCloudConnected, openBlankWindow, pickCloudFiles, shareWithOrganization } from '../../lib/cloudFiles';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// „Dodaj z Dysku Google / OneDrive” (Faza 3 integracji): wybór plików BEZ kopiowania.
// Kroki: wybór usługi (połączenie konta przy pierwszym użyciu) → okno wyboru dostawcy (Google Picker /
// File Picker v8) → podsumowanie z informacją o dostępie i opcjonalnym udostępnieniem organizacji
// (domyślnie wyłączone, tylko Google Workspace) → onAttach(attachments) — znormalizowane odnośniki.
export function CloudAttachPanel({ status, phase, picked, onPick, onConnect, onRecheck, share, setShare, connecting }) {
  if (phase === 'review') {
    const p = picked.provider;
    const hint = shareHint(p, { canShareDomain: picked.canShareDomain });
    return (
      <div className="p-6 space-y-4">
        <div className="space-y-2">
          {picked.attachments.map((a) => <CloudFileLink key={`${a.provider}:${a.file_id}`} item={a} />)}
        </div>
        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2" role="note">
          <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">{accessNotice(p)}</p>
            <p>{tr('Avenit zapisuje tylko odnośnik — plik zostaje u dostawcy i nie jest kopiowany.')}</p>
            {hint && <p>{hint}</p>}
          </div>
        </div>
        {p === 'google' && picked.canShareDomain && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-1 accent-accent-primary" />
            <span>
              <span className="text-gray-800 dark:text-gray-100">{tr('Udostępnij plik osobom z linkiem w mojej organizacji')}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {tr('Tylko do odczytu, dla kont w domenie {domain}. Plik nie staje się publiczny w internecie.', { domain: picked.domain || '' })}
              </span>
            </span>
          </label>
        )}
      </div>
    );
  }

  if (!status) return <div className="p-8 flex justify-center"><Spinner /></div>;
  const choices = providerChoices(status);
  if (!choices.length) {
    return (
      <div className="p-6 text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
        <CloudOff size={18} className="shrink-0" aria-hidden="true" />
        <p>{tr('Pliki z Dysku Google i OneDrive są wyłączone w tym kościele.')}</p>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">{tr('Wybierz plik ze swojego konta — w Avenit zostanie tylko odnośnik, bez kopiowania pliku.')}</p>
      {choices.map((c) => (
        <div key={c.provider} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <span className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <CloudProviderIcon provider={c.provider} size={22} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {c.state === 'ready' && (c.account ? tr('Połączone jako {who}', { who: c.account }) : tr('Połączone'))}
              {c.state === 'connect' && tr('Połącz swoje konto, aby wybierać pliki')}
              {c.state === 'reconnect' && tr('Zgoda cofnięta — połącz ponownie')}
              {c.state === 'unavailable' && tr('Administrator kościoła nie skonfigurował jeszcze tej integracji.')}
            </div>
          </div>
          {c.state === 'ready' && <Button size="sm" onClick={(e) => onPick(c, e)}>{tr('Wybierz pliki')}</Button>}
          {(c.state === 'connect' || c.state === 'reconnect') && (
            <Button size="sm" variant="outline" icon={Link2} loading={connecting === c.provider} onClick={() => onConnect(c.provider)}>
              {c.state === 'reconnect' ? tr('Połącz ponownie') : connectLabel(c.provider)}
            </Button>
          )}
        </div>
      ))}
      {connecting && (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
          <span>{tr('Dokończ łączenie w nowym oknie, a potem wróć tutaj.')}</span>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRecheck}>{tr('Sprawdź')}</Button>
        </div>
      )}
    </div>
  );
}

export default function CloudAttachDialog({ isOpen, onClose, onAttach, title }) {
  const [status, setStatus] = useState(null);
  const [phase, setPhase] = useState('choose'); // choose | picking | review
  const [picked, setPicked] = useState(null);
  const [share, setShare] = useState(false);
  const [connecting, setConnecting] = useState(null);

  const load = useCallback(async () => {
    try { setStatus((await invokeCloud({ action: 'status' })).providers); } catch (e) { toast.error(e.message); setStatus({}); }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setPhase('choose'); setPicked(null); setShare(false); setConnecting(null); setStatus(null);
    load();
    return onCloudConnected((msg) => {
      setConnecting(null);
      if (msg.result === 'connected') toast.success(tr('Połączono konto. Możesz wybrać pliki.'));
      else toast.error(tr('Nie udało się połączyć konta.'));
      load();
    });
  }, [isOpen, load]);

  const onConnect = async (provider) => {
    const win = openBlankWindow('avenit-cloud-connect', { width: 520, height: 700 });
    setConnecting(provider);
    try { await startCloudConnect(provider, win); } catch (e) { setConnecting(null); toast.error(e.message); }
  };

  const onPick = async (choice) => {
    // Okno Microsoftu otwieramy od razu (w obsłudze kliknięcia) — inaczej zablokuje je przeglądarka.
    const win = choice.provider === 'microsoft' ? openBlankWindow('avenit-ms-picker', { width: 1080, height: 700 }) : null;
    setPhase('picking');
    try {
      const r = await pickCloudFiles(choice.provider, { win });
      if (r.failed?.length) toast.error(tr('Nie udało się dodać plików: {n} ({why})', { n: r.failed.length, why: r.failed[0].error || '' }));
      if (r.attachments?.length) {
        setPicked({ provider: choice.provider, attachments: r.attachments, canShareDomain: choice.canShareDomain, domain: choice.domain });
        setShare(false);
        setPhase('review');
      } else setPhase('choose');
    } catch (e) {
      toast.error(e.message);
      setPhase('choose');
      if (e.code === 'not_connected' || e.code === 'revoked') load();
    }
  };

  const confirm = async () => {
    if (!picked) return;
    if (share && picked.provider === 'google') {
      try {
        const r = await shareWithOrganization('google', picked.attachments.map((a) => a.file_id));
        if (r.failed?.length) toast.error(tr('Nie udało się udostępnić części plików organizacji — udostępnij je w Dysku Google.'));
      } catch (e) { toast.error(e.message); }
    }
    onAttach?.(picked.attachments, { provider: picked.provider });
    onClose?.();
  };

  const footer = phase === 'review'
    ? (
      <>
        <Button variant="secondary" onClick={() => setPhase('choose')}>{tr('Wróć')}</Button>
        <Button onClick={confirm}>{tr('Dodaj ({n})', { n: picked?.attachments.length || 0 })}</Button>
      </>
    )
    : <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>;

  return (
    <Modal
      isOpen={isOpen && phase !== 'picking'}
      onClose={onClose}
      title={title || tr('Dodaj z Dysku Google lub OneDrive')}
      size="md"
      footer={footer}
    >
      <CloudAttachPanel
        status={status} phase={phase} picked={picked} onPick={onPick} onConnect={onConnect} onRecheck={load}
        share={share} setShare={setShare} connecting={connecting}
      />
    </Modal>
  );
}
