import { useMemo } from 'react';
import { useSnapshot } from '@/engine/store';

export const EnterpriseHeatmap = () => {
  const { assets } = useSnapshot();

  const groupedAssets = useMemo(() => {
    const groups: Record<string, typeof assets> = {};
    assets.forEach((asset) => {
      if (!groups[asset.device.category]) {
        groups[asset.device.category] = [];
      }
      groups[asset.device.category].push(asset);
    });
    return groups;
  }, [assets]);

  return (
    <div className="space-y-4">
      {Object.entries(groupedAssets).map(([category, categoryAssets]) => (
        <div key={category} className="p-4 bg-ink-900/60 rounded-xl border border-white/10 backdrop-blur-md">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[14px] font-semibold text-fg">{category}</span>
            <span className="text-[12px] text-fg-muted">{categoryAssets.length} Assets</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {categoryAssets.map((asset) => {
              const status = asset.health >= 95 ? 'healthy' : asset.health >= 80 ? 'good' : asset.health >= 65 ? 'warning' : 'critical';
              const color = status === 'healthy' ? 'bg-emerald-500' : status === 'good' ? 'bg-emerald-400' : status === 'warning' ? 'bg-amber-400' : 'bg-rose-500';
              return (
                <div
                  key={asset.device.assetId}
                  title={`${asset.device.assetName} - ${status} (${Math.round(asset.health)}%)`}
                  className={`h-6 w-3 ${color} rounded-[1px] opacity-90 hover:opacity-100 cursor-pointer transition-opacity`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
