import React, { useState } from 'react';
import { Mail, FileText, BarChart3, Plus, Loader } from 'lucide-react';
import { useCampaigns } from './hooks/useCampaigns';
import { useTemplates } from './hooks/useTemplates';
import CampaignList from './components/CampaignList';
import CampaignEditor from './components/CampaignEditor';
import TemplateGallery from './components/TemplateGallery';
import TemplateEditor from './components/TemplateEditor';
import CampaignStats from './components/CampaignStats';
import ResponsiveTabs from '../../components/ResponsiveTabs';

const TABS = [
  { id: 'campaigns', label: 'Maile', icon: Mail },
  { id: 'templates', label: 'Szablony', icon: FileText },
  { id: 'stats', label: 'Statystyki', icon: BarChart3 }
];

export default function MailingModule() {
  const [activeTab, setActiveTab] = useState('campaigns');
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  const { campaigns, loading, fetchCampaigns } = useCampaigns();
  const { fetchTemplates } = useTemplates();

  const handleNewCampaign = (templateId = null) => {
    setSelectedTemplateId(templateId);
    setEditingCampaign(null);
    setShowNewCampaign(true);
  };

  const handleEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setSelectedTemplateId(null);
    setShowNewCampaign(true);
  };

  const handleCloseEditor = () => {
    setShowNewCampaign(false);
    setEditingCampaign(null);
    setSelectedTemplateId(null);
    fetchCampaigns();
  };

  const handleViewStats = (campaign) => {
    setActiveTab('stats');
  };

  // Funkcje dla szablonów
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateEditor(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleCloseTemplateEditor = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  // Jeśli edytujemy szablon lub mail, pokaż odpowiedni edytor
  if (showTemplateEditor || showNewCampaign) {
    return (
      <div className="space-y-8">
        {showTemplateEditor ? (
          <TemplateEditor
            template={editingTemplate}
            onClose={handleCloseTemplateEditor}
            onSave={handleCloseTemplateEditor}
          />
        ) : (
          <CampaignEditor
            campaign={editingCampaign}
            templateId={selectedTemplateId}
            onClose={handleCloseEditor}
            onSave={handleCloseEditor}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Nagłówek - identyczny styl jak inne moduły */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Mailing
        </h1>
        <button
          onClick={() => handleNewCampaign()}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all font-medium shadow-lg shadow-pink-500/25 hover:shadow-xl hover:shadow-pink-500/30"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Nowy mail</span>
        </button>
      </div>

      {/* TAB NAVIGATION */}
      <ResponsiveTabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Zawartość - identyczny styl jak inne moduły */}
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[50] transition-colors duration-300">
        {loading && activeTab === 'campaigns' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader className="w-10 h-10 text-pink-500 animate-spin" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Ładowanie maili...</p>
          </div>
        ) : (
          <>
            {activeTab === 'campaigns' && (
              <CampaignList
                campaigns={campaigns}
                onEdit={handleEditCampaign}
                onRefresh={fetchCampaigns}
                onViewStats={handleViewStats}
              />
            )}

            {activeTab === 'templates' && (
              <TemplateGallery
                onSelectTemplate={handleNewCampaign}
                onEditTemplate={handleEditTemplate}
                onCreateTemplate={handleCreateTemplate}
              />
            )}

            {activeTab === 'stats' && (
              <CampaignStats campaigns={campaigns} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
