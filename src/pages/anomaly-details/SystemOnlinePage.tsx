import { useMemo, useState } from 'react';
import { ShieldCheck, Activity, Search } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { PageHeader } from '@/components/common';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/data';
import { LineTrend } from '@/components/charts';
import { useAssetList, useFleetTrail } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export const SystemOnlinePage = () => {
  const assets = useAssetList();
  const trail = useFleetTrail();
  const [search, setSearch] = useState('');

  const columns = useMemo(() => [
    { id: 'id', header: 'Asset ID', accessorFn: (row: any) => row.device.assetId },
    { id: 'name', header: 'Name', accessorFn: (row: any) => row.device.assetName },
    { id: 'status', header: 'Status', accessorFn: (row: any) => row.device.status },
    { id: 'health', header: 'Health', accessorFn: (row: any) => row.health },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="System Online Status" 
        subtitle="Real-time connectivity and health monitoring across the fleet" 
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
          placeholder="Search devices..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="w-64"
        />
        <Select 
          options={[{value: 'all', label: 'All Statuses'}, {value: 'online', label: 'Online'}]} 
          value="all" 
          onChange={() => {}}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LineTrend
          title="Fleet Health Trend"
          subtitle="Mean health across the streaming window"
          eyebrow="Trend"
          icon={Activity}
          data={trail}
          series={[{ key: 'health', name: 'Mean health', color: SERIES[2], unit: '%', decimals: 1 }]}
          height={300}
        />
        <Card>
          <CardHeader title="Connectivity Distribution" subtitle="Online vs Offline devices" icon={ShieldCheck} />
          <div className="p-6 flex justify-center items-center h-[300px] text-fg-muted">
             {/* A placeholder for a donut chart */}
             [Donut Chart: Online / Offline Ratio]
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="System Status Report" subtitle="Complete device health log" />
        <DataTable<AssetRuntime> 
          data={assets} 
          columns={columns} 
          rowKey={(row) => row.device.assetId} 
          minWidth="100%" 
        />
      </Card>
    </div>
  );
};
