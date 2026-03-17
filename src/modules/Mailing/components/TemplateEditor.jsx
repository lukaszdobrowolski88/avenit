import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Save, Eye, FileText, Edit3, MousePointer, Code,
  Loader, Sparkles, Newspaper, Calendar, Megaphone, Heart, Gift,
  Bell, Users, Music, BookOpen, Check, ChevronRight
} from 'lucide-react';
import { useTemplates, TEMPLATE_CATEGORIES } from '../hooks/useTemplates';
import DragDropEmailBuilder from './DragDropEmailBuilder';
import EmailEditor from './EmailEditor';
import CampaignPreview from './CampaignPreview';

const CATEGORY_ICONS = {
  general: FileText,
  newsletter: Newspaper,
  event: Calendar,
  announcement: Megaphone,
  welcome: Heart,
  holiday: Gift,
  invitation: Bell,
  ministry: Users,
  worship: Music,
  study: BookOpen
};

const EXTENDED_CATEGORIES = {
  ...TEMPLATE_CATEGORIES,
  welcome: { label: 'Powitalne' },
  holiday: { label: 'Świąteczne' },
  invitation: { label: 'Zaproszenia' },
  ministry: { label: 'Służby' },
  worship: { label: 'Uwielbienie' },
  study: { label: 'Studium' }
};

const EDITOR_MODES = {
  dragdrop: { id: 'dragdrop', label: 'Kreator wizualny', icon: MousePointer, description: 'Przeciągnij i upuść gotowe elementy' },
  richtext: { id: 'richtext', label: 'Edytor tekstu', icon: Edit3, description: 'Klasyczny edytor z formatowaniem' },
  html: { id: 'html', label: 'Kod HTML', icon: Code, description: 'Dla zaawansowanych - edytuj surowy HTML' }
};

const STEPS = [
  { id: 'info', label: 'Informacje', icon: FileText },
  { id: 'content', label: 'Treść', icon: Edit3 }
];

export default function TemplateEditor({ template, onClose, onSave }) {
  const { createTemplate, updateTemplate } = useTemplates();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editorMode, setEditorMode] = useState('dragdrop');
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    html_content: '',
    json_design: null,
    category: 'general'
  });

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        subject: template.subject || '',
        html_content: template.html_content || '',
        json_design: template.json_design || null,
        category: template.category || 'general'
      });
      // Jeśli szablon ma json_design, użyj kreatora wizualnego
      // W przeciwnym razie jeśli ma HTML, użyj edytora tekstu
      if (template.json_design && Array.isArray(template.json_design) && template.json_design.length > 0) {
        setEditorMode('dragdrop');
      } else if (template.html_content) {
        setEditorMode('richtext');
      }
    }
  }, [template]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Podaj nazwę szablonu');
      setCurrentStep(0);
      return;
    }

    try {
      setSaving(true);

      if (template?.id && !template.is_system) {
        await updateTemplate(template.id, formData);
      } else {
        await createTemplate(formData);
      }

      onSave?.();
    } catch (err) {
      console.error('Error saving template:', err);
      alert('Błąd podczas zapisywania szablonu');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 0) {
      return formData.name.trim().length > 0;
    }
    return true;
  };

  const isSystemTemplate = template?.is_system;
  const isReadOnly = isSystemTemplate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
            {template?.id ? (isSystemTemplate ? 'Podgląd szablonu' : 'Edytuj szablon') : 'Nowy szablon'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {currentStep === 1 && (
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
            >
              <Eye size={18} />
              <span className="hidden sm:inline">Podgląd</span>
            </button>
          )}

          {!isSystemTemplate && currentStep === 1 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all shadow-lg shadow-pink-500/30 disabled:opacity-50 font-medium"
            >
              {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
              Zapisz szablon
            </button>
          )}
        </div>
      </div>

      {/* System template warning */}
      {isSystemTemplate && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Szablony systemowe nie mogą być edytowane. Użyj "Duplikuj" aby stworzyć własną wersję.
          </p>
        </div>
      )}

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-4">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = currentStep === index;
          const isCompleted = currentStep > index;

          return (
            <React.Fragment key={step.id}>
              {index > 0 && (
                <div className={`h-0.5 w-16 rounded-full transition-colors ${
                  isCompleted ? 'bg-pink-500' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
              <button
                onClick={() => !isReadOnly && setCurrentStep(index)}
                disabled={isReadOnly && index > currentStep}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30'
                    : isCompleted
                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${
                  isActive ? 'bg-white/20' : isCompleted ? 'bg-pink-200 dark:bg-pink-800' : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  {isCompleted ? (
                    <Check size={14} className={isActive ? 'text-white' : 'text-pink-600 dark:text-pink-400'} />
                  ) : (
                    <StepIcon size={14} className={isActive ? 'text-white' : ''} />
                  )}
                </div>
                <span className="font-medium hidden sm:inline">{step.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Content */}
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[50] transition-colors duration-300">
        {currentStep === 0 ? (
          /* Step 1: Information */
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 p-8">
            <div className="space-y-8">
              {/* Nazwa szablonu */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <FileText size={12} className="text-white" />
                  </div>
                  Nazwa szablonu
                  <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="np. Newsletter miesięczny"
                  disabled={isReadOnly}
                  className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  Nazwa wewnętrzna do identyfikacji szablonu
                </p>
              </div>

              {/* Temat */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <Edit3 size={12} className="text-white" />
                  </div>
                  Domyślny temat wiadomości
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="np. Aktualności z kościoła"
                  disabled={isReadOnly}
                  className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  Ten temat będzie używany jako domyślny przy tworzeniu maila z tego szablonu
                </p>
              </div>

              {/* Kategoria */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                    <Sparkles size={12} className="text-white" />
                  </div>
                  Kategoria szablonu
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {Object.entries(EXTENDED_CATEGORIES).map(([key, { label }]) => {
                    const Icon = CATEGORY_ICONS[key] || FileText;
                    const isSelected = formData.category === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => !isReadOnly && setFormData(prev => ({ ...prev, category: key }))}
                        disabled={isReadOnly}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-gradient-to-r from-pink-500/10 to-orange-500/10 border-2 border-pink-400 dark:border-pink-600 text-pink-600 dark:text-pink-400'
                            : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-2 border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-700'
                        } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Icon size={18} className={isSelected ? 'text-pink-500' : ''} />
                        <span className="font-medium">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tryb edytora */}
              {!isReadOnly && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                    <div className="p-1.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg">
                      <MousePointer size={12} className="text-white" />
                    </div>
                    Wybierz sposób tworzenia treści
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.values(EDITOR_MODES).map(mode => {
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
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-end mt-8">
              <button
                onClick={() => setCurrentStep(1)}
                disabled={!canProceed()}
                className="group flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                Dalej
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Content Editor */
          <div className="space-y-4">
            {/* Editor mode selector (compact) */}
            {!isReadOnly && (
              <div className="flex items-center justify-between bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-2">
                <div className="flex items-center gap-2">
                  {Object.values(EDITOR_MODES).map(mode => {
                    const Icon = mode.icon;
                    const isSelected = editorMode === mode.id;

                    return (
                      <button
                        key={mode.id}
                        onClick={() => setEditorMode(mode.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                          isSelected
                            ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon size={16} />
                        <span className="text-sm font-medium hidden sm:inline">{mode.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentStep(0)}
                  className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span className="text-sm">Wstecz</span>
                </button>
              </div>
            )}

            {/* Editor */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden shadow-sm">
              {editorMode === 'dragdrop' ? (
                <DragDropEmailBuilder
                  content={formData.html_content}
                  jsonBlocks={formData.json_design}
                  onChange={(html) => !isReadOnly && setFormData(prev => ({ ...prev, html_content: html }))}
                  onBlocksChange={(blocks) => !isReadOnly && setFormData(prev => ({ ...prev, json_design: blocks }))}
                />
              ) : editorMode === 'richtext' ? (
                <div className="p-6">
                  <EmailEditor
                    value={formData.html_content}
                    onChange={(html) => !isReadOnly && setFormData(prev => ({ ...prev, html_content: html }))}
                    readOnly={isReadOnly}
                  />
                </div>
              ) : (
                <div className="p-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Kod HTML
                  </label>
                  <textarea
                    value={formData.html_content}
                    onChange={(e) => !isReadOnly && setFormData(prev => ({ ...prev, html_content: e.target.value }))}
                    placeholder="<html>...</html>"
                    disabled={isReadOnly}
                    className="w-full h-[500px] px-4 py-3 bg-gray-900 text-green-400 font-mono text-sm border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none disabled:opacity-50"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Preview Modal */}
      {showPreview && (
        <CampaignPreview
          subject={formData.subject || 'Podgląd szablonu'}
          htmlContent={formData.html_content}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
