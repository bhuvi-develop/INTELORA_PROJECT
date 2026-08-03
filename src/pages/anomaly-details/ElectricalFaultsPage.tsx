import { useMemo, useState } from 'react';
import { Zap, Search, Activity, AlertTriangle } from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { PageHeader } from '@/components/common';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/data';
import { LineTrend } from '@/components/charts';
import { useAnomalyJournal } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export const ElectricalFaultsPage = () => {
  const journal = useAnomalyJournal();
  const [search, setSearch] = useState('');

  // Filtering for electrical faults (mock filter by category 'electrical' or similar)
  const electricalEvents = useMemo(() => journal.slice(0, 15), [journal]); 

  const columns = useMemo(() => [
    { id: 'code', header: 'Code', accessorFn: (row: any) => row.code },
    { id: 'title', header: 'Fault Type', accessorFn: (row: any) => row.title },
    { id: 'device', header: 'Asset ID', accessorFn: (row: any) => row.assetId },
    { id: 'reading', header: 'Observed', accessorFn: (row: any) => row.observed },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Electrical Faults" 
        subtitle="Power, voltage, and electrical anomaly detection" 
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">Export PDF</Button>
            <Button variant="secondary" size="sm">Export CSV</Button>
          </div>
        }
      />
      
      <div className="flex gap-4 p-4 border border-overlay/[0.06] rounded-xl bg-card">
        <Input 
          icon={Search} 
          placeholder="Search faults..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="w-64"
        />
        <Select 
          options={[{value: 'all', label: 'All Fault Types'}]} 
          value="all" 
          onChange={() => {}}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LineTrend
          title="Voltage Fluctuations"
          subtitle="Fleet wide voltage stability trend"
          eyebrow="Trend"
          icon={Activity}
          data={[]} 
          series={[{ key: 'voltage', name: 'Voltage', color: SERIES[3], decimals: 1 }]}
          height={300}
        />
        <Card>
          <CardHeader title="Power Draw Anomalies" subtitle="Overcurrent and short circuit events" icon={Zap} />
          <div className="p-6 flex justify-center items-center h-[300px] text-fg-muted">
             [Scatter Plot: Power Draw vs Time]
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Electrical Fault Log" subtitle="Comprehensive list of electrical anomalies" />
        <DataTable<AnomalyRecord> 
          data={electricalEvents} 
          columns={columns} 
          rowKey={(row) => row.id} 
          minWidth="100%" 
        />
      </Card>
    </div>
  );
};
