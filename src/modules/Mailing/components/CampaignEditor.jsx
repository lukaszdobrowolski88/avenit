import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Send, Clock, Save, Eye, X,
  FileText, Edit3, Users, CheckCircle, Loader, MousePointer, Code,
  Calendar, Mail, TestTube, Sparkles, ChevronRight
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useCampaigns } from '../hooks/useCampaigns';
import { useTemplates } from '../hooks/useTemplates';
import { useRecipients, saveSegments } from '../hooks/useRecipients';
import EmailEditor from './EmailEditor';
import DragDropEmailBuilder from './DragDropEmailBuilder';
import RecipientSelector from './RecipientSelector';
import CampaignPreview from './CampaignPreview';

const STEPS = [
  { id: 'basics', label: 'Podstawy', icon: FileText },
  { id: 'content', label: 'Treść', icon: Edit3 },
  { id: 'recipients', label: 'Odbiorcy', icon: Users },
  { id: 'summary', label: 'Podsumowanie', icon: CheckCircle }
];

const EDITOR_MODES = {
  dragdrop: { id: 'dragdrop', label: 'Kreator wizualny', icon: MousePointer, description: 'Przeciągnij i upuść gotowe elementy' },
  richtext: { id: 'richtext', label: 'Edytor tekstu', icon: Edit3, description: 'Klasyczny edytor z formatowaniem' },
  html: { id: 'html', label: 'Kod HTML', icon: Code, description: 'Dla zaawansowanych - edytuj surowy HTML' }
};

export default function CampaignEditor({ campaign, templateId, onClose, onSave }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestSend, setShowTestSend] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editorMode, setEditorMode] = useState('dragdrop');
  const [editorModeInitialized, setEditorModeInitialized] = useState(false);
  const [formDataInitialized, setFormDataInitialized] = useState(false);
  const [formData, setFormData] = useState({
    name: campaign?.name || '',
    subject: campaign?.subject || '',
    html_content: campaign?.html_content || '',
    json_design: campaign?.json_design || null,
    template_id: campaign?.template_id || templateId || null,
    scheduled_at: campaign?.scheduled_at || null
  });
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [testEmail, setTestEmail] = useState('');

  const { createCampaign, updateCampaign, getCampaign } = useCampaigns();
  const { getTemplate } = useTemplates();
  const { getRecipientsBySegments } = useRecipients();

  // Załaduj szablon jeśli podano templateId
  useEffect(() => {
    const loadTemplate = async () => {
      if (templateId && !campaign) {
        try {
          const template = await getTemplate(templateId);
          if (template) {
            setFormData(prev => ({
              ...prev,
              subject: template.subject,
              html_content: template.html_content,
              json_design: template.json_design || null,
              template_id: template.id
            }));
            // Jeśli szablon ma json_design, użyj kreatora wizualnego
            // W przeciwnym razie jeśli ma HTML, użyj edytora tekstu
            if (!editorModeInitialized) {
              if (template.json_design && Array.isArray(template.json_design) && template.json_design.length > 0) {
                setEditorMode('dragdrop');
              } else if (template.html_content) {
                setEditorMode('richtext');
              }
              setEditorModeInitialized(true);
            }
          }
        } catch (err) {
          console.error('Error loading template:', err);
        }
      }
    };
    loadTemplate();
  }, [templateId, campaign, getTemplate]);

  // Załaduj istniejącą kampanię (tylko raz przy pierwszym renderze)
  useEffect(() => {
    const loadCampaign = async () => {
      if (campaign?.id && !formDataInitialized) {
        try {
          const fullCampaign = await getCampaign(campaign.id);
          if (fullCampaign) {
            setFormData({
              name: fullCampaign.name,
              subject: fullCampaign.subject,
              html_content: fullCampaign.html_content,
              json_design: fullCampaign.json_design || null,
              template_id: fullCampaign.template_id,
              scheduled_at: fullCampaign.scheduled_at
            });
            setFormDataInitialized(true);
            // Załaduj segmenty
            if (fullCampaign.segments) {
              setSelectedSegments(fullCampaign.segments.map(s => ({
                type: s.segment_type,
                id: s.segment_id || (s.segment_type === 'ministry' ? s.segment_name : null),
                name: s.segment_name
              })));
            }
            // Jeśli kampania ma json_design, użyj kreatora wizualnego
            // W przeciwnym razie jeśli ma HTML, użyj edytora tekstu
            if (!editorModeInitialized) {
              if (fullCampaign.json_design && Array.isArray(fullCampaign.json_design) && fullCampaign.json_design.length > 0) {
                setEditorMode('dragdrop');
              } else if (fullCampaign.html_content) {
                setEditorMode('richtext');
              }
              setEditorModeInitialized(true);
            }
          }
        } catch (err) {
          console.error('Error loading campaign:', err);
        }
      }
    };
    loadCampaign();
  }, [campaign?.id, getCampaign, formDataInitialized, editorModeInitialized]);

  const handleSave = async (status = 'draft') => {
    try {
      setSaving(true);

      const campaignData = {
        ...formData,
        status
      };

      let savedCampaign;

      if (campaign?.id) {
        savedCampaign = await updateCampaign(campaign.id, campaignData);
      } else {
        savedCampaign = await createCampaign(campaignData);
      }

      // Zapisz segmenty
      await saveSegments(savedCampaign.id, selectedSegments);

      // Dodaj odbiorców
      const recipients = getRecipientsBySegments([
        ...selectedSegments,
        ...(selectedEmails.length > 0 ? [{ type: 'custom', emails: selectedEmails.map(e => e.email) }] : [])
      ]);

      if (recipients.length > 0) {
        await supabase
          .from('email_campaign_recipients')
          .delete()
          .eq('campaign_id', savedCampaign.id);

        const recipientsToInsert = recipients.map(r => ({
          campaign_id: savedCampaign.id,
          email: r.email,
          full_name: r.full_name || r.name || null,
          status: 'pending'
        }));

        await supabase
          .from('email_campaign_recipients')
          .insert(recipientsToInsert);
      }

      onSave?.();
    } catch (err) {
      console.error('Error saving campaign:', err);
      alert('Błąd podczas zapisywania maila');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!confirm('Czy na pewno chcesz wysłać tego maila? Ta operacja jest nieodwracalna.')) {
      return;
    }

    try {
      setSaving(true);

      const campaignData = {
        ...formData,
        status: 'sending'
      };

      let savedCampaign;

      if (campaign?.id) {
        savedCampaign = await updateCampaign(campaign.id, campaignData);
      } else {
        savedCampaign = await createCampaign(campaignData);
      }

      await saveSegments(savedCampaign.id, selectedSegments);

      const recipients = getRecipientsBySegments([
        ...selectedSegments,
        ...(selectedEmails.length > 0 ? [{ type: 'custom', emails: selectedEmails.map(e => e.email) }] : [])
      ]);

      if (recipients.length > 0) {
        await supabase
          .from('email_campaign_recipients')
          .delete()
          .eq('campaign_id', savedCampaign.id);

        const recipientsToInsert = recipients.map(r => ({
          campaign_id: savedCampaign.id,
          email: r.email,
          full_name: r.full_name || r.name || null,
          status: 'pending'
        }));

        const { error: recipientsError } = await supabase
          .from('email_campaign_recipients')
          .insert(recipientsToInsert);

        if (recipientsError) throw recipientsError;
      }

      try {
        const { data, error } = await supabase.functions.invoke('send-mailing-campaign', {
          body: { campaign_id: savedCampaign.id }
        });

        if (error) {
          await updateCampaign(savedCampaign.id, { status: 'scheduled' });
          alert(`Edge Function nie jest dostępna. Mail został zapisany jako zaplanowany.`);
          onSave?.();
          return;
        }

        alert(`Mail wysłany! Wysłano: ${data?.batch_results?.sent || 0}, Błędy: ${data?.batch_results?.failed || 0}`);
        onSave?.();
      } catch (funcError) {
        await updateCampaign(savedCampaign.id, { status: 'scheduled' });
        alert(`Edge Function nie jest dostępna. Mail został zapisany jako zaplanowany.`);
        onSave?.();
      }
    } catch (err) {
      console.error('Error sending campaign:', err);
      alert('Błąd podczas wysyłania maila');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Wprowadź poprawny adres email');
      return;
    }

    try {
      setSaving(true);

      // Zapisz kampanię tymczasowo jako szkic
      const campaignData = { ...formData, status: 'draft' };
      let savedCampaign;

      if (campaign?.id) {
        savedCampaign = await updateCampaign(campaign.id, campaignData);
      } else {
        savedCampaign = await createCampaign(campaignData);
      }

      // Wyślij testowy email
      const { data, error } = await supabase.functions.invoke('send-mailing-campaign', {
        body: {
          campaign_id: savedCampaign.id,
          test_email: testEmail,
          batch_size: 1
        }
      });

      if (error) {
        alert(`Błąd wysyłki testowej: ${error.message}`);
      } else {
        alert(`Email testowy wysłany na: ${testEmail}`);
        setShowTestSend(false);
      }
    } catch (err) {
      alert('Błąd podczas wysyłania testowego emaila');
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!formData.scheduled_at) {
      alert('Wybierz datę i godzinę wysyłki');
      return;
    }

    try {
      setSaving(true);
      await handleSave('scheduled');
      alert(`Mail zaplanowany na: ${new Date(formData.scheduled_at).toLocaleString('pl-PL')}`);
      setShowSchedule(false);
    } catch (err) {
      alert('Błąd podczas planowania maila');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.name.trim() && formData.subject.trim();
      case 1:
        return formData.html_content.trim();
      case 2:
        return selectedSegments.length > 0 || selectedEmails.length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const totalRecipients = getRecipientsBySegments([
    ...selectedSegments,
    ...(selectedEmails.length > 0 ? [{ type: 'custom', emails: selectedEmails.map(e => e.email) }] : [])
  ]).length;

  return (
    <div className="space-y-8">
      {/* Nagłówek - identyczny styl jak inne moduły */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
          >
            <X size={20} className="text-gray-500" />
          </button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
            {campaign ? 'Edytuj mail' : 'Nowy mail'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTestSend(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
            title="Wyślij email testowy"
          >
            <TestTube size={16} />
            <span className="hidden sm:inline">Test</span>
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
          >
            <Eye size={16} />
            <span className="hidden sm:inline">Podgląd</span>
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all disabled:opacity-50"
          >
            {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="hidden sm:inline">Zapisz</span>
          </button>
        </div>
      </div>

      {/* Steps - Modern stepper */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-2 inline-flex gap-2 flex-wrap">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isLast = index === STEPS.length - 1;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => setCurrentStep(index)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-md'
                    : isCompleted
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all ${
                  isActive
                    ? 'bg-white/20'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  {isCompleted ? <Check size={14} /> : <StepIcon size={14} />}
                </span>
                {step.label}
              </button>
              {!isLast && (
                <ChevronRight size={16} className={`flex-shrink-0 self-center ${
                  isCompleted ? 'text-emerald-400' : 'text-gray-300 dark:text-gray-600'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Zawartość - identyczny styl jak inne moduły */}
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[50] transition-colors duration-300">
        {/* Step 0: Basics */}
        {currentStep === 0 && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 p-8">
            <div className="space-y-8">
              {/* Campaign name */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <FileText size={12} className="text-white" />
                  </div>
                  Nazwa maila
                  <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="np. Newsletter grudniowy"
                  className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all text-gray-900 dark:text-white placeholder-gray-400"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  Nazwa wewnętrzna, nie będzie widoczna dla odbiorców
                </p>
              </div>

              {/* Subject line */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <Mail size={12} className="text-white" />
                  </div>
                  Temat wiadomości
                  <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="np. Zaproszenie na spotkanie wigilijne"
                  className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all text-gray-900 dark:text-white placeholder-gray-400"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  Temat, który odbiorcy zobaczą w skrzynce
                </p>
              </div>

              {/* Editor mode selection */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <Edit3 size={12} className="text-white" />
                  </div>
                  Wybierz sposób tworzenia treści
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {Object.values(EDITOR_MODES).map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = editorMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setEditorMode(mode.id)}
                        className={`group relative p-5 rounded-2xl border-2 transition-all duration-300 text-left ${
                          isSelected
                            ? 'border-pink-500 bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 shadow-lg shadow-pink-500/20'
                            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-pink-300 dark:hover:border-pink-700 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center">
                              <Check size={12} className="text-white" />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`p-3 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-gradient-to-br from-pink-500 to-orange-500 shadow-lg shadow-pink-500/30'
                              : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-pink-100 dark:group-hover:bg-pink-900/30'
                          }`}>
                            <Icon size={20} className={isSelected ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-pink-500'} />
                          </div>
                        </div>
                        <h4 className={`font-semibold mb-1 transition-colors ${
                          isSelected ? 'text-pink-600 dark:text-pink-400' : 'text-gray-900 dark:text-white'
                        }`}>
                          {mode.label}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                          {mode.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Content */}
        {currentStep === 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
            {editorMode === 'dragdrop' && (
              <DragDropEmailBuilder
                content={formData.html_content}
                jsonBlocks={formData.json_design}
                onChange={(html) => setFormData(prev => ({ ...prev, html_content: html }))}
                onBlocksChange={(blocks) => setFormData(prev => ({ ...prev, json_design: blocks }))}
              />
            )}

            {editorMode === 'richtext' && (
              <div className="p-6">
                <EmailEditor
                  content={formData.html_content}
                  onChange={(html) => setFormData(prev => ({ ...prev, html_content: html }))}
                  placeholder="Napisz treść wiadomości..."
                />
              </div>
            )}

            {editorMode === 'html' && (
              <div className="p-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Kod HTML
                </label>
                <textarea
                  value={formData.html_content}
                  onChange={(e) => setFormData(prev => ({ ...prev, html_content: e.target.value }))}
                  rows={20}
                  className="w-full px-4 py-3 font-mono text-sm bg-gray-900 text-green-400 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  placeholder="<!DOCTYPE html>..."
                />
              </div>
            )}
          </div>
        )}

        {/* Step 2: Recipients */}
        {currentStep === 2 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-6">
            <RecipientSelector
              selectedSegments={selectedSegments}
              onChange={setSelectedSegments}
              selectedEmails={selectedEmails}
              onEmailsChange={setSelectedEmails}
            />
          </div>
        )}

        {/* Step 3: Summary */}
        {currentStep === 3 && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 p-8">
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl shadow-lg">
                  <CheckCircle size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Podsumowanie maila
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Sprawdź szczegóły przed wysyłką
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SummaryCard label="Nazwa maila" value={formData.name} icon={FileText} />
                <SummaryCard label="Temat wiadomości" value={formData.subject} icon={Mail} />
                <SummaryCard label="Liczba odbiorców" value={`${totalRecipients} osób`} icon={Users} highlight />
                <SummaryCard
                  label="Segmenty"
                  value={selectedSegments.map(s => s.name || s.type).join(', ') || 'Brak'}
                  icon={Users}
                />
              </div>

              {/* Preview */}
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <Eye size={12} className="text-white" />
                  </div>
                  Podgląd wiadomości
                </h4>
                <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto shadow-inner">
                  <div
                    className="p-6 bg-white dark:bg-gray-900"
                    dangerouslySetInnerHTML={{ __html: formData.html_content }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
                <button
                  onClick={() => handleSave('draft')}
                  disabled={saving}
                  className="group flex items-center justify-center gap-2 px-6 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all disabled:opacity-50"
                >
                  <Save size={18} className="group-hover:text-pink-500 transition-colors" />
                  Zapisz jako szkic
                </button>
                <button
                  onClick={() => setShowSchedule(true)}
                  disabled={saving || totalRecipients === 0}
                  className="group flex items-center justify-center gap-2 px-6 py-3.5 border-2 border-pink-500 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-xl transition-all disabled:opacity-50"
                >
                  <Calendar size={18} />
                  Zaplanuj wysyłkę
                </button>
                <button
                  onClick={handleSend}
                  disabled={saving || totalRecipients === 0}
                  className="group flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                >
                  {saving ? <Loader size={18} className="animate-spin" /> : <Send size={18} className="group-hover:translate-x-0.5 transition-transform" />}
                  Wyślij teraz ({totalRecipients})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        {currentStep < 3 && (
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className="group flex items-center gap-2 px-6 py-3.5 text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all border border-gray-200/50 dark:border-gray-700/50 hover:shadow-md disabled:opacity-50 disabled:hover:bg-white/80"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              Wstecz
            </button>
            <button
              onClick={() => setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))}
              disabled={!canProceed()}
              className="group flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              Dalej
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}
      </section>

      {/* Preview Modal */}
      {showPreview && (
        <CampaignPreview
          subject={formData.subject}
          htmlContent={formData.html_content}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Test Send Modal */}
      {showTestSend && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-pink-500 to-orange-500 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                    <TestTube size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Wyślij email testowy
                    </h3>
                    <p className="text-sm text-white/80">
                      Sprawdź przed wysyłką
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTestSend(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Wyślij testową wersję emaila na wskazany adres, aby sprawdzić jak będzie wyglądać przed wysłaniem do odbiorców.
              </p>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Adres email
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="twoj@email.pl"
                className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all mb-6"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setShowTestSend(false)}
                  className="flex-1 px-5 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all font-medium"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleTestSend}
                  disabled={saving || !testEmail}
                  className="group flex-1 px-5 py-3.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 font-medium shadow-lg shadow-pink-500/30 hover:shadow-xl transition-all"
                >
                  {saving ? <Loader size={16} className="animate-spin" /> : <Mail size={16} className="group-hover:scale-110 transition-transform" />}
                  Wyślij test
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Calendar size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Zaplanuj wysyłkę
                    </h3>
                    <p className="text-sm text-white/80">
                      Automatyczna wysyłka
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSchedule(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Wybierz datę i godzinę, o której mail zostanie automatycznie wysłany do {totalRecipients} odbiorców.
              </p>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data i godzina wysyłki
              </label>
              <input
                type="datetime-local"
                value={formData.scheduled_at ? formData.scheduled_at.slice(0, 16) : ''}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all mb-6"
              />

              {formData.scheduled_at && (
                <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200/50 dark:border-amber-800/50">
                  <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <Clock size={14} />
                    Mail zostanie wysłany: <strong>{new Date(formData.scheduled_at).toLocaleString('pl-PL')}</strong>
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSchedule(false)}
                  className="flex-1 px-5 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all font-medium"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSchedule}
                  disabled={saving || !formData.scheduled_at}
                  className="group flex-1 px-5 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 font-medium shadow-lg shadow-amber-500/30 hover:shadow-xl transition-all"
                >
                  {saving ? <Loader size={16} className="animate-spin" /> : <Clock size={16} className="group-hover:scale-110 transition-transform" />}
                  Zaplanuj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`p-5 rounded-2xl transition-all ${
      highlight
        ? 'bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 border border-pink-200/50 dark:border-pink-800/50'
        : 'bg-gray-50/80 dark:bg-gray-900/50 border border-gray-200/50 dark:border-gray-700/50'
    }`}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={`p-2 rounded-lg ${
            highlight
              ? 'bg-gradient-to-br from-pink-500 to-orange-500'
              : 'bg-gray-200 dark:bg-gray-700'
          }`}>
            <Icon size={14} className={highlight ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
          <p className={`font-semibold truncate ${
            highlight ? 'text-pink-600 dark:text-pink-400' : 'text-gray-900 dark:text-white'
          }`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
