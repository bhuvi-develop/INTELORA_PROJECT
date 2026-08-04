import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { AreaTrend, Heatmap } from '@/components/charts';
import { KpiCard } from '@/components/common/KpiCard';
import { BatteryCharging, PlugZap, XOctagon } from 'lucide-react';

export const SessionIntelligencePanel = () => {

  const mockSessions = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      sessions: Math.floor(20 + Math.random() * 80),
      energy: Math.floor(50 + Math.random() * 200)
    }));
  }, []);

  const heatmapData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = Array.from({ length: 24 }).map((_, i) => `${i}`);
    const data = days.map(() => hours.map(() => ({ value: Math.floor(Math.random() * 100) })));
    return { days, hours, data };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="Today's Sessions"
          value="1,248"
          icon={<BatteryCharging />}
          trend={12}
          trendLabel="vs yesterday"
          intent="success"
        />
        <KpiCard
          title="Successful Sessions"
          value="1,240"
          icon={<PlugZap />}
          trend={99.3}
          trendLabel="success rate"
          intent="success"
        />
        <KpiCard
          title="Failed Sessions"
          value="8"
          icon={<XOctagon />}
          trend={-2}
          trendLabel="vs yesterday"
          intent="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 h-80 flex flex-col">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Charging Volume Trend (24h)</h3>
          <div className="flex-1 min-h-0">
             <AreaTrend 
               title=""
               data={mockSessions}
               xKey="hour"
               series={[{ key: 'sessions', name: 'Sessions', color: 'rgb(59 130 246)' }]}
             />
          </div>
        </Card>
        
        <Card className="p-5 h-80 flex flex-col">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Energy Delivered Trend (24h)</h3>
          <div className="flex-1 min-h-0">
             <AreaTrend 
               title=""
               data={mockSessions}
               xKey="hour"
               series={[{ key: 'energy', name: 'Energy', color: 'rgb(16 185 129)', unit: ' kWh' }]}
             />
          </div>
        </Card>
      </div>

      <Card className="p-5 h-[400px] flex flex-col">
        <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Peak Charging Hour Heatmap</h3>
        <div className="flex-1 min-h-0">
           <Heatmap
             title=""
             subtitle=""
             cells={heatmapData.days.flatMap((row, y) => heatmapData.hours.map((col, x) => ({ row, col: parseInt(col), value: heatmapData.data[y][x].value })))} 
             rows={heatmapData.days}
             cols={heatmapData.hours.map((_, i) => i)}
             colLabel={(col) => `${col}h`}
             valueLabel={(val) => `${val} sessions`}
           />
        </div>
      </Card>
    </div>
  );
};
