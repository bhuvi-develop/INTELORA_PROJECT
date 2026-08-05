import { useState, useMemo } from 'react';
import { useAssetList } from '@/engine/store';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/data';
import { formatPercent, formatNumber } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Zap, AlertTriangle, MonitorPlay } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { AssetRuntime } from '@/engine/types';
import { DeviceProfileDrawer } from './DeviceProfileDrawer';

export const DeviceIntelligencePanel = () => {
  const assets = useAssetList();
  const [selectedAsset, setSelectedAsset] = useState<AssetRuntime | null>(null);

  const columns = useMemo<ColumnDef<AssetRuntime>[]>(
    () => [
      {
        id: 'identity',
        header: 'Device',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold text-fg cursor-pointer hover:underline" onClick={() => setSelectedAsset(row.original)}>
              {row.original.device.assetName}
            </span>
            <span className="font-mono text-xs text-fg-soft">{row.original.device.assetId}</span>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (a: AssetRuntime) => a.device.category,
        cell: ({ getValue }) => <Badge tone="neutral">{getValue() as string}</Badge>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (a: AssetRuntime) => a.device.status,
        cell: ({ getValue }) => {
          const s = getValue() as string;
          return <Badge tone={s === 'Online' ? 'good' : 'neutral'}>{s}</Badge>;
        }
      },
      {
        id: 'oee',
        header: 'OEE',
        accessorFn: (a: AssetRuntime) => a.performance.oee,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, v)}%` }} />
              </div>
              <span className="font-mono text-sm">{formatPercent(v, 1)}</span>
            </div>
          );
        }
      },
      {
        id: 'power',
        header: 'Current Power',
        accessorFn: (a: AssetRuntime) => a.live.power,
        cell: ({ getValue }) => (
          <span className="font-mono flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-emerald-400" /> {formatNumber(getValue() as number)} W
          </span>
        )
      }
    ],
    []
  );

  const topDevices = useMemo(() => [...assets].sort((a, b) => b.performance.oee - a.performance.oee).slice(0, 5), [assets]);
  const bottomDevices = useMemo(() => [...assets].sort((a, b) => a.performance.oee - b.performance.oee).slice(0, 5), [assets]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
         <Card className="p-5">
           <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg flex items-center gap-2"><MonitorPlay className="h-4 w-4 text-emerald-500" /> Top Performing Devices</h3>
           <div className="space-y-3">
              {topDevices.map((a, i) => (
                <div key={a.device.assetId} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-surface-alt/10 hover:bg-surface-alt/30 transition-colors cursor-pointer" onClick={() => setSelectedAsset(a)}>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono text-fg-muted">#{i+1}</div>
                    <div>
                      <div className="text-sm font-semibold">{a.device.assetName}</div>
                      <div className="text-xs font-mono text-fg-soft">{a.device.assetId}</div>
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-emerald-400">{formatPercent(a.performance.oee, 1)}</div>
                </div>
              ))}
           </div>
         </Card>

         <Card className="p-5">
           <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-500" /> Devices Requiring Attention</h3>
           <div className="space-y-3">
              {bottomDevices.map((a, i) => (
                <div key={a.device.assetId} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-surface-alt/10 hover:bg-surface-alt/30 transition-colors cursor-pointer" onClick={() => setSelectedAsset(a)}>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono text-fg-muted">#{assets.length - i}</div>
                    <div>
                      <div className="text-sm font-semibold">{a.device.assetName}</div>
                      <div className="text-xs font-mono text-fg-soft">{a.device.assetId}</div>
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-rose-400">{formatPercent(a.performance.oee, 1)}</div>
                </div>
              ))}
           </div>
         </Card>
      </div>

      <Card className="overflow-hidden">
        <DataTable
           columns={columns as any}
           data={assets}
           rowKey={(r: any) => r.device.assetId}
        />
      </Card>

      <DeviceProfileDrawer 
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />
    </div>
  );
};
