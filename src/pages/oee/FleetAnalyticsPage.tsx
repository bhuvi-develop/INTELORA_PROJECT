import { PageHeader } from '@/components/common';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Target, DollarSign, Activity } from 'lucide-react';
import { formatNumber, formatPercent } from '@/utils/format';
import { useFleetKpis, useAssetList } from '@/engine/store';

export const FleetAnalyticsPage = () => {
  const kpis = useFleetKpis();
  const assets = useAssetList();

  const mockRevenueImpact = (kpis.averageOee - 85) * 1250; // Mock calculation
  
  return (
    <div className="flex h-full flex-col bg-bg">
      <PageHeader 
        title="Fleet Analytics" 
        subtitle="Business insights and comprehensive fleet benchmarking"
      />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-8">
          
          <div className="flex items-center gap-2 mb-4">
             <DollarSign className="h-5 w-5 text-fg-soft" />
             <h2 className="text-lg font-semibold text-fg tracking-tight">Business Insights</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
             <Card className="p-5">
               <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
                 Fleet Productivity <Badge tone="good">+2.4%</Badge>
               </div>
               <div className="text-2xl font-semibold text-fg">{formatPercent(kpis.averageOee * 0.95, 1)}</div>
             </Card>
             <Card className="p-5">
               <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
                 Lost Charging Capacity <Badge tone="critical">-1.1%</Badge>
               </div>
               <div className="text-2xl font-semibold text-fg">{formatNumber(assets.length * 1.5)} kWh</div>
             </Card>
             <Card className="p-5">
               <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
                 Energy Delivered (Today)
               </div>
               <div className="text-2xl font-semibold text-fg">{formatNumber(kpis.totalEnergy)} kWh</div>
             </Card>
             <Card className="p-5">
               <div className="text-sm text-fg-soft mb-2 flex justify-between items-center">
                 Operational Cost Indicator
               </div>
               <div className="text-2xl font-semibold text-emerald-500">${formatNumber(mockRevenueImpact)}</div>
             </Card>
          </div>

          <div className="flex items-center gap-2 mb-4">
             <Target className="h-5 w-5 text-fg-soft" />
             <h2 className="text-lg font-semibold text-fg tracking-tight">Benchmarking</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
             <Card className="p-6 text-center border-emerald-500/20 bg-emerald-500/5">
                <div className="text-sm font-semibold tracking-wide text-emerald-600 mb-2">Current Fleet OEE</div>
                <div className="text-4xl font-light text-emerald-500">{formatPercent(kpis.averageOee, 1)}</div>
             </Card>
             <Card className="p-6 text-center">
                <div className="text-sm font-semibold tracking-wide text-fg-soft mb-2">Target OEE</div>
                <div className="text-4xl font-light text-fg">85.0%</div>
             </Card>
             <Card className="p-6 text-center">
                <div className="text-sm font-semibold tracking-wide text-amber-600 mb-2">World Class OEE</div>
                <div className="text-4xl font-light text-amber-500">95.0%</div>
             </Card>
          </div>

          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg flex items-center gap-2">
              <Activity className="h-4 w-4" /> 
              Performance vs Previous Periods
            </h3>
            <div className="space-y-4">
               <div className="flex justify-between items-center p-3 rounded-lg bg-surface-alt/20 border border-border/50">
                  <span className="font-medium text-fg">Previous Week</span>
                  <div className="flex items-center gap-4">
                    <span className="text-fg-soft">{formatPercent(kpis.averageOee - 1.2, 1)}</span>
                    <Badge tone="good">+1.2% Improvement</Badge>
                  </div>
               </div>
               <div className="flex justify-between items-center p-3 rounded-lg bg-surface-alt/20 border border-border/50">
                  <span className="font-medium text-fg">Previous Month</span>
                  <div className="flex items-center gap-4">
                    <span className="text-fg-soft">{formatPercent(kpis.averageOee + 2.5, 1)}</span>
                    <Badge tone="critical">-2.5% Decline</Badge>
                  </div>
               </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
};
