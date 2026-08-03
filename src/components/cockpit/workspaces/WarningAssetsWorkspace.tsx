import { useSnapshot } from '@/engine/store';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '@/components/common';

export const WarningAssetsWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { assets } = useSnapshot();
  const warningAssets = assets.filter(a => a.health >= 65 && a.health < 80);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Warning Assets Workspace</h1>
      </div>
      
      <SectionHeader title="Warning Assets" subtitle="Assets showing degradation" />
      
      <div className="bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <table className="w-full text-left text-sm text-fg-soft">
          <thead className="bg-white/5 text-fg text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Component</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {warningAssets.map(a => (
              <tr key={a.device.assetId} className="border-b border-white/5">
                <td className="px-4 py-3 font-medium">{a.device.assetName}</td>
                <td className="px-4 py-3">Degrading Health ({Math.round(a.health)}%)</td>
                <td className="px-4 py-3">{a.prediction.primary.component}</td>
                <td className="px-4 py-3">Just now</td>
                <td className="px-4 py-3 text-amber-400">Warning</td>
              </tr>
            ))}
            {warningAssets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">No warning assets.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
