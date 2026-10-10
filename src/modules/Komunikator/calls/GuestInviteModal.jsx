import React, { useCallback, useEffect, useState } from 'react';
import { Link2, Copy, Check, Trash2, ShieldAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { confirmDialog } from '../../../lib/dialog';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { callFn } from './callApi';
import { EXPIRY_OPTIONS, DEFAULT_EXPIRY, guestLinkUrl, expiryText, usesText } from './guestLogic';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Wiersz aktywnego linku: adres (do zaznaczenia), ważność/limit, Kopiuj i Wyłącz.
function LinkRow({ link, fresh, onRevoke }) {
  const url = guestLinkUrl(link);
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success(tr('Skopiowano link do rozmowy'));
    } else {
      // Bez dostępu do schowka (np. http) — zaznacz adres do ręcznego skopiowania.
      e?.currentTarget?.closest('li')?.querySelector('input')?.select();
      toast.info(tr('Zaznaczono link — skopiuj go skrótem klawiszowym.'));
    }
  };
  const meta = [expiryText(link.expires_at), usesText(link), link.auto_admit ? tr('bez pytania') : null].filter(Boolean).join(' · ');
  return (
    <li className={`rounded-xl px-3 py-2.5 ${fresh ? 'bg-amber-50 dark:bg-amber-400/10' : 'bg-gray-50 dark:bg-gray-800/60'}`}>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label={tr('Link dla gościa')}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-800 dark:text-gray-100 truncate focus:outline-none focus:ring-0"
        />
        <Button size="sm" variant={fresh ? 'primary' : 'secondary'} icon={copied ? Check : Copy} onClick={copy} data-autofocus={fresh || undefined}>
          {copied ? tr('Skopiowano') : tr('Kopiuj')}
        </Button>
        <button
          type="button"
          onClick={() => onRevoke(link)}
          aria-label={tr('Wyłącz link')}
          title={tr('Wyłącz link')}
          className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      {meta && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{meta}</p>}
    </li>
  );
}

// „Zaproś gościa (link)” — jak Zoom/Meet: link do połączeń tej rozmowy dla osoby spoza aplikacji.
// Domyślnie gość czeka w poczekalni, aż ktoś z rozmowy go wpuści.
export default function GuestInviteModal({ conversation, onClose }) {
  const isDirect = conversation?.type === 'direct';
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [expiresIn, setExpiresIn] = useState(DEFAULT_EXPIRY);
  const [autoAdmit, setAutoAdmit] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [freshId, setFreshId] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await callFn('call-link-list', { conversation_id: conversation.id }));
    } catch (err) {
      setLoadError(err);
    }
  }, [conversation?.id]);
  useEffect(() => { if (conversation?.id) load(); }, [conversation?.id, load]);

  const create = async () => {
    try {
      const res = await callFn('call-link-create', {
        conversation_id: conversation.id,
        expires_in: expiresIn,
        auto_admit: autoAdmit,
        show_title: !isDirect && showTitle,
        max_uses: maxUses ? Number(maxUses) : null,
      });
      if (res?.link) {
        setData((d) => ({ ...(d || {}), links: [res.link, ...((d?.links) || [])] }));
        setFreshId(res.link.id);
        if (await copyText(guestLinkUrl(res.link))) toast.success(tr('Link utworzony i skopiowany'));
      }
    } catch (err) {
      if (err?.status === 503) toast.info(tr('Połączenia audio i wideo nie są jeszcze włączone. Zapytaj administratora.'));
      else toast.error(err, { fallback: tr('Nie udało się utworzyć linku.') });
    }
  };

  const revoke = async (link) => {
    const ok = await confirmDialog({
      title: tr('Wyłączyć ten link?'),
      message: tr('Osoby z tym linkiem nie dołączą już do rozmowy, a goście, którzy z niego weszli, zostaną rozłączeni.'),
      confirmLabel: tr('Wyłącz link'),
      danger: true,
      isDelete: false,
    });
    if (!ok) return;
    try {
      await callFn('call-link-revoke', { link_id: link.id });
      setData((d) => ({ ...(d || {}), links: (d?.links || []).filter((l) => l.id !== link.id) }));
      toast.success(tr('Link wyłączony'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wyłączyć linku.') });
    }
  };

  const links = data?.links || [];
  const pill = (active) => `px-3.5 py-2 rounded-xl text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
    active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`;

  let body;
  if (loadError) {
    body = (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{tr('Nie udało się wczytać linków.')}</p>
        <Button variant="secondary" onClick={load}>{tr('Spróbuj ponownie')}</Button>
      </div>
    );
  } else if (!data) {
    body = <div className="p-10"><Spinner center label={tr('Wczytywanie…')} /></div>;
  } else if (!data.can_manage) {
    body = (
      <div className="p-6 flex gap-3">
        <ShieldAlert size={20} className="shrink-0 text-gray-500 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-gray-600 dark:text-gray-300">{data.message || tr('Link dla gościa może utworzyć administrator tej rozmowy.')}</p>
      </div>
    );
  } else {
    body = (
      <div className="p-6 space-y-6">
        {data.can_create ? (
          <section className="space-y-4" aria-label={tr('Nowy link')}>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {tr('Osoba z linkiem poda swoje imię i poprosi o dołączenie. Zobaczy tylko rozmowę audio/wideo — bez czatu i innych danych.')}
            </p>
            <fieldset>
              <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{tr('Link ważny przez')}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {EXPIRY_OPTIONS.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={expiresIn === o.value} className={pill(expiresIn === o.value)} onClick={() => setExpiresIn(o.value)}>
                    {tr(o.label)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={autoAdmit} onChange={(e) => setAutoAdmit(e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
              <span className="text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{tr('Wpuszczaj bez pytania')}</span>
                <span className="block text-gray-500 dark:text-gray-400">{tr('Gość wejdzie od razu, gdy ktoś z rozmowy będzie w połączeniu.')}</span>
              </span>
            </label>
            {!isDirect && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
                <span className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{tr('Pokaż gościowi nazwę rozmowy')}</span>
                  <span className="block text-gray-500 dark:text-gray-400">{tr('Bez tego gość zobaczy tylko nazwę kościoła.')}</span>
                </span>
              </label>
            )}
            <label className="flex items-center gap-3 text-sm">
              <span className="font-medium text-gray-900 dark:text-white">{tr('Limit osób')}</span>
              <input
                type="number"
                min="1"
                max="500"
                inputMode="numeric"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                placeholder={tr('bez limitu')}
                className="w-28 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
            </label>
            <Button icon={Link2} onClick={create}>{tr('Utwórz link')}</Button>
          </section>
        ) : (
          <div className="flex gap-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3">
            <ShieldAlert size={18} className="shrink-0 text-gray-500 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-gray-600 dark:text-gray-300">{data.message}</p>
          </div>
        )}
        <section aria-label={tr('Aktywne linki')}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{tr('Aktywne linki')}</h3>
          {links.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Brak aktywnych linków.')}</p>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => <LinkRow key={l.id} link={l} fresh={l.id === freshId} onRevoke={revoke} />)}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={tr('Zaproś gościa')}
      subtitle={conversation?.name || undefined}
      icon={Link2}
      size="md"
      footer={<Button variant="secondary" onClick={onClose}>{tr('Gotowe')}</Button>}
    >
      {body}
    </Modal>
  );
}
