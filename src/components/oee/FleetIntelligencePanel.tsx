import { useMemo } from 'react';
import { useAssetList, useFleetKpis, useSnapshot } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { DonutSplit, AreaTrend } from '@/components/charts';
import { KpiCard } from '@/components/common/KpiCard';
import { Activity, Clock3, PowerOff, Factory } from 'lucide-react';

export const FleetIntelligencePanel = () => {
  const assets = useAssetList();
  const kpis = useFleetKpis();
  const { at } = useSnapshot();

  // Project the fleet's availability over a standard 24-hour window
  const totalRuntime = Math.round(kpis.totalAssets * 24 * (kpis.averageAvailability / 100));
  const totalDowntime = Math.round(kpis.totalAssets * 24 * ((100 - kpis.averageAvailability) / 100));

  // Utilization breakdown
  const highlyUtilized = assets.filter(a => a.performance.performance >= 80).length;
  const moderatelyUtilized = assets.filter(a => a.performance.performance >= 50 && a.performance.performance < 80).length;
  const lowUtilized = assets.filter(a => a.performance.performance < 50).length;

  const utilizationSeries = useMemo(() => [
    { key: 'high', name: 'Highly Utilized (>80%)', value: highlyUtilized, color: 'rgb(16 185 129)' },
    { key: 'mid', name: 'Moderately Utilized (50-80%)', value: moderatelyUtilized, color: 'rgb(245 158 11)' },
    { key: 'low', name: 'Low Utilized (<50%)', value: lowUtilized, color: 'rgb(239 68 68)' },
  ], [highlyUtilized, moderatelyUtilized, lowUtilized]);

  const productDistribution = useMemo(() => {
    const laptops = assets.filter(a => a.device.category === 'Laptop').length;
    const chargers = assets.filter(a => a.device.category === 'Mobile Charger').length;
    return [
      { key: 'laptops', name: 'Laptops', value: laptops, color: 'rgb(99 102 241)' },
      { key: 'chargers', name: 'Mobile Chargers', value: chargers, color: 'rgb(168 85 247)' }
    ];
  }, [assets]);

  const fleetTrend = useMemo(() => {
    // Generate mock fleet trend for last 10 ticks
    return Array.from({ length: 10 }).map((_, i) => ({
      time: new Date(at - (9 - i) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      utilization: 60 + Math.random() * 30
    }));
  }, [at]);

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Fleet Runtime"
          value={formatNumber(totalRuntime) + 'h'}
          icon={<Clock3 />}
          trend={2.4}
          trendLabel="vs last week"
          intent="success"
        />
        <KpiCard
          title="Fleet Downtime"
          value={formatNumber(totalDowntime) + 'h'}
          icon={<PowerOff />}
          trend={-1.2}
          trendLabel="vs last week"
          intent="success"
        />
        <KpiCard
          title="Average Utilization"
          value={formatPercent(kpis.averageOee * 0.9, 1)}
          icon={<Activity />}
          trend={1.5}
          trendLabel="vs last week"
          intent="neutral"
        />
        <KpiCard
          title="Operational Capacity"
          value={formatNumber(kpis.totalPower) + ' W'}
          icon={<Factory />}
          trend={0}
          trendLabel="Stable"
          intent="neutral"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Utilization Chart */}
        <Card className="col-span-1 lg:col-span-1 p-5 h-80 flex flex-col">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Fleet Utilization</h3>
          <div className="flex-1 min-h-0">
            <DonutSplit
              title=""
              data={utilizationSeries}
              centerLabel="Devices"
            />
          </div>
        </Card>

        {/* Product Distribution Chart */}
        <Card className="col-span-1 lg:col-span-1 p-5 h-80 flex flex-col">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Product Distribution</h3>
          <div className="flex-1 min-h-0">
            <DonutSplit
              title=""
              data={productDistribution}
              centerLabel="Devices"
            />
          </div>
        </Card>

        {/* Fleet Trend */}
        <Card className="col-span-1 lg:col-span-1 p-5 h-80 flex flex-col">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Fleet Trend</h3>
          <div className="flex-1 min-h-0">
             <AreaTrend 
               title=""
               data={fleetTrend}
               xKey="time"
               series={[{ key: 'utilization', name: 'Utilization', color: 'rgb(59 130 246)', unit: '%' }]}
             />
          </div>
        </Card>
      </div>
    </div>
  );
};
