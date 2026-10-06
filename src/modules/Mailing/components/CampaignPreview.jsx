import React, { useState } from 'react';
import { Monitor, Smartphone, Send, Eye, Mail, User, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { personalizeHtml } from '../utils/emailVariables';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';

export default function CampaignPreview({ subject, htmlContent, onClose }) {
  const [viewMode, setViewMode] = useState('desktop'); // 'desktop' | 'mobile'
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);

  // Przygotuj podgląd z przykładowymi danymi
  const previewHtml = personalizeHtml(htmlContent, {
    email: 'jan.kowalski@example.com',
    full_name: 'Jan Kowalski'
  }, 'preview', {
    churchName: tr('Twój Kościół'),
    baseUrl: window.location.origin
  });

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error('Podaj adres email');
      return;
    }

    try {
      setSending(true);

      // Wywołaj Edge Function do wysyłki testowej
      const { data, error } = await supabase.functions.invoke('send-mailing-campaign', {
        body: {
          test_email: testEmail,
          test_subject: subject,
          test_html_content: htmlContent
        }
      });

      if (error) {
        throw new Error(error.message || tr('Błąd wysyłki'));
      }

      if (data?.success) {
        toast.success(`Email testowy wysłany na: ${testEmail}`);
        setShowTestForm(false);
      } else {
        throw new Error(data?.error || tr('Nie udało się wysłać'));
      }
    } catch (err) {
      console.error('Error sending test:', err);
      toast.error(`Błąd podczas wysyłania testu: ${err.message}`);
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
          Podgląd z przykładowymi danymi. Zmienne jak {'{{imie}}'} będą zastąpione podczas wysyłki.
        </p>
        <Button variant="secondary" onClick={onClose}>Zamknij</Button>
      </>}
    >
      {/* Pasek narzędzi: tryb podglądu + test */}
      <div className="px-6 py-3 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700">
        {/* View mode toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setViewMode('desktop')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              viewMode === 'desktop'
                ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Monitor size={16} />
            <span className="text-xs font-medium hidden sm:inline">Desktop</span>
          </button>
          <button
            onClick={() => setViewMode('mobile')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              viewMode === 'mobile'
                ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Smartphone size={16} />
            <span className="text-xs font-medium hidden sm:inline">Mobile</span>
          </button>
        </div>

        <Button
          variant={showTestForm ? 'primary' : 'outline'}
          size="sm"
          icon={Send}
          onClick={() => setShowTestForm(!showTestForm)}
        >
          Test
        </Button>
      </div>

      {/* Test email form */}
      {showTestForm && (
        <div className="px-6 py-4 bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 border-b border-accent-primary-lighter/50 dark:border-accent-primary-dark/50">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Wpisz adres email do testu..."
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 focus:border-accent-primary-light transition-all"
              />
            </div>
            <Button icon={Send} onClick={handleSendTest} loading={sending}>
              Wyślij
            </Button>
          </div>
        </div>
      )}

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
                <span className="text-gray-400 dark:text-gray-500 w-10">Od:</span>
                <span className="font-medium">{tr('Twój Kościół')}</span>
                <span className="text-gray-400">&lt;newsletter@kosciol.pl&gt;</span>
              </p>
              <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-gray-400 dark:text-gray-500 w-10">Do:</span>
                <span>jan.kowalski@example.com</span>
              </p>
              <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-gray-400 dark:text-gray-500 w-10">Temat:</span>
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
