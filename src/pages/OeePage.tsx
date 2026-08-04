import { useState } from 'react';
import { PageHeader } from '@/components/common';
import { ExecutiveOverviewPanel } from '@/components/oee/ExecutiveOverviewPanel';
import { FleetIntelligencePanel } from '@/components/oee/FleetIntelligencePanel';
import { OeeAnalyticsPanel } from '@/components/oee/OeeAnalyticsPanel';
import { DeviceIntelligencePanel } from '@/components/oee/DeviceIntelligencePanel';
import { SessionIntelligencePanel } from '@/components/oee/SessionIntelligencePanel';
import { AiInsightsPanel } from '@/components/oee/AiInsightsPanel';
import { cn } from '@/lib/cn';

type SectionType = 'overview' | 'fleet' | 'analytics' | 'devices' | 'sessions' | 'ai';

export const OeePage = () => {
  const [activeSection, setActiveSection] = useState<SectionType>('overview');

  const tabs = [
    { id: 'overview', label: 'Executive Overview' },
    { id: 'fleet', label: 'Fleet Intelligence' },
    { id: 'analytics', label: 'OEE Analytics' },
    { id: 'devices', label: 'Device Intelligence' },
    { id: 'sessions', label: 'Session Intelligence' },
    { id: 'ai', label: 'AI Intelligence' },
  ] as const;

  return (
    <div className="flex h-full flex-col bg-bg">
      <PageHeader 
        title="Operational Intelligence" 
        subtitle="AI-powered operational efficiency and fleet analytics" 
      />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-8">
          
          {/* Navigation Tabs */}
          <div className="flex space-x-1 rounded-xl bg-surface-alt/30 p-1">
             {tabs.map(tab => (
               <button
                 key={tab.id}
                 onClick={() => setActiveSection(tab.id as SectionType)}
                 className={cn(
                   "flex-1 rounded-lg py-2.5 text-sm font-medium transition-all",
                   activeSection === tab.id 
                     ? "bg-surface text-fg shadow-sm" 
                     : "text-fg-soft hover:bg-surface-alt/50 hover:text-fg"
                 )}
               >
                 {tab.label}
               </button>
             ))}
          </div>

          {/* Section Content */}
          <div className="mt-6">
            {activeSection === 'overview' && <ExecutiveOverviewPanel />}
            {activeSection === 'fleet' && <FleetIntelligencePanel />}
            {activeSection === 'analytics' && <OeeAnalyticsPanel />}
            {activeSection === 'devices' && <DeviceIntelligencePanel />}
            {activeSection === 'sessions' && <SessionIntelligencePanel />}
            {activeSection === 'ai' && <AiInsightsPanel />}
          </div>

        </div>
      </div>
    </div>
  );
};
