import React, { useState } from 'react';
import { Monitor, Smartphone, Send, Eye, Mail, User, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { personalizeHtml } from '../utils/emailVariables';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { useCan } from '../../../components/Can';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';

export default function CampaignPreview({ subject, htmlContent, onClose }) {
  const [viewMode, setViewMode] = useState('desktop'); // 'desktop' | 'mobile'
  const canSend = useCan('action:mailing:send');
  const [sending, setSending] = useState(false);

  // Przygotuj podgląd z przykładowymi danymi
  const previewHtml = personalizeHtml(htmlContent, {
    email: 'jan.kowalski@example.com',
    full_name: 'Jan Kowalski'
  }, 'preview', {
    churchName: tr('Twój Kościół'),
    baseUrl: window.location.origin
  });

  // Test idzie zawsze na adres zalogowanej osoby (serwer bierze go z sesji), bez zapisu maila.
  const handleSendTest = async () => {
    if (!String(subject || '').trim() || !String(htmlContent || '').trim()) {
      toast.error(tr('Uzupełnij temat i treść maila, zanim wyślesz test.'));
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-mailing-campaign', {
        body: { test: true, test_subject: subject, test_html_content: htmlContent }
      });
      if (error) {
        const msg = error.message && !/^HTTP \d+/.test(error.message) ? tr(error.message) : tr('Nie udało się wysłać maila testowego. Spróbuj ponownie za chwilę.');
        toast.error(msg);
        return;
      }
      toast.success(tr('Mail testowy wysłany na {email}.', { email: data?.to || '' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      title={tr('Podgląd wiadomości')}
      subtitle={tr('Sprawdź jak wygląda email')}
      icon={Eye}
      size="xl"
      footer={<>
        <p className="mr-auto text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Sparkles size={12} className="text-accent-primary-light" />
          {tr('Podgląd z przykładowymi danymi. Zmienne jak {var} będą zastąpione podczas wysyłki.', { var: '{{imie}}' })}
        </p>
        <Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>
      </>}
    >
      {/* Pasek narzędzi: tryb podglądu + test */}
      <div className="px-6 py-3 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700">
        {/* View mode toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setViewMode('desktop')}
            aria-pressed={viewMode === 'desktop'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              viewMode === 'desktop'
                ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Monitor size={16} />
            <span className="text-xs font-medium hidden sm:inline">{tr('Komputer')}</span>
          </button>
          <button
            onClick={() => setViewMode('mobile')}
            aria-pressed={viewMode === 'mobile'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              viewMode === 'mobile'
                ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Smartphone size={16} />
            <span className="text-xs font-medium hidden sm:inline">{tr('Telefon')}</span>
          </button>
        </div>

        {canSend && (
          <Button
            variant="outline"
            size="sm"
            icon={Send}
            onClick={handleSendTest}
            loading={sending}
            title={tr('Wyślij mail testowy do siebie')}
          >
            {tr('Wyślij test do siebie')}
          </Button>
        )}
      </div>

      {/* Subject preview */}
      <div className="px-6 py-4 bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg">
            <Mail size={14} className="text-gray-500 dark:text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{tr('Temat wiadomości')}</p>
            <p className="font-semibold text-gray-900 dark:text-white truncate">{subject}</p>
          </div>
        </div>
      </div>

      {/* Email preview */}
      <div className="p-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
        <div className={`mx-auto bg-white shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 ${
          viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-[600px]'
        }`}>
          {/* Email header simulation */}
          <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-600">
            <div className="space-y-1.5 text-xs">
              <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-gray-400 dark:text-gray-500 w-10">{tr('Od:')}</span>
                <span className="font-medium">{tr('Twój Kościół')}</span>
                <span className="text-gray-400">&lt;newsletter@kosciol.pl&gt;</span>
              </p>
              <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-gray-400 dark:text-gray-500 w-10">{tr('Do:')}</span>
                <span>jan.kowalski@example.com</span>
              </p>
              <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-gray-400 dark:text-gray-500 w-10">{tr('Temat:')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{subject}</span>
              </p>
            </div>
          </div>

          {/* Email content */}
          <div
            className="p-0"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </Modal>
  );
}
