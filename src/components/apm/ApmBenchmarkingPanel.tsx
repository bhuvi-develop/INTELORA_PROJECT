import { useMemo, useState } from 'react';
import { BarChart3, Building2 } from 'lucide-react';
import type { ApmAssetDto } from '@/services/apm.types';
import { formatPercent } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { BarTrend } from '@/components/charts';
import { HealthMeter } from '@/components/common';
import { money } from '@/pages/apm/apmSelectors';

export interface ApmBenchmarkingPanelProps {
  assets: ApmAssetDto[];
}

type BenchmarkMode = 'site' | 'vendor' | 'class' | 'asset';

export const ApmBenchmarkingPanel = ({ assets }: ApmBenchmarkingPanelProps) => {
  const [mode, setMode] = useState<BenchmarkMode>('site');

  const groupedData = useMemo(() => {
    const groups = new Map<string, ApmAssetDto[]>();

    for (const asset of assets) {
      let key = 'Default Site';
      if (mode === 'site' || mode === 'vendor') {
        key = asset.brand || 'Generic Vendor';
      } else if (mode === 'class') {
        key = asset.category || 'Unclassified';
      } else {
        key = asset.asset_id;
      }

      const list = groups.get(key) || [];
      list.push(asset);
      groups.set(key, list);
    }

    return [...groups.entries()].map(([key, groupAssets]) => {
      const count = groupAssets.length;
      const avgHealth = Math.round(groupAssets.reduce((s, a) => s + a.health_index, 0) / count);
      const avgAvail = groupAssets.reduce((s, a) => s + a.availability_pct, 0) / count;
      const avgMtbf = groupAssets.reduce((s, a) => s + a.mtbf_hours, 0) / count;
      const avgMttr = groupAssets.reduce((s, a) => s + a.mttr_minutes, 0) / count;
      const totalExposure = groupAssets.reduce((s, a) => s + a.cost_exposure, 0);

      return {
        label: key,
        count,
        health: avgHealth,
        availability: avgAvail,
        mtbf: Math.round(avgMtbf),
        mttr: Math.round(avgMttr),
        exposure: totalExposure,
      };
    });
  }, [assets, mode]);

  const chartData = useMemo(
    () =>
      groupedData.map((d) => ({
        label: d.label,
        health: d.health,
        availability: Math.round(d.availability * 10) / 10,
      })),
    [groupedData]
  );

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-overlay/[0.06] pb-4">
        <div>
          <h3 className="text-base font-bold text-fg flex items-center gap-2">
            <BarChart3 className="text-brand-400" size={18} />
            APM Comparative Benchmarking
          </h3>
          <p className="text-xs text-fg-dim">
            Compare reliability, availability, and cost performance across dimensions
          </p>
        </div>

        <Segmented
          ariaLabel="Benchmarking dimension"
          layoutId="benchmark-mode"
          size="xs"
          options={[
            { value: 'site', label: 'Site vs Site (Brand)' },
            { value: 'vendor', label: 'Vendor vs Vendor' },
            { value: 'class', label: 'Class vs Class' },
            { value: 'asset', label: 'Asset Head-to-Head' },
          ]}
          value={mode}
          onChange={(val) => setMode(val as BenchmarkMode)}
        />
      </div>

      {/* Comparison Table */}
      <div className="scroll-x">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-overlay/[0.08] bg-ink-850/50 text-[10.5px] font-semibold text-fg-dim uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left">Dimension ({mode})</th>
              <th className="px-4 py-2.5 text-right">Asset Count</th>
              <th className="px-4 py-2.5 text-right">Mean Health Index</th>
              <th className="px-4 py-2.5 text-right">Availability</th>
              <th className="px-4 py-2.5 text-right">Mean MTBF</th>
              <th className="px-4 py-2.5 text-right">Mean MTTR</th>
              <th className="px-4 py-2.5 text-right">Total Cost Exposure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-overlay/[0.04] text-xs">
            {groupedData.map((row) => (
              <tr key={row.label} className="hover:bg-ink-800/40">
                <td className="px-4 py-3 font-semibold text-fg flex items-center gap-2">
                  <Building2 size={14} className="text-brand-400 shrink-0" />
                  {row.label}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-soft">{row.count}</td>
                <td className="px-4 py-3 text-right">
                  <HealthMeter health={row.health} width="w-16" className="justify-end" />
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-400">
                  {formatPercent(row.availability, 1)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-soft">{row.mtbf} hrs</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-soft">{row.mttr} mins</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-400">
                  {money(row.exposure)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison Grouped Bar Chart */}
      <BarTrend
        title={`${mode.toUpperCase()} Health Index vs Availability`}
        subtitle="Grouped comparative metrics across selected benchmark target"
        eyebrow="Benchmarking"
        icon={BarChart3}
        data={chartData}
        series={[
          { key: 'health', name: 'Mean Health Index', color: '#3b82f6', unit: '%', decimals: 1 },
          { key: 'availability', name: 'Availability', color: '#10b981', unit: '%', decimals: 1 },
        ]}
        height={260}
      />
    </Card>
  );
};
