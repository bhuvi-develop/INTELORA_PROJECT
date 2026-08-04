import { Zap, BatteryCharging } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AreaTrend, RadialGauge } from '@/components/charts';
import { useMemo } from 'react';

export interface DeviceProfileDrawerProps {
  asset: AssetRuntime | null;
  onClose: () => void;
}

export const DeviceProfileDrawer = ({ asset, onClose }: DeviceProfileDrawerProps) => {
  const oeeTrend = useMemo(() => {
    if (!asset) return [];
    const base = asset.performance.oee;
    return Array.from({ length: 12 }).map((_, i) => ({
      time: `${12 - i}h ago`,
      oee: Math.max(60, base - 5 + Math.random() * 10)
    }));
  }, [asset]);

  if (!asset) {
    return <Modal open={false} onClose={onClose} title=""><div/></Modal>;
  }

  const { device, performance, live } = asset;
  
  return (
    <Modal open={true} onClose={onClose} title={device.assetName} subtitle={`Device ID: ${device.assetId}`}>
      <div className="flex flex-col h-full bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 bg-surface-alt/30">
          <div>
            <div className="flex items-center gap-3 mt-1.5">
              <Badge tone="neutral" className="text-[10px] uppercase">
                {device.category}
              </Badge>
              <Badge tone={device.status === 'Online' ? 'good' : 'neutral'}>{device.status}</Badge>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Identity & Status */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-fg-soft mb-1 text-xs uppercase tracking-wider">Current Power</div>
              <div className="font-mono text-fg flex items-center gap-1.5 text-emerald-400">
                <Zap className="h-4 w-4" /> {formatNumber(live.power)} W
              </div>
            </div>
            <div>
              <div className="text-fg-soft mb-1 text-xs uppercase tracking-wider">Session Status</div>
              <div className="font-medium text-fg flex items-center gap-1.5">
                <BatteryCharging className="h-4 w-4 text-emerald-400" />
                {live.power > 0 ? 'Charging Active' : 'Idle'}
              </div>
            </div>
          </div>

          {/* OEE Radial */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Device Effectiveness</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 flex flex-col items-center p-4 bg-surface-alt/20 rounded-xl border border-border/50">
                 <RadialGauge 
                   label="OEE"
                   value={performance.oee}
                   target={85}
                   color="rgb(16 185 129)"
                   size={100}
                   unit="%"
                 />
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="flex flex-col justify-center p-4 bg-surface-alt/20 rounded-xl border border-border/50">
                   <div className="text-xs text-fg-soft mb-1">Availability</div>
                   <div className="text-xl font-semibold text-fg">{formatPercent(performance.availability, 1)}</div>
                </div>
                <div className="flex flex-col justify-center p-4 bg-surface-alt/20 rounded-xl border border-border/50">
                   <div className="text-xs text-fg-soft mb-1">Performance</div>
                   <div className="text-xl font-semibold text-fg">{formatPercent(performance.performance, 1)}</div>
                </div>
                <div className="flex flex-col justify-center p-4 bg-surface-alt/20 rounded-xl border border-border/50">
                   <div className="text-xs text-fg-soft mb-1">Quality</div>
                   <div className="text-xl font-semibold text-fg">{formatPercent(performance.quality, 1)}</div>
                </div>
                <div className="flex flex-col justify-center p-4 bg-surface-alt/20 rounded-xl border border-border/50">
                   <div className="text-xs text-fg-soft mb-1">Average Energy</div>
                   <div className="text-xl font-semibold text-fg">1.2 kWh</div>
                </div>
              </div>
            </div>
          </div>

          {/* Trend */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">OEE Trend (12h)</h3>
            <div className="h-48 border border-border/50 rounded-xl p-4 bg-surface-alt/20">
               <AreaTrend
                 title=""
                 data={oeeTrend}
                 xKey="time"
                 series={[{ key: 'oee', name: 'OEE', color: 'rgb(16 185 129)', unit: '%' }]}
               />
            </div>
          </div>

          {/* Actions */}
          <div>
             <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Quick Actions</h3>
             <div className="flex flex-wrap gap-3">
                <Button variant="outline">Restart Session</Button>
                <Button variant="outline">Run Diagnostics</Button>
                <Button variant="outline">View Telemetry Trace</Button>
             </div>
          </div>

        </div>
      </div>
    </Modal>
  );
};
