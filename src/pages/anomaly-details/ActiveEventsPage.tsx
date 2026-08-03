import { useMemo, useState } from 'react';
import { Activity, Search, AlertTriangle } from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { PageHeader } from '@/components/common';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/data';
import { BarTrend } from '@/components/charts';
import { useAnomalyJournal } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/utils/format';

export const ActiveEventsPage = () => {
  const journal = useAnomalyJournal();
  const [search, setSearch] = useState('');

  const activeEvents = useMemo(() => journal.filter(j => j.status === 'Active'), [journal]);

  const severityBars = useMemo(() => {
    return [
      { label: 'Critical', count: activeEvents.filter(e => e.severity === 'Critical').length },
      { label: 'Major', count: activeEvents.filter(e => e.severity === 'Major').length },
      { label: 'Warning', count: activeEvents.filter(e => e.severity === 'Warning').length },
    ];
  }, [activeEvents]);

  const columns = useMemo(() => [
    { id: 'code', header: 'Code', accessorFn: (row: any) => row.code },
    { id: 'severity', header: 'Severity', accessorFn: (row: any) => row.severity },
    { id: 'device', header: 'Asset ID', accessorFn: (row: any) => row.assetId },
    { id: 'time', header: 'Detected', accessorFn: (row: any) => formatDateTime(row.timestamp) },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Active Events" 
        subtitle="Currently triggered anomalies requiring attention" 
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
          placeholder="Search events..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="w-64"
        />
        <Select 
          options={[{value: 'all', label: 'All Severities'}]} 
          value="all" 
          onChange={() => {}}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend
          title="Active Events by Severity"
          subtitle="Distribution of unresolved alerts"
          eyebrow="Breakdown"
          icon={AlertTriangle}
          data={severityBars}
          series={[{ key: 'count', name: 'Events', color: SERIES[0], decimals: 0 }]}
          layout="horizontal"
          height={300}
          categoryWidth={150}
        />
        <Card>
          <CardHeader title="Events Over Time" subtitle="Alert frequency in the last 24 hours" icon={Activity} />
          <div className="p-6 flex justify-center items-center h-[300px] text-fg-muted">
             [Area Chart: Event Frequency]
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Active Event Log" subtitle="Comprehensive list of active alerts" />
        <DataTable<AnomalyRecord> 
          data={activeEvents} 
          columns={columns} 
          rowKey={(row) => row.id} 
          minWidth="100%" 
        />
      </Card>
    </div>
  );
};
