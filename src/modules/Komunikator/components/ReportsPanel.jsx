import React, { useCallback, useEffect, useState } from 'react';
import { Flag, CheckCircle2, ExternalLink, ShieldAlert } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import { normEmail, previewText } from '../utils/chatLogic';

// Panel „Zgłoszenia” (K10) — dla administratora aplikacji / osoby z prawem moderacji Komunikatora.
// message_reports czyta i rozstrzyga tylko uprawniony (serwer: admin aplikacji albo
// action:komunikator:moderate). Treść i autora serwer kopiuje do zgłoszenia (message_content,
// message_sender_email); bieżącą wiadomość pokazujemy, gdy moderator jest w tej rozmowie.
const REPORT_COLS = '*';

const fmt = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
};

// Liczba otwartych zgłoszeń (znaczek przy przycisku). null = brak dostępu / brak tabeli.
export async function countOpenReports() {
  const { count, error } = await supabase
    .from('message_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) return null;
  return count ?? 0;
}

export default function ReportsPanel({ isOpen, onClose, currentUserEmail, onOpenConversation, onChanged }) {
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState([]);
  const [messages, setMessages] = useState({});
  const [people, setPeople] = useState({});
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const { data, error } = await supabase
        .from('message_reports')
        .select(REPORT_COLS)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (String(error.code) === '403' || /uprawnie|dostęp/i.test(error.message || '')) { setDenied(true); setReports([]); return; }
        throw error;
      }
      const rows = data || [];
      setReports(rows);
      // Treść wiadomości (jeśli moderator ją widzi) i nazwiska osób — dwa zapytania na całą listę.
      const ids = [...new Set(rows.map(r => r.message_id).filter(Boolean))];
      const msgMap = {};
      if (ids.length) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('id, conversation_id, content, sender_email, created_at, message_type, attachments, deleted_at')
          .in('id', ids);
        (msgs || []).forEach(m => { msgMap[m.id] = m; });
      }
      setMessages(msgMap);
      const emails = [...new Set(rows.flatMap(r => [r.reporter_email, r.message_sender_email, r.resolved_by, msgMap[r.message_id]?.sender_email]).filter(Boolean))];
      if (emails.length) {
        const { data: users } = await supabase.from('app_users').select('email, full_name').in('email', emails);
        const map = {};
        (users || []).forEach(u => { map[normEmail(u.email)] = u.full_name || u.email; });
        setPeople(map);
      }
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wczytać zgłoszeń.') });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const nameOf = (email) => (email ? people[normEmail(email)] || email : tr('nieznana osoba'));

  const resolve = async (report) => {
    setBusyId(report.id);
    try {
      const { data, error } = await supabase
        .from('message_reports')
        .update({ status: 'resolved', resolved_by: currentUserEmail, resolved_at: new Date().toISOString() })
        .eq('id', report.id)
        .select('id, status');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(tr('Zgłoszenia rozstrzyga administrator.'));
      setReports(prev => prev.filter(r => r.id !== report.id));
      toast.success(tr('Zgłoszenie oznaczone jako rozpatrzone'));
      onChanged?.();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zmienić zgłoszenia.') });
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  const tabCls = (active) => `px-3 py-1.5 rounded-full text-xs font-medium transition ${active
    ? 'bg-accent-primary text-white'
    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tr('Zgłoszenia')} icon={Flag} size="md">
      <div className="sticky top-0 z-10 flex gap-2 px-6 py-3 border-b border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-gray-900" role="tablist">
        <button type="button" role="tab" aria-selected={status === 'open'} className={tabCls(status === 'open')} onClick={() => setStatus('open')}>{tr('Do rozpatrzenia')}</button>
        <button type="button" role="tab" aria-selected={status === 'resolved'} className={tabCls(status === 'resolved')} onClick={() => setStatus('resolved')}>{tr('Rozpatrzone')}</button>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <Spinner center label={tr('Ładowanie zgłoszeń...')} />
        ) : denied ? (
          <EmptyState compact icon={ShieldAlert} title={tr('Brak dostępu')} subtitle={tr('Zgłoszenia przegląda administrator.')} />
        ) : reports.length === 0 ? (
          <EmptyState compact icon={CheckCircle2} title={status === 'open' ? tr('Brak nowych zgłoszeń') : tr('Brak rozpatrzonych zgłoszeń')} />
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => {
              const msg = messages[r.message_id];
              // Serwer kopiuje treść i nadawcę przy zgłoszeniu (moderator nie musi być w rozmowie).
              const snapshot = r.message_content || null;
              const live = msg && !msg.deleted_at ? previewText(msg, tr) : null;
              const text = snapshot || live || (msg?.deleted_at ? tr('(wiadomość usunięta)') : null);
              const author = r.message_sender_email || msg?.sender_email || null;
              const convId = msg?.conversation_id || r.conversation_id;
              return (
                <li key={r.id} className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {tr('Zgłasza: {name}', { name: nameOf(r.reporter_email) })} · {fmt(r.created_at)}
                      </p>
                      {author && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Autor wiadomości: {name}', { name: nameOf(author) })}</p>
                      )}
                    </div>
                    {status === 'open' && (
                      <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busyId === r.id} onClick={() => resolve(r)}>
                        {tr('Rozpatrzone')}
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {text || <span className="italic text-gray-500 dark:text-gray-400">{tr('Treść widzą tylko uczestnicy tej rozmowy.')}</span>}
                  </p>
                  {r.reason && (
                    <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300"><span className="font-semibold">{tr('Powód')}:</span> {r.reason}</p>
                  )}
                  {status === 'resolved' && r.resolved_at && (
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{tr('Rozpatrzył(a): {name}, {date}', { name: nameOf(r.resolved_by), date: fmt(r.resolved_at) })}</p>
                  )}
                  {msg && convId && onOpenConversation && (
                    <button type="button" onClick={() => { onOpenConversation(convId); onClose?.(); }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-primary-dark dark:text-accent-primary-light hover:underline">
                      <ExternalLink size={12} /> {tr('Otwórz rozmowę')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
