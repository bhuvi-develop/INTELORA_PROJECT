import { useSnapshot } from '@/engine/store';
import { ArrowLeft, MonitorSmartphone } from 'lucide-react';
import { SectionHeader } from '@/components/common';
import { AssetStatusMatrix, RiskDistributionBar } from '@/components/charts';

export const TotalAssetsWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { assets } = useSnapshot();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Total Assets Workspace</h1>
      </div>
      
      <SectionHeader title="Asset Distribution" subtitle="What assets exist in the organization" />
      
      <div className="grid gap-4 md:grid-cols-2">
        <RiskDistributionBar title="Asset Categories" subtitle="Distribution by category" eyebrow="Summary" icon={MonitorSmartphone} assets={assets} criticalByAsset={{}} />
        <AssetStatusMatrix title="Asset Status" subtitle="Status Overview" eyebrow="Status" icon={MonitorSmartphone} assets={assets} />
      </div>
    </div>
  );
};
