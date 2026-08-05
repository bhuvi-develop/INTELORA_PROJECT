import { useMemo } from 'react';
import { PageHeader } from '@/components/common';
import { Card } from '@/components/ui/Card';
import { useAssetList } from '@/engine/store';
import { formatPercent } from '@/utils/format';
import { Layers, Smartphone, Factory } from 'lucide-react';
import { BarTrend } from '@/components/charts';

export const ProductAnalyticsPage = () => {
  const assets = useAssetList();

  const categories = useMemo(() => {
    const laptops = assets.filter(a => a.device.category === 'Laptop');
    const chargers = assets.filter(a => a.device.category === 'Mobile Charger');
    
    return [
      {
        name: 'Laptops',
        icon: <Factory className="h-5 w-5 text-indigo-500" />,
        count: laptops.length,
        oee: laptops.reduce((sum, a) => sum + a.performance.oee, 0) / (laptops.length || 1),
        availability: laptops.reduce((sum, a) => sum + a.performance.availability, 0) / (laptops.length || 1),
        performance: laptops.reduce((sum, a) => sum + a.performance.performance, 0) / (laptops.length || 1),
      },
      {
        name: 'Mobile Chargers',
        icon: <Smartphone className="h-5 w-5 text-purple-500" />,
        count: chargers.length,
        oee: chargers.reduce((sum, a) => sum + a.performance.oee, 0) / (chargers.length || 1),
        availability: chargers.reduce((sum, a) => sum + a.performance.availability, 0) / (chargers.length || 1),
        performance: chargers.reduce((sum, a) => sum + a.performance.performance, 0) / (chargers.length || 1),
      }
    ];
  }, [assets]);

  const trendData = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => ({
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      laptops: 75 + Math.random() * 20,
      chargers: 80 + Math.random() * 15
    }));
  }, []);

  return (
    <div className="flex h-full flex-col bg-bg">
      <PageHeader 
        title="Product Analytics" 
        subtitle="Performance breakdown by product category"
      />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-8">
          
          <div className="flex items-center gap-2 mb-4">
             <Layers className="h-5 w-5 text-fg-soft" />
             <h2 className="text-lg font-semibold text-fg tracking-tight">Category Overview</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {categories.map(cat => (
               <Card key={cat.name} className="p-6">
                 <div className="flex items-center justify-between mb-6">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-surface-alt/50 rounded-lg">{cat.icon}</div>
                     <div>
                       <h3 className="font-semibold text-lg text-fg">{cat.name}</h3>
                       <div className="text-sm text-fg-soft">{cat.count} devices deployed</div>
                     </div>
                   </div>
                   <div className="text-right">
                     <div className="text-3xl font-light text-fg">{formatPercent(cat.oee, 1)}</div>
                     <div className="text-xs font-semibold tracking-wider text-fg-soft uppercase mt-1">Average OEE</div>
                   </div>
                 </div>

                 <div className="space-y-4">
                   <div>
                     <div className="flex justify-between text-sm mb-1.5">
                       <span className="text-fg-soft">Availability</span>
                       <span className="font-medium text-fg">{formatPercent(cat.availability, 1)}</span>
                     </div>
                     <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                       <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, cat.availability)}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-sm mb-1.5">
                       <span className="text-fg-soft">Performance</span>
                       <span className="font-medium text-fg">{formatPercent(cat.performance, 1)}</span>
                     </div>
                     <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                       <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, cat.performance)}%` }} />
                     </div>
                   </div>
                 </div>
               </Card>
             ))}
          </div>

          <Card className="p-6 h-96 flex flex-col">
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-fg">OEE Comparison Trend (7 Days)</h3>
            <div className="flex-1 min-h-0">
               <BarTrend
                 title=""
                 data={trendData}
                 xKey="day"
                 series={[
                   { key: 'laptops', name: 'Laptops', color: 'rgb(99 102 241)' },
                   { key: 'chargers', name: 'Mobile Chargers', color: 'rgb(168 85 247)' }
                 ]}
               />
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
};
