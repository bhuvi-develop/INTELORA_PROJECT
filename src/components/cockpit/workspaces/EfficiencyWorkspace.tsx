import { useSnapshot } from '@/engine/store';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '@/components/common';
import { formatPercent } from '@/utils/format';

export const EfficiencyWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { oee } = useSnapshot();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Efficiency Workspace</h1>
      </div>
      
      <SectionHeader title="Overall Equipment Efficiency" subtitle="How efficiently are assets operating?" />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="p-6 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wider">OEE</h2>
          <div className="text-4xl font-bold text-brand-400">{oee.oee.toFixed(1)}%</div>
        </div>
        <div className="p-6 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wider">Availability</h2>
          <div className="text-4xl font-bold text-emerald-400">{formatPercent(oee.availability)}</div>
        </div>
        <div className="p-6 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wider">Performance</h2>
          <div className="text-4xl font-bold text-emerald-400">{formatPercent(oee.performance)}</div>
        </div>
        <div className="p-6 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wider">Quality</h2>
          <div className="text-4xl font-bold text-emerald-400">{formatPercent(oee.quality)}</div>
        </div>
      </div>
    </div>
  );
};
