import React, { useState } from 'react';
import { X, Monitor, Smartphone, Send, Loader, Eye, Mail, User, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { personalizeHtml } from '../utils/emailVariables';

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
    churchName: 'Twój Kościół',
    baseUrl: window.location.origin
  });

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      alert('Podaj adres email');
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
        throw new Error(error.message || 'Błąd wysyłki');
      }

      if (data?.success) {
        alert(`Email testowy wysłany na: ${testEmail}`);
        setShowTestForm(false);
      } else {
        throw new Error(data?.error || 'Nie udało się wysłać');
      }
    } catch (err) {
      console.error('Error sending test:', err);
      alert(`Błąd podczas wysyłania testu: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-pink-500 to-orange-500 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                <Eye size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Podgląd wiadomości
                </h2>
                <p className="text-sm text-white/80">
                  Sprawdź jak wygląda email
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View mode toggle */}
              <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-xl p-1">
                <button
                  onClick={() => setViewMode('desktop')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    viewMode === 'desktop'
                      ? 'bg-white text-pink-600 shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Monitor size={16} />
                  <span className="text-xs font-medium hidden sm:inline">Desktop</span>
                </button>
                <button
                  onClick={() => setViewMode('mobile')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    viewMode === 'mobile'
                      ? 'bg-white text-pink-600 shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Smartphone size={16} />
                  <span className="text-xs font-medium hidden sm:inline">Mobile</span>
                </button>
              </div>

              <button
                onClick={() => setShowTestForm(!showTestForm)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
                  showTestForm
                    ? 'bg-white text-pink-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <Send size={16} />
                <span className="hidden sm:inline text-sm font-medium">Test</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X size={20} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Test email form */}
        {showTestForm && (
          <div className="px-6 py-4 bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 border-b border-pink-200/50 dark:border-pink-800/50">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Wpisz adres email do testu..."
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all"
                />
              </div>
              <button
                onClick={handleSendTest}
                disabled={sending}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all shadow-lg shadow-pink-500/30 disabled:opacity-50 font-medium"
              >
                {sending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                Wyślij
              </button>
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Temat wiadomości</p>
              <p className="font-semibold text-gray-900 dark:text-white truncate">{subject}</p>
            </div>
          </div>
        </div>

        {/* Email preview */}
        <div className="flex-1 overflow-auto p-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
          <div className={`mx-auto bg-white shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 ${
            viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-[600px]'
          }`}>
            {/* Email header simulation */}
            <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-600">
              <div className="space-y-1.5 text-xs">
                <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <span className="text-gray-400 dark:text-gray-500 w-10">Od:</span>
                  <span className="font-medium">Twój Kościół</span>
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-2">
            <Sparkles size={12} className="text-pink-500" />
            Podgląd z przykładowymi danymi. Zmienne jak {'{{imie}}'} będą zastąpione podczas wysyłki.
          </p>
        </div>
      </div>
    </div>
  );
}
