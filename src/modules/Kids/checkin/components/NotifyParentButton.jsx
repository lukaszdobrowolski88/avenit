import React, { useState, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, CheckCircle, Phone, Bell } from 'lucide-react';
import { supabase, getCachedUser } from '../../../../lib/supabase';
import Modal from '../../../../components/Modal';
import { tr } from '../../../../i18n';
import { invokeSendSms } from '../../../SmsCampaigns/hooks/useSmsCampaigns';
import { invokeSendPush } from '../../../PushCampaigns/hooks/usePushCampaigns';
import { normalizePhone } from '../../../shared/recipients';

// Gotowe szablony wiadomości do rodzica.
const TEMPLATES = [
  {
    label: 'Prosimy o odbiór dziecka',
    build: (name) => `Prosimy o odbiór dziecka${name ? `: ${name}` : ''}. Dziękujemy!`,
  },
  {
    label: 'Dziecko potrzebuje rodzica',
    build: (name) => `${name || 'Dziecko'} potrzebuje rodzica — prosimy o przyjście do sali dziecięcej.`,
  },
];

/**
 * Przycisk + modal do wysłania powiadomienia rodzicowi (SMS/push) dla zameldowanego dziecka.
 * Reużywa istniejącego mechanizmu send-sms / send-push i loguje wpis do kids_parent_notifications.
 */
export default function NotifyParentButton({ checkin, sessionId }) {
  const [open, setOpen] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [channel, setChannel] = useState('sms');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState(null); // { name }
  const [error, setError] = useState('');

  const childName = checkin?.is_guest
    ? checkin?.guest_name
    : checkin?.kids_students?.full_name;

  const buildGuestContact = useCallback(() => ([{
    id: 'guest',
    full_name: checkin?.guest_parent_name || tr('Rodzic'),
    phone: checkin?.guest_parent_phone || '',
    email: null,
    can_pickup: true,
  }]), [checkin]);

  const loadContacts = useCallback(async () => {
    // Gość: kontakt bierzemy bezpośrednio z rekordu check-in.
    if (checkin?.is_guest || !checkin?.household_id) {
      const list = buildGuestContact();
      setContacts(list);
      setSelectedContactId(list[0].id);
      return;
    }
    setLoadingContacts(true);
    try {
      const { data, error: qErr } = await supabase
        .from('parent_contacts')
        .select('id, full_name, phone, email, is_primary, can_pickup')
        .eq('household_id', checkin.household_id)
        .order('is_primary', { ascending: false });
      if (qErr) throw qErr;
      const list = data || [];
      setContacts(list);
      // Domyślnie: opiekun mogący odebrać / primary / pierwszy.
      const preferred =
        list.find(c => c.can_pickup && c.phone) ||
        list.find(c => c.phone) ||
        list[0];
      setSelectedContactId(preferred?.id || '');
    } catch (e) {
      setError(e.message || tr('Nie udało się pobrać kontaktów opiekuna.'));
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [checkin, buildGuestContact]);

  const handleOpen = () => {
    setError('');
    setSentInfo(null);
    setChannel('sms');
    setMessage(TEMPLATES[0].build(childName));
    setOpen(true);
    loadContacts();
  };

  const handleClose = () => {
    if (sending) return;
    setOpen(false);
  };

  const selectedContact = contacts.find(c => String(c.id) === String(selectedContactId));

  const handleSend = async () => {
    setError('');
    if (!selectedContact) { setError(tr('Wybierz opiekuna.')); return; }
    if (!message.trim()) { setError(tr('Wpisz treść wiadomości.')); return; }

    let status = 'sent';
    setSending(true);
    try {
      if (channel === 'sms') {
        const phone = normalizePhone(selectedContact.phone);
        if (!phone) { setError(tr('Brak poprawnego numeru telefonu opiekuna.')); setSending(false); return; }
        const result = await invokeSendSms({ phone, message: message.trim() });
        if (result?.sent !== 1) {
          status = 'failed';
          throw new Error(result?.error || tr('Nie udało się wysłać SMS.'));
        }
      } else {
        const email = selectedContact.email;
        if (!email) { setError(tr('Brak adresu e-mail opiekuna do powiadomienia push.')); setSending(false); return; }
        await invokeSendPush({
          user_email: email,
          title: tr('Powiadomienie z kościoła'),
          body: message.trim(),
        });
      }

      // Zapisz log powiadomienia (nie blokuj UX błędem zapisu).
      try {
        const user = await getCachedUser();
        const isRealContact = selectedContact.id && selectedContact.id !== 'guest';
        await supabase.from('kids_parent_notifications').insert({
          child_name: childName || null,
          parent_phone: selectedContact.phone || null,
          parent_contact_id: isRealContact ? selectedContact.id : null,
          session_id: sessionId || checkin?.session_id || null,
          channel,
          message: message.trim(),
          status,
          sent_by: user?.email || 'system',
          campus_id: checkin?.kids_students?.campus_id ?? checkin?.campus_id ?? null,
        });
      } catch (logErr) {
        console.error('Nie udało się zapisać logu powiadomienia:', logErr);
      }

      setSentInfo({ name: selectedContact.full_name });
      setTimeout(() => setOpen(false), 1800);
    } catch (e) {
      setError(e.message || tr('Wystąpił błąd podczas wysyłania.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        title={tr('Powiadom rodzica')}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/40 transition"
      >
        <Bell size={14} />
        {tr('Powiadom rodzica')}
      </button>

      <Modal isOpen={open}>
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-accent-primary dark:text-accent-primary-light" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {tr('Powiadom rodzica')}
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            {sentInfo ? (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle size={32} className="text-green-500 dark:text-green-400" />
                </div>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {tr('Wysłano!')}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {sentInfo.name}
                </p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                {/* Dziecko */}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {tr('Dziecko')}:{' '}
                  <strong className="text-gray-900 dark:text-white">{childName || '—'}</strong>
                </div>

                {/* Kanał */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    {tr('Kanał')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChannel('sms')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition
                        ${channel === 'sms'
                          ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <Phone size={15} /> SMS
                    </button>
                    <button
                      onClick={() => setChannel('push')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition
                        ${channel === 'push'
                          ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <Bell size={15} /> Push
                    </button>
                  </div>
                </div>

                {/* Opiekun */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    {tr('Opiekun')}
                  </label>
                  {loadingContacts ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                      <Loader2 size={16} className="animate-spin" /> {tr('Ładowanie...')}
                    </div>
                  ) : contacts.length === 0 ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400 py-2">
                      {tr('Brak kontaktów opiekuna dla tego dziecka.')}
                    </p>
                  ) : (
                    <select
                      value={selectedContactId}
                      onChange={(e) => setSelectedContactId(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-accent-primary-light focus:outline-none transition"
                    >
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                          {channel === 'sms' ? (c.phone ? ` — ${c.phone}` : ` — ${tr('brak telefonu')}`) : (c.email ? ` — ${c.email}` : ` — ${tr('brak e-mail')}`)}
                          {c.can_pickup ? ` · ${tr('może odebrać')}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Szablony */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    {tr('Szablon')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.label}
                        onClick={() => setMessage(t.build(childName))}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                      >
                        {tr(t.label)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wiadomość */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    {tr('Wiadomość')}
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:border-accent-primary-light focus:outline-none transition resize-none"
                    placeholder={tr('Treść wiadomości...')}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>
            )}

            {/* Footer */}
            {!sentInfo && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleClose}
                  disabled={sending}
                  className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                >
                  {tr('Anuluj')}
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || loadingContacts || contacts.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {tr('Wyślij')}
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
