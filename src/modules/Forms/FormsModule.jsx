import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Plus,
  LayoutTemplate,
  BarChart3,
  ChevronLeft,
  Users,
  CreditCard
} from 'lucide-react';
import { useForms } from './hooks/useForms';
import { useFormResponses } from './hooks/useFormResponses';
import FormList from './components/FormList';
import FormBuilder from './components/FormBuilder/FormBuilder';
import TemplateLibrary from './components/TemplateLibrary';
import ResponsesView from './components/ResponsesView';
import ParticipantsView from './components/ParticipantsView';
import PaymentsView from './components/PaymentsView';
import EmbedCodeGenerator from './components/EmbedCodeGenerator';
import { BUILT_IN_TEMPLATES, DEFAULT_FORM_SETTINGS } from './utils/fieldTypes';

export default function FormsModule({ userEmail }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('forms');
  const [editingForm, setEditingForm] = useState(null);
  const [viewingResponses, setViewingResponses] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [embedForm, setEmbedForm] = useState(null);

  const {
    forms,
    loading,
    fetchForms,
    fetchTemplates,
    createForm,
    updateForm,
    deleteForm,
    duplicateForm,
    publishForm,
    unpublishForm,
    closeForm,
    archiveForm,
    restoreForm,
    saveAsTemplate,
    createFromTemplate
  } = useForms(userEmail);

  useEffect(() => {
    fetchForms();
    loadTemplates();
  }, [fetchForms]);

  useEffect(() => {
    const formId = searchParams.get('edit');
    const responsesId = searchParams.get('responses');

    if (formId) {
      const form = forms.find(f => f.id === formId);
      if (form) {
        setEditingForm(form);
      }
    }

    if (responsesId) {
      const form = forms.find(f => f.id === responsesId);
      if (form) {
        setViewingResponses(form);
      }
    }
  }, [searchParams, forms]);

  const loadTemplates = async () => {
    const dbTemplates = await fetchTemplates();
    setTemplates([...BUILT_IN_TEMPLATES, ...dbTemplates]);
  };

  const handleCreateForm = async () => {
    const result = await createForm({
      title: 'Nowy formularz',
      description: '',
      fields: [],
      settings: DEFAULT_FORM_SETTINGS
    });

    if (result.success) {
      setEditingForm(result.data);
      setSearchParams({ edit: result.data.id });
    }
  };

  const handleEditForm = (form) => {
    setEditingForm(form);
    setSearchParams({ edit: form.id });
  };

  const handleSaveForm = async (formData) => {
    if (editingForm?.id) {
      const result = await updateForm(editingForm.id, formData);
      if (result.success) {
        setEditingForm(result.data);
      }
      return result;
    }
    return { success: false };
  };

  const handleCloseBuilder = () => {
    setEditingForm(null);
    setSearchParams({});
    fetchForms();
  };

  const handleDeleteForm = async (formId) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten formularz? Wszystkie odpowiedzi zostaną usunięte.')) {
      await deleteForm(formId);
    }
  };

  const handleDuplicateForm = async (formId) => {
    await duplicateForm(formId);
  };

  const handlePublishForm = async (formId) => {
    await publishForm(formId);
  };

  const handleUnpublishForm = async (formId) => {
    await unpublishForm(formId);
  };

  const handleCloseForm = async (formId) => {
    await closeForm(formId);
  };

  const handleArchiveForm = async (formId) => {
    await archiveForm(formId);
  };

  const handleRestoreForm = async (formId) => {
    await restoreForm(formId);
  };

  const handleViewResponses = (form) => {
    setViewingResponses(form);
    setSearchParams({ responses: form.id });
  };

  const handleCloseResponses = () => {
    setViewingResponses(null);
    setSearchParams({});
  };

  const handleSelectTemplate = async (template) => {
    const result = await createFromTemplate(template);
    if (result.success) {
      setActiveTab('forms');
      setEditingForm(result.data);
      setSearchParams({ edit: result.data.id });
    }
  };

  const handleSaveAsTemplate = async (formId, category) => {
    const result = await saveAsTemplate(formId, category);
    if (result.success) {
      loadTemplates();
    }
    return result;
  };

  const handleEmbed = (form) => {
    setEmbedForm(form);
  };

  const handleCloseEmbed = () => {
    setEmbedForm(null);
  };

  if (editingForm) {
    return (
      <FormBuilder
        form={editingForm}
        onSave={handleSaveForm}
        onClose={handleCloseBuilder}
        onPublish={() => handlePublishForm(editingForm.id)}
        onUnpublish={() => handleUnpublishForm(editingForm.id)}
      />
    );
  }

  if (viewingResponses) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            onClick={handleCloseResponses}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ChevronLeft size={20} />
            Powrót do listy
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-2">
            Odpowiedzi: {viewingResponses.title}
          </h2>
        </div>
        <div className="flex-1 overflow-auto">
          <ResponsesView form={viewingResponses} />
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'forms', label: 'Formularze', icon: FileText },
    { id: 'participants', label: 'Uczestnicy', icon: Users },
    { id: 'payments', label: 'Płatności', icon: CreditCard },
    { id: 'templates', label: 'Szablony', icon: LayoutTemplate }
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-pink-50/50 via-white to-orange-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-500 bg-clip-text text-transparent">
              Formularze
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Twórz formularze i zbieraj odpowiedzi
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateForm}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-pink-500/25 transition-all"
            >
              <Plus size={18} />
              Nowy formularz
            </button>
          </div>
        </div>

        <div className="flex gap-1 mt-4 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {activeTab === 'forms' && (
          <FormList
            forms={forms}
            loading={loading}
            onEdit={handleEditForm}
            onDelete={handleDeleteForm}
            onDuplicate={handleDuplicateForm}
            onPublish={handlePublishForm}
            onUnpublish={handleUnpublishForm}
            onClose={handleCloseForm}
            onArchive={handleArchiveForm}
            onRestore={handleRestoreForm}
            onViewResponses={handleViewResponses}
            onSaveAsTemplate={handleSaveAsTemplate}
            onEmbed={handleEmbed}
          />
        )}

        {activeTab === 'participants' && (
          <ParticipantsView forms={forms} />
        )}

        {activeTab === 'payments' && (
          <PaymentsView forms={forms} />
        )}

        {activeTab === 'templates' && (
          <TemplateLibrary
            templates={templates}
            onSelectTemplate={handleSelectTemplate}
          />
        )}
      </div>

      {/* Embed Code Generator Modal */}
      <EmbedCodeGenerator
        formId={embedForm?.id}
        formTitle={embedForm?.title}
        isOpen={!!embedForm}
        onClose={handleCloseEmbed}
      />
    </div>
  );
}
