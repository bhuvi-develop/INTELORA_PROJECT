import { useMemo } from 'react';
import { useFleetKpis, useSnapshot } from '@/engine/store';
import { Card } from '@/components/ui/Card';
import { RadialGauge, WaterfallChart, LineTrend } from '@/components/charts';
import { OEE_TARGET, OEE_WORLD_CLASS } from '@/engine/derive';
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
      {/* OEE Factors */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <RadialGauge
            label="Fleet OEE"
            value={kpis.averageOee}
            target={OEE_TARGET}
            color={kpis.averageOee >= OEE_TARGET ? 'rgb(16 185 129)' : 'rgb(245 158 11)'}
            unit="%"
            size={160}
          />
          <div className="mt-4 flex gap-2 justify-center w-full">
            <Badge tone={kpis.averageOee >= OEE_WORLD_CLASS ? "brand" : "neutral"}>World Class: {OEE_WORLD_CLASS}%</Badge>
          </div>
        </Card>
        
        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <RadialGauge
            label="Availability"
            value={kpis.averageAvailability}
            target={90}
            color="rgb(59 130 246)"
            unit="%"
            size={160}
          />
        </Card>

        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <RadialGauge
            label="Performance"
            value={87.5} // Mock
            target={95}
            color="rgb(99 102 241)"
            unit="%"
            size={160}
          />
        </Card>

        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <RadialGauge
            label="Quality"
            value={96.2} // Mock
            target={99}
            color="rgb(168 85 247)"
            unit="%"
            size={160}
          />
        </Card>
      </div>

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
          <div className="h-72">
             <WaterfallChart 
               title=""
               steps={losses}
               start={100}
               startLabel="Target"
               endLabel="Actual"
             />
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
