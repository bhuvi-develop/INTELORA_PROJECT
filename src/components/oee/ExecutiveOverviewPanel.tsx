import { Gauge, Zap, CheckCircle2, MonitorPlay, ShieldAlert, BrainCircuit } from 'lucide-react';
import { useAssetList, useFleetKpis } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { RadialGauge } from '@/components/charts';
import { Badge } from '@/components/ui/Badge';
import { OEE_TARGET, OEE_WORLD_CLASS } from '@/engine/derive';
import { KpiCard } from '@/components/common';
import { motion } from 'framer-motion';

export const ExecutiveOverviewPanel = () => {
  const assets = useAssetList();
  const kpis = useFleetKpis();
  const { oee } = useSnapshot();

  // Derived metrics
  const chargingDevices = assets.filter(a => a.live.power > 0).length;
  const idleDevices = assets.filter(a => a.live.power === 0 && a.device.status === 'Online').length;
  const oeeGap = Number((kpis.averageOee - OEE_TARGET).toFixed(1));
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

      {/* OEE Factors (Interactive & Dynamic) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Fleet OEE', value: oee.oee, target: oee.target, color: oee.oee >= oee.target ? 'rgb(16 185 129)' : 'rgb(245 158 11)', desc: 'Overall equipment effectiveness across the fleet.' },
          { label: 'Availability', value: oee.availability, target: 90, color: 'rgb(59 130 246)', desc: 'Uptime vs Planned Production Time.' },
          { label: 'Performance', value: oee.performance, target: 95, color: 'rgb(99 102 241)', desc: 'Actual vs Maximum Possible Speed.' },
          { label: 'Quality', value: oee.quality, target: 99, color: 'rgb(168 85 247)', desc: 'Good parts vs Total parts produced.' },
        ].map((metric) => (
          <motion.div
            key={metric.label}
            whileHover={{ y: -8, scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex h-full"
          >
            <Card className="flex flex-col items-center justify-between p-6 text-center shadow-sm hover:shadow-lg transition-shadow border border-overlay/[0.04] w-full bg-gradient-to-b from-card to-card/50">
              <div className="flex-1 flex flex-col items-center justify-center w-full relative">
                <RadialGauge
                  label={metric.label}
                  value={metric.value}
                  target={metric.target}
                  color={metric.color}
                  unit="%"
                  size={160}
                />
                
                {metric.label === 'Fleet OEE' && (
                  <div className="mt-2 flex w-full justify-center">
                    <Badge tone={metric.value >= oee.worldClass ? "brand" : "neutral"} className="shadow-sm">
                      World Class: {oee.worldClass}%
                    </Badge>
                  </div>
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-line/40 w-full">
                <p className="text-[11px] text-fg-soft font-medium leading-relaxed">
                  {metric.desc}
                </p>
                <div className="mt-2 flex justify-between items-center text-[10px] uppercase tracking-wider text-fg-faint">
                  <span>Current: {metric.value.toFixed(1)}%</span>
                  <span>Target: {metric.target}%</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* AI Summary Banner & Condensed Status */}
      <Card className="flex flex-col md:flex-row items-center justify-between p-4 border-brand-400/[0.16] bg-gradient-to-r from-brand-500/[0.08] via-card to-card relative overflow-hidden">
         <div className="flex items-center gap-4 flex-1">
            <div className="h-10 w-10 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0">
               <BrainCircuit className="h-5 w-5 text-brand-400" />
            </div>
            <div>
               <h3 className="font-semibold text-brand-100 text-sm mb-1">AI Executive Summary</h3>
               <div className="text-xs text-brand-100/70 flex flex-wrap gap-x-4 gap-y-1">
                 <span>• Fleet OEE improved by 2.3% today.</span>
                 <span className="hidden sm:inline">• High utilization on Phone Chargers.</span>
                 <span className="hidden md:inline">• {kpis.criticalAssets > 0 ? `${kpis.criticalAssets} assets require immediate attention.` : 'All operational parameters normal.'}</span>
               </div>
            </div>
         </div>
         
         {/* Condensed Status Ticker */}
         <div className="flex gap-6 mt-4 md:mt-0 text-xs md:border-l border-line/40 md:pl-6 ml-2">
            <div className="flex flex-col items-center">
              <span className="text-emerald-400 font-mono font-medium text-sm">{kpis.onlineAssets}</span>
              <span className="text-fg-faint uppercase tracking-wider text-[10px]">Online</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-amber-400 font-mono font-medium text-sm">{kpis.standbyAssets}</span>
              <span className="text-fg-faint uppercase tracking-wider text-[10px]">Standby</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-rose-400 font-mono font-medium text-sm">{kpis.offlineAssets}</span>
              <span className="text-fg-faint uppercase tracking-wider text-[10px]">Offline</span>
            </div>
         </div>
      </Card>
    </div>
  );
};
