import { useMemo } from 'react';
import { Activity, TrendingDown } from 'lucide-react';

import { useAssetList, useFleetTrail, useFleetKpis } from '@/engine/store';
import { OEE_TARGET } from '@/engine/derive';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { PageHeader, RankList, SectionHeader } from '@/components/common';
import { LineTrend } from '@/components/charts';
import { Progress } from '@/components/ui/Progress';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatNumber, formatPercent } from '@/utils/format';
import { deviceDetailPath } from '@/routes/paths';

export const FleetAnalyticsPage = () => {
  const assets = useAssetList();
  const trail = useFleetTrail();
  const kpis = useFleetKpis();

  const ranked = useMemo(() => [...assets].sort((a, b) => a.performance.oee - b.performance.oee), [assets]);
  const mockRevenueImpact = (kpis.averageOee - 85) * 1250;

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Analytics" subtitle="Macro OEE trends, business insights, and fleet-wide rankings" />

      {/* Business Insights */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
            Fleet Productivity <Badge tone="good">+2.4%</Badge>
          </div>
          <div className="text-2xl font-semibold text-fg">{formatPercent(kpis.averageOee * 0.95, 1)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
            Lost Capacity <Badge tone="critical">-1.1%</Badge>
          </div>
          <div className="text-2xl font-semibold text-fg">{formatNumber(assets.length * 1.5)} kWh</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
            Energy Delivered
          </div>
          <div className="text-2xl font-semibold text-fg">{formatNumber(kpis.totalEnergy)} kWh</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
            Operational Cost Impact
          </div>
          <div className="text-2xl font-semibold text-emerald-500">${formatNumber(mockRevenueImpact)}</div>
        </Card>
      </div>

      <LineTrend
        title="Fleet Effectiveness Trend"
        subtitle="Effectiveness alongside mean condition across the streaming window"
        eyebrow="Trend"
        icon={Activity}
        data={trail}
        series={[
          { key: 'oee', name: 'Effectiveness', color: SERIES[0], unit: '%', decimals: 1 },
          { key: 'health', name: 'Mean health', color: SERIES[2], unit: '%', decimals: 1 },
        ]}
        height={300}
        domain={[40, 100]}
        endLabels
        references={[{ value: OEE_TARGET, label: `Target ${OEE_TARGET}%` }]}
      />

      <div className="space-y-4 mt-6">
        <SectionHeader title="Fleet Rankings" subtitle="Devices consuming the largest share of recoverable loss" />
        <RankList
          title="Lowest effectiveness"
          subtitle="Top 10 lowest performers across the entire fleet"
          eyebrow="Ranking"
          icon={TrendingDown}
          items={ranked.slice(0, 10).map((asset) => ({
            id: asset.device.assetId,
            title: asset.device.assetName,
            tag: asset.device.assetId,
            subtitle: `${asset.device.category} · A ${formatNumber(asset.performance.availability, 0)} · P ${formatNumber(asset.performance.performance, 0)} · Q ${formatNumber(asset.performance.quality, 0)}`,
            value: formatPercent(asset.performance.oee, 1),
            trailing: (
              <Progress
                value={asset.performance.oee}
                marker={OEE_TARGET}
                size="xs"
                color={asset.performance.oee >= OEE_TARGET ? STATUS_COLOR.good : STATUS_COLOR.warning}
                className="w-16"
              />
            ),
            href: deviceDetailPath(asset.device.assetId),
          }))}
        />
      </div>
    </div>
  );
};
