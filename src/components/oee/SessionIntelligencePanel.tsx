import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { AreaTrend, LineTrend } from '@/components/charts';
import { KpiCard } from '@/components/common';
import { BatteryCharging, PlugZap, XOctagon, Info } from 'lucide-react';
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
      <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 flex gap-3">
        <div className="mt-0.5 shrink-0">
          <Info className="h-5 w-5 text-brand-400" />
        </div>
        <div className="text-sm text-brand-100/90 leading-relaxed">
          <p className="font-semibold text-brand-300 mb-1">How these metrics are calculated (Simulation Mode)</p>
          <p>
            Currently, session data is simulated mathematically based on the active device registry:
          </p>
          <ul className="mt-2 space-y-1 ml-4 list-disc text-brand-100/70">
            <li><strong>Today's Sessions:</strong> Total Fleet Assets ({kpis.totalAssets}) × 4.2 estimated sessions per day = {baseSessions}.</li>
            <li><strong>Successful Sessions:</strong> Uses a hardcoded {successRate}% success rate benchmark ({successful} sessions).</li>
            <li><strong>Failed Sessions:</strong> The remaining difference between Total and Successful sessions ({failed} sessions).</li>
          </ul>
        </div>
      </div>
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
