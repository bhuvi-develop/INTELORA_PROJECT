import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { AreaTrend, LineTrend } from '@/components/charts';
import { KpiCard } from '@/components/common';
import { BatteryCharging, PlugZap, XOctagon } from 'lucide-react';
import { useFleetKpis } from '@/engine/store';

export const SessionIntelligencePanel = () => {
  const kpis = useFleetKpis();
  const baseSessions = Math.round(kpis.totalAssets * 4.2);
  const successRate = 98.4;
  const successful = Math.round(baseSessions * (successRate / 100));
  const failed = baseSessions - successful;

  const mockSessions = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      sessions: Math.floor((baseSessions / 24) * (0.5 + Math.random())),
      energy: Math.floor((kpis.totalPower / 24) * (0.5 + Math.random()))
    }));
  }, [baseSessions, kpis.totalPower]);

  const dailyTrend = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map(day => ({
      day,
      sessions: Math.floor(baseSessions * (0.8 + Math.random() * 0.4)),
    }));
  }, [baseSessions]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="Today's Sessions"
          value={baseSessions.toLocaleString()}
          icon={<BatteryCharging />}
          trend={Math.round(baseSessions * 0.05)}
          trendLabel="vs yesterday"
          intent="success"
        />
        <KpiCard
          title="Successful Sessions"
          value={successful.toLocaleString()}
          icon={<PlugZap />}
          trend={successRate}
          trendLabel="success rate"
          intent="success"
        />
        <KpiCard
          title="Failed Sessions"
          value={failed.toLocaleString()}
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

      <Card className="p-5 h-[350px] flex flex-col">
        <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">Weekly Session Volume</h3>
        <div className="flex-1 min-h-0">
           <LineTrend
             title=""
             data={dailyTrend}
             xKey="day"
             series={[{ key: 'sessions', name: 'Total Sessions', color: 'rgb(168 85 247)' }]}
           />
        </div>
      </Card>
    </div>
  );
};
