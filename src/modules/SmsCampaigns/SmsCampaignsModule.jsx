import React, { useState } from 'react';
import { MessageSquare, FileText, BarChart3 } from 'lucide-react';
import { useCampus } from '../../contexts/CampusContext';
import { useSmsCampaigns } from './hooks/useSmsCampaigns';
import CampaignList from './components/CampaignList';
import CampaignEditor from './components/CampaignEditor';
import CampaignStats from './components/CampaignStats';
import TemplateGallery from './components/TemplateGallery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import { useT } from '../../i18n';
import { formatPLN } from './utils/smsEncoding';

const TABS = [
  { id: 'campaigns', label: 'Kampanie', icon: MessageSquare },
  { id: 'templates', label: 'Szablony', icon: FileText },
  { id: 'stats', label: 'Statystyki', icon: BarChart3 },
];

export default function SmsCampaignsModule() {
  const t = useT();
  const [tab, setTab] = useState('campaigns');
  const [view, setView] = useState({ type: 'list' });
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [statsCampaign, setStatsCampaign] = useState(null);
  const [templateForNew, setTemplateForNew] = useState(null);

  const { selectedCampusId } = useCampus();
  const { campaigns, loading, fetchCampaigns } = useSmsCampaigns(selectedCampusId);

  const openNew = (template = null) => {
    setEditingCampaign(null);
    setTemplateForNew(template);
    setView({ type: 'edit' });
  };

  const openEdit = (campaign) => {
    setEditingCampaign(campaign);
    setTemplateForNew(null);
    setView({ type: 'edit' });
  };

  const openStats = (campaign) => {
    setStatsCampaign(campaign);
    setView({ type: 'stats' });
  };

  const closeView = () => {
    setView({ type: 'list' });
    setEditingCampaign(null);
    setStatsCampaign(null);
    setTemplateForNew(null);
    fetchCampaigns();
  };

  if (view.type === 'edit') {
    return (
      <div className="p-4 sm:p-6">
        <CampaignEditor
          campaign={editingCampaign}
          template={templateForNew}
          onClose={closeView}
        />
      </div>
    );
  }

  if (view.type === 'stats') {
    return (
      <div className="p-4 sm:p-6">
        <CampaignStats campaign={statsCampaign} onClose={closeView} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SMS Kampanie</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Twórz, planuj i analizuj kampanie SMS przez bramkę SMSAPI.pl.
        </p>
      </div>

      <ResponsiveTabs tabs={TABS.map((x) => ({ ...x, label: t(x.label) }))} activeTab={tab} onChange={setTab} />

      {tab === 'campaigns' && (
        loading ? (
          <div className="p-8 text-center text-gray-500">Ładowanie...</div>
        ) : (
          <CampaignList
            campaigns={campaigns}
            onEdit={openEdit}
            onNew={() => openNew()}
            onViewStats={openStats}
            onRefresh={fetchCampaigns}
          />
        )
      )}

      {tab === 'templates' && (
        <TemplateGallery onUseTemplate={(t) => { openNew(t); }} />
      )}

      {tab === 'stats' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.filter(c => c.status === 'sent').map(c => (
            <button
              key={c.id}
              onClick={() => openStats(c)}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-lg transition-all"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</h3>
              <p className="text-sm text-gray-500 truncate">Od: <span className="font-mono">{c.sender}</span></p>
              <div className="flex gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                <span>{c.recipient_count || 0} odbiorców</span>
                <span>·</span>
                <span>{c.delivered_count || 0} dostarcz.</span>
                <span>·</span>
                <span>{c.replied_count || 0} odp.</span>
                <span>·</span>
                <span>{formatPLN((c.total_cost || 0) * 0.16)}</span>
              </div>
            </button>
          ))}
          {campaigns.filter(c => c.status === 'sent').length === 0 && (
            <div className="col-span-full text-center text-gray-500 py-12">
              Brak wysłanych kampanii. Wyślij pierwszą, aby zobaczyć statystyki.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
