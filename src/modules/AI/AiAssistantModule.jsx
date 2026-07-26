import React, { useState } from 'react';
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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <Sparkles className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Asystent AI</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Materiały z kazań, pomoc w komunikacji i odpowiedzi na pytania — oparte na Claude
          </p>
        </div>
      </div>

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
