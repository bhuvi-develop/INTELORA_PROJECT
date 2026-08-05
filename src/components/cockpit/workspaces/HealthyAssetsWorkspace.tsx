import { useSnapshot } from '@/engine/store';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { SectionHeader } from '@/components/common';
import { AssetStatusMatrix } from '@/components/charts';

export const HealthyAssetsWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { assets } = useSnapshot();
  const healthyAssets = assets.filter(a => a.health >= 95);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Healthy Assets Workspace</h1>
      </div>
      
      <SectionHeader title="Healthy Devices" subtitle="Devices performing optimally" />
      
      <AssetStatusMatrix title="Healthy Overview" subtitle="Status" eyebrow="Health" icon={ShieldCheck} assets={healthyAssets} />
    </div>
  );
};
