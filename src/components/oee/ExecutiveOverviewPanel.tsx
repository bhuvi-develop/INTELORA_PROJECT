import { Gauge, Zap, CheckCircle2, MonitorPlay, ShieldAlert, BrainCircuit } from 'lucide-react';
import { useAssetList, useFleetKpis } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { OEE_TARGET } from '@/engine/derive';
import { KpiCard } from '@/components/common';

export const ExecutiveOverviewPanel = () => {
  const assets = useAssetList();
  const kpis = useFleetKpis();

  // Derived metrics
  const chargingDevices = assets.filter(a => a.live.power > 0).length;
  const idleDevices = assets.filter(a => a.live.power === 0 && a.device.status === 'Online').length;
  const oeeGap = kpis.averageOee - OEE_TARGET;
  const isAboveTarget = oeeGap >= 0;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Fleet OEE"
          value={formatPercent(kpis.averageOee, 1)}
          icon={<Gauge />}
          trend={oeeGap}
          trendLabel={isAboveTarget ? "Above target" : "Below target"}
          intent={isAboveTarget ? "success" : "warning"}
        />
        <KpiCard
          title="Total Devices"
          value={formatNumber(kpis.totalAssets)}
          icon={<MonitorPlay />}
          trend={kpis.onlineAssets}
          trendLabel="Online currently"
          intent="neutral"
        />
        <KpiCard
          title="Active Charging Sessions"
          value={formatNumber(chargingDevices)}
          icon={<Zap />}
          trend={idleDevices}
          trendLabel="Idle devices"
          intent="primary"
        />
        <KpiCard
          title="Operational Status"
          value={kpis.criticalAssets > 0 ? 'At Risk' : 'Healthy'}
          icon={kpis.criticalAssets > 0 ? <ShieldAlert /> : <CheckCircle2 />}
          trend={kpis.criticalAssets}
          trendLabel="Critical devices"
          intent={kpis.criticalAssets > 0 ? "danger" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Status Distribution */}
        <Card className="col-span-1 p-5">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Fleet Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-fg-soft"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>Online</span>
              <span className="font-mono text-sm">{formatNumber(kpis.onlineAssets)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-fg-soft"><span className="h-2 w-2 rounded-full bg-amber-500"></span>Standby</span>
              <span className="font-mono text-sm">{formatNumber(kpis.standbyAssets)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-fg-soft"><span className="h-2 w-2 rounded-full bg-rose-500"></span>Offline</span>
              <span className="font-mono text-sm">{formatNumber(kpis.offlineAssets)}</span>
            </div>
          </div>
        </Card>

        {/* Target Achievement */}
        <Card className="col-span-1 p-5 flex flex-col justify-center items-center">
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-fg w-full text-left">Target Achievement</h3>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-4xl font-light tabular-nums text-fg mb-1">
              {formatPercent(Math.min(100, (kpis.averageOee / OEE_TARGET) * 100), 1)}
            </div>
            <div className="text-xs text-fg-soft">of {OEE_TARGET}% Fleet Benchmark</div>
          </div>
        </Card>

        {/* AI Executive Summary */}
        <div className="col-span-1 h-full">
          <Card className="h-full p-6 border-brand-400/[0.16] bg-gradient-to-br from-brand-500/[0.055] via-ink-800/70 to-ink-800/70 relative">
             <div className="flex items-center gap-3 mb-4">
                <BrainCircuit className="h-5 w-5 text-brand-300" />
                <h3 className="font-semibold text-brand-100">AI Executive Summary</h3>
             </div>
             <div className="space-y-4">
               <div className="text-sm leading-relaxed text-brand-100/90 flex gap-3">
                 <div className="h-1.5 w-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                 Fleet OEE improved by 2.3% today, currently operating at {formatPercent(kpis.averageOee, 1)}.
               </div>
               <div className="text-sm leading-relaxed text-brand-100/90 flex gap-3">
                 <div className="h-1.5 w-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                 Phone Chargers exceeded target performance due to high utilization during peak hours.
               </div>
               <div className="text-sm leading-relaxed text-brand-100/90 flex gap-3">
                 <div className="h-1.5 w-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                 Only {kpis.criticalAssets} chargers require immediate operational attention.
               </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
