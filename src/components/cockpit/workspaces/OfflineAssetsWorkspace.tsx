import { useSnapshot } from '@/engine/store';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '@/components/common';

export const OfflineAssetsWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { assets } = useSnapshot();
  const offlineAssets = assets.filter(a => a.device.status === 'Offline');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Offline Assets Workspace</h1>
      </div>
      
      <SectionHeader title="Offline Assets" subtitle="Devices not reporting telemetry" />
      
      <div className="bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <table className="w-full text-left text-sm text-fg-soft">
          <thead className="bg-white/5 text-fg text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Offline Duration</th>
              <th className="px-4 py-3">Last Seen</th>
              <th className="px-4 py-3">Connection Status</th>
            </tr>
          </thead>
          <tbody>
            {offlineAssets.map(a => (
              <tr key={a.device.assetId} className="border-b border-white/5">
                <td className="px-4 py-3 font-medium">{a.device.assetName}</td>
                <td className="px-4 py-3">Unknown</td>
                <td className="px-4 py-3">Unknown</td>
                <td className="px-4 py-3 text-fg-muted">Offline</td>
              </tr>
            ))}
            {offlineAssets.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fg-muted">No offline assets.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
