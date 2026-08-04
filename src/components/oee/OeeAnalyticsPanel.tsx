import { useMemo } from 'react';
import { useFleetKpis, useSnapshot } from '@/engine/store';
import { Card } from '@/components/ui/Card';
import { LineTrend } from '@/components/charts';
import { effectivenessLosses } from '@/engine/analytics';
import { Badge } from '@/components/ui/Badge';


export const OeeAnalyticsPanel = () => {
  const kpis = useFleetKpis();
  const { at } = useSnapshot();

  const losses = effectivenessLosses(kpis.averageAvailability, 90, 95); // Mock metrics for performace and quality since they aren't explicitly in kpis

  const oeeTrend = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => ({
      time: new Date(at - (11 - i) * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      oee: Math.max(60, kpis.averageOee - 5 + Math.random() * 10),
      availability: Math.max(70, kpis.averageAvailability - 5 + Math.random() * 10),
      performance: 85 + Math.random() * 10,
      quality: 90 + Math.random() * 5
    }));
  }, [at, kpis.averageOee, kpis.averageAvailability]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* OEE Trend Matrix */}
        <Card className="col-span-1 xl:col-span-2 p-5">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">OEE Historical Trend</h3>
          <div className="h-72">
            <LineTrend
              title=""
              data={oeeTrend}
              xKey="time"
              series={[
                { key: 'oee', name: 'OEE', color: 'rgb(16 185 129)', unit: '%' },
                { key: 'availability', name: 'Availability', color: 'rgb(59 130 246)', unit: '%' },
                { key: 'performance', name: 'Performance', color: 'rgb(99 102 241)', unit: '%' },
                { key: 'quality', name: 'Quality', color: 'rgb(168 85 247)', unit: '%' }
              ]}
            />
          </div>
        </Card>

        {/* Loss Breakdown Waterfall */}
        <Card className="col-span-1 p-5">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Efficiency Loss Breakdown</h3>
          <div className="h-72 flex flex-col justify-center space-y-6 px-2">
            {losses.map(loss => (
              <div key={loss.key} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-fg">{loss.label}</span>
                  <span className="text-rose-400 font-mono">-{loss.loss}%</span>
                </div>
                <div className="w-full bg-overlay/5 rounded-full h-2 overflow-hidden shadow-inner">
                   <div className="bg-rose-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, loss.loss * 4)}%` }} />
                </div>
                <div className="text-[11px] text-fg-soft leading-relaxed">{loss.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-fg-soft leading-relaxed">
             Availability loss is the primary constraint. Improving uptime on offline devices will yield the highest return on overall fleet effectiveness.
          </div>
        </Card>
      </div>

      {/* Comparison Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-fg-soft mb-1">Today vs Yesterday</div>
            <div className="font-semibold text-fg">OEE +2.1%</div>
          </div>
          <Badge tone="good">Improved</Badge>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-fg-soft mb-1">This Week vs Last Week</div>
            <div className="font-semibold text-fg">OEE -0.5%</div>
          </div>
          <Badge tone="warning">Slight Drop</Badge>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-fg-soft mb-1">This Month vs Last Month</div>
            <div className="font-semibold text-fg">OEE +5.4%</div>
          </div>
          <Badge tone="good">Strong Gain</Badge>
        </Card>
      </div>
    </div>
  );
};
