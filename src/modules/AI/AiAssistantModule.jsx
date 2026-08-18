import React, { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { Sparkles, BookOpen, PenLine, MessageCircle } from 'lucide-react';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import SermonAssistantTab from './tabs/SermonAssistantTab';
import CommunicationTab from './tabs/CommunicationTab';
import AskDataTab from './tabs/AskDataTab';

const TABS = [
  { id: 'sermon', label: 'Asystent kazań', icon: BookOpen },
  { id: 'communication', label: 'Pomoc w komunikacji', icon: PenLine },
  { id: 'ask', label: 'Zapytaj o dane', icon: MessageCircle },
];

export default function AiAssistantModule() {
  const [activeTab, setActiveTab] = useState('sermon');

  return (
    <div className="space-y-6">
      <PageHeader moduleKey="ai" icon={Sparkles} title="Asystent AI" subtitle="Materiały z kazań, pomoc w komunikacji i odpowiedzi na pytania — oparte na Claude" />

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'sermon' && <SermonAssistantTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'ask' && <AskDataTab />}
      </div>
    </div>
  );
}
