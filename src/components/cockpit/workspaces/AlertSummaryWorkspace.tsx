import { useSnapshot } from '@/engine/store';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '@/components/common';
import { formatNumber } from '@/utils/format';

export const AlertSummaryWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { kpis, anomalies } = useSnapshot();
  const activeAlerts = anomalies.filter(a => a.status === 'Active').slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">Alert Summary Workspace</h1>
      </div>
      
      <SectionHeader title="Active Alerts" subtitle="What requires immediate attention?" />
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="text-2xl font-bold text-rose-500">{kpis.criticalAnomalies}</div>
          <div className="text-xs text-fg-muted uppercase mt-1">Critical</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="text-2xl font-bold text-amber-500">0</div>
          <div className="text-xs text-fg-muted uppercase mt-1">High</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="text-2xl font-bold text-yellow-400">0</div>
          <div className="text-xs text-fg-muted uppercase mt-1">Medium</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="text-2xl font-bold text-blue-400">0</div>
          <div className="text-xs text-fg-muted uppercase mt-1">Low</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="text-2xl font-bold text-fg">{kpis.activeAnomalies}</div>
          <div className="text-xs text-fg-muted uppercase mt-1">Unread</div>
        </div>
        <div className="p-4 bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl text-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="text-2xl font-bold text-fg-dim">0</div>
          <div className="text-xs text-fg-muted uppercase mt-1">Acknowledged</div>
        </div>
      </div>

      <div className="bg-ink-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <table className="w-full text-left text-sm text-fg-soft">
          <thead className="bg-white/5 text-fg text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Alert Title</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {activeAlerts.map(a => (
              <tr key={a.id} className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${a.severity === 'Critical' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {a.severity}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{a.title}</td>
                <td className="px-4 py-3 font-mono text-xs text-fg-muted">{a.assetId}</td>
                <td className="px-4 py-3">{a.status}</td>
              </tr>
            ))}
            {activeAlerts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fg-muted">No active alerts.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
