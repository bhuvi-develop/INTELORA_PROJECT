import { useMemo } from 'react';
import { Gauge, Layers } from 'lucide-react';
import { useAssetList, useCategoryRollups } from '@/engine/store';
import { OEE_TARGET } from '@/engine/derive';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { PageHeader } from '@/components/common';
import { BarTrend } from '@/components/charts';
import type { AssetRuntime } from '@/engine/types';

export const ProductAnalyticsPage = () => {
  const assets = useAssetList();
  const categories = useCategoryRollups();

  const factorBars = useMemo(
    () =>
      categories.map((row) => {
        const rows = assets.filter((asset) => asset.device.category === row.category);
        const mean = (pick: (asset: AssetRuntime) => number) =>
          rows.length === 0 ? 0 : rows.reduce((sum, asset) => sum + pick(asset), 0) / rows.length;
        return {
          label: row.category,
          availability: Number(mean((asset) => asset.performance.availability).toFixed(1)),
          performance: Number(mean((asset) => asset.performance.performance).toFixed(1)),
          quality: Number(mean((asset) => asset.performance.quality).toFixed(1)),
        };
      }),
    [categories, assets],
  );

  const categoryBars = useMemo(
    () =>
      categories.map((row) => ({
        label: row.category,
        oee: row.oee,
      })),
    [categories],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Product Analytics" subtitle="Head-to-head comparison of charger types" />

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend
          title="Effectiveness by category"
          subtitle="Mean effectiveness per device class against target"
          eyebrow="Comparison"
          icon={Layers}
          data={categoryBars}
          series={[{ key: 'oee', name: 'Effectiveness', color: SERIES[0], unit: '%', decimals: 1 }]}
          layout="horizontal"
          height={320}
          categoryWidth={150}
          references={[{ value: OEE_TARGET, label: `${OEE_TARGET}%` }]}
          colorFor={(point) => {
            const value = Number(point.oee ?? 0);
            return value >= OEE_TARGET
              ? STATUS_COLOR.good
              : value >= 65
                ? STATUS_COLOR.warning
                : STATUS_COLOR.critical;
          }}
        />

        <BarTrend
          title="Factor comparison by category"
          subtitle="Availability, performance and quality side by side"
          eyebrow="Breakdown"
          icon={Gauge}
          data={factorBars}
          series={[
            { key: 'availability', name: 'Availability', color: SERIES[2], unit: '%', decimals: 1 },
            { key: 'performance', name: 'Performance', color: SERIES[3], unit: '%', decimals: 1 },
            { key: 'quality', name: 'Quality', color: SERIES[4], unit: '%', decimals: 1 },
          ]}
          layout="horizontal"
          height={320}
          categoryWidth={150}
        />
      </div>
    </div>
  );
};
