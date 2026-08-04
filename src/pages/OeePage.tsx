import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { OeeHub } from '@/components/oee/OeeHub';
import { FleetIntelligencePanel } from '@/components/oee/FleetIntelligencePanel';
import { OeeAnalyticsPanel } from '@/components/oee/OeeAnalyticsPanel';
import { DeviceIntelligencePanel } from '@/components/oee/DeviceIntelligencePanel';
import { SessionIntelligencePanel } from '@/components/oee/SessionIntelligencePanel';
import { FleetHealthWorkspace } from '@/components/cockpit';

type SectionType = 'hub' | 'fleet' | 'analytics' | 'devices' | 'sessions' | 'fleetHealth';

const WORKSPACE_TITLES: Record<Exclude<SectionType, 'hub'>, string> = {
  fleet: 'Fleet Intelligence',
  analytics: 'OEE Analytics',
  devices: 'Device Intelligence',
  sessions: 'Session Intelligence',
  fleetHealth: 'Fleet Health',
};

export const OeePage = () => {
  const [activeSection, setActiveSection] = useState<SectionType>('hub');

  const onBack = () => setActiveSection('hub');

  return (
    <div className="flex h-full flex-col bg-bg">
      <AnimatePresence mode="wait">
        {activeSection === 'hub' ? (
          <OeeHub key="hub" onOpen={(id) => setActiveSection(id as SectionType)} />
        ) : (
          <motion.div 
            key="workspace"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 overflow-y-auto px-6 py-8"
          >
            <div className="mx-auto max-w-7xl space-y-6">
              {activeSection !== 'fleetHealth' && (
                <div className="flex items-center gap-4">
                  <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <h1 className="text-2xl font-semibold text-fg tracking-tight">{WORKSPACE_TITLES[activeSection]}</h1>
                </div>
              )}

              <div className="mt-2">
                {activeSection === 'fleet' && <FleetIntelligencePanel />}
                {activeSection === 'analytics' && <OeeAnalyticsPanel />}
                {activeSection === 'devices' && <DeviceIntelligencePanel />}
                {activeSection === 'sessions' && <SessionIntelligencePanel />}
                {activeSection === 'fleetHealth' && <FleetHealthWorkspace onBack={onBack} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
