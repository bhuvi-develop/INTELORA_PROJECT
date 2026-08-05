import { useSnapshot } from '@/engine/store';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '@/components/common';
import { EnterpriseHeatmap } from '../EnterpriseHeatmap';

export const FleetHealthWorkspace = ({ onBack }: { onBack?: () => void }) => {
  const { kpis } = useSnapshot();

  return (
    <div className="space-y-6">
      {onBack && (
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-fg tracking-tight">Fleet Health Workspace</h1>
        </div>
      )}
      
      <SectionHeader title="Health Summary" subtitle="Executive overview of organizational health" />
      
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-6 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-sm font-semibold text-fg-muted mb-4">Fleet Health Score</h2>
          <div className="text-5xl font-bold text-emerald-400">{kpis.averageHealth.toFixed(1)}%</div>
        </div>
        <div className="p-6 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h2 className="text-sm font-semibold text-fg-muted mb-4">Health Distribution</h2>
          <div className="flex justify-between text-sm">
            <span className="text-emerald-400">{kpis.healthyAssets} Healthy</span>
            <span className="text-amber-400">{kpis.warningAssets} Warning</span>
            <span className="text-rose-500">{kpis.criticalAssets} Critical</span>
          </div>
        </div>
      </div>

      <SectionHeader title="Enterprise Heatmap" subtitle="Instant condition check" />
      <EnterpriseHeatmap />
    </div>
  );
};
