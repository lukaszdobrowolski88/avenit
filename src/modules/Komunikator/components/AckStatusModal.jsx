import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCheck, Clock, RefreshCw } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import UserAvatar from './UserAvatar';
import { chatAck } from '../hooks/useMessageAcks';
import { sameEmail } from '../utils/chatLogic';

// „Potwierdziło X z Y” (migracja 115): kto kliknął „Rozumiem” (z godziną), kto jeszcze nie,
// i „Przypomnij niepotwierdzonym” — push tylko do tych osób, najwyżej raz na 6 godzin.
const fmt = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function AckStatusModal({ isOpen, onClose, messageId, participants = [], ackCount = 0 }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reminding, setReminding] = useState(false);

  const load = useCallback(async () => {
    if (!messageId) return;
    setLoading(true);
    setError(null);
    try {
      setStatus(await chatAck('status', { message_id: messageId }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  // Otwarcie i każde nowe potwierdzenie (realtime) — świeża lista.
  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load, ackCount]);
  useEffect(() => { if (!isOpen) setStatus(null); }, [isOpen]);

  const remind = async () => {
    if (reminding) return;
    setReminding(true);
    try {
      const out = await chatAck('remind', { message_id: messageId });
      if (!out?.pending) toast.success(tr('Wszyscy już potwierdzili.'));
      else if (out.sent > 0) {
        toast.success(out.skipped_quiet
          ? tr('Wysłano przypomnienie: {n}. Pominięto (ciche godziny): {q}.', { n: out.sent, q: out.skipped_quiet })
          : tr('Wysłano przypomnienie: {n}.', { n: out.sent }));
      } else toast.info(tr('Nikt nie dostał przypomnienia — niepotwierdzeni mają teraz ciche godziny.'));
      await load();
    } catch (err) {
      if (err.code === 'ACK_REMIND_TOO_SOON') {
        toast.info(err.nextRemindAt
          ? tr('Kolejne przypomnienie możliwe od {time}.', { time: fmt(err.nextRemindAt) })
          : tr('Przypomnienie można wysłać raz na 6 godzin.'));
        await load();
      } else {
        toast.error(err, { fallback: tr('Nie udało się wysłać przypomnienia. Spróbuj ponownie.') });
      }
    } finally {
      setReminding(false);
    }
  };

  if (!isOpen) return null;
  const personOf = (p) => ({ ...(participants.find((x) => sameEmail(x.user_email, p.email)) || {}), email: p.email, full_name: p.name });
  const tooSoon = !!status?.next_remind_at && new Date(status.next_remind_at).getTime() > Date.now();
  const pendingCount = status?.pending?.length || 0;

  const footer = status && pendingCount > 0 ? (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
      <p className="flex-1 text-xs text-gray-500 dark:text-gray-400">
        {tooSoon
          ? tr('Kolejne przypomnienie możliwe od {time}.', { time: fmt(status.next_remind_at) })
          : status.last_reminded_at
            ? tr('Ostatnie przypomnienie: {time}.', { time: fmt(status.last_reminded_at) })
            : tr('Przypomnienie dostaną tylko osoby, które jeszcze nie potwierdziły.')}
      </p>
      <Button icon={BellRing} onClick={remind} loading={reminding} disabled={tooSoon}>
        {tr('Przypomnij niepotwierdzonym')}
      </Button>
    </div>
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={status ? tr('Potwierdziło {n} z {total}', { n: status.acked_count, total: status.total }) : tr('Potwierdzenia')}
      icon={CheckCheck}
      size="sm"
      footer={footer}
    >
      <div className="px-4 py-3">
        {loading && !status ? (
          <Spinner center label={tr('Ładowanie...')} />
        ) : error && !status ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
            <p className="text-sm text-gray-600 dark:text-gray-300">{error.message || tr('Nie udało się wczytać potwierdzeń.')}</p>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load}>{tr('Spróbuj ponownie')}</Button>
          </div>
        ) : status ? (
          <>
            {status.acked.length === 0 ? (
              <EmptyState compact icon={CheckCheck} title={tr('Nikt jeszcze nie potwierdził')} />
            ) : (
              <>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {tr('Potwierdzili: {n}', { n: status.acked.length })}
                </p>
                <ul className="space-y-0.5">
                  {status.acked.map((p) => (
                    <li key={p.email} className="flex items-center gap-3 px-2 py-2 rounded-xl">
                      <UserAvatar user={personOf(p)} size="sm" />
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{fmt(p.acked_at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {pendingCount > 0 && (
              <>
                <p className="mt-3 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <Clock size={11} aria-hidden="true" /> {tr('Jeszcze nie potwierdzili: {n}', { n: pendingCount })}
                </p>
                <ul className="space-y-0.5">
                  {status.pending.map((p) => (
                    <li key={p.email} className="flex items-center gap-3 px-2 py-1.5 rounded-xl">
                      <UserAvatar user={personOf(p)} size="sm" />
                      <span className="flex-1 min-w-0 truncate text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
