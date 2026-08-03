import { useSnapshot } from '@/engine/store';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '@/components/common';
import { EnergyIntelligencePanel } from '../EnergyIntelligencePanel';

export const EnergyWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { energy } = useSnapshot();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Energy Workspace</h1>
      </div>
      
      <SectionHeader title="Today's Energy" subtitle="How much energy was consumed today?" />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-xs uppercase text-fg-muted mb-2">Today's Consumption</h2>
          <div className="text-3xl font-bold text-fg">{energy.todayKwh.toFixed(2)} kWh</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-xs uppercase text-fg-muted mb-2">Yesterday Comparison</h2>
          <div className="text-3xl font-bold text-brand-400">{energy.yesterdayKwh.toFixed(2)} kWh</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-xs uppercase text-fg-muted mb-2">Peak Hour</h2>
          <div className="text-3xl font-bold text-fg">14:00</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-xs uppercase text-fg-muted mb-2">Highest Consumer</h2>
          <div className="text-3xl font-bold text-fg">HVAC-01</div>
        </div>
      </div>

      <EnergyIntelligencePanel />
    </div>
  );
};
