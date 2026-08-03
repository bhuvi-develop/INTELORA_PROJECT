import { useMemo, useState } from 'react';
import { FileSignature, Search, Layers, Fingerprint, Activity, AlertTriangle } from 'lucide-react';
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

export const SignatureAnalyticsPage = () => {
  const journal = useAnomalyJournal();
  const [search, setSearch] = useState('');

  const signatureBars = useMemo(() => {
    // Mock signature count logic based on title
    return [
      { label: 'Overtemp', count: journal.filter(j => j.title.toLowerCase().includes('temp')).length },
      { label: 'UnderVolt', count: journal.filter(j => j.title.toLowerCase().includes('volt')).length },
      { label: 'Unstable', count: journal.filter(j => j.title.toLowerCase().includes('unstable')).length },
    ];
  }, [journal]);

  const columns = useMemo(() => [
    { id: 'code', header: 'Code', accessorFn: (row: any) => row.code },
    { id: 'signature', header: 'Signature Match', accessorFn: (row: any) => row.title },
    { id: 'device', header: 'Asset ID', accessorFn: (row: any) => row.assetId },
    { id: 'confidence', header: 'Match Confidence', accessorFn: (row: any) => '98%' },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Signature Analytics" 
        subtitle="Failure mode patterns and signature matching" 
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
          placeholder="Search signatures..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="w-64"
        />
        <Select 
          options={[{value: 'all', label: 'All Failure Modes'}]} 
          value="all" 
          onChange={() => {}}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend
          title="Top Signatures Matched"
          subtitle="Most common failure modes detected"
          eyebrow="Frequency"
          icon={Layers}
          data={signatureBars}
          series={[{ key: 'count', name: 'Matches', color: SERIES[4], decimals: 0 }]}
          layout="horizontal"
          height={300}
          categoryWidth={150}
        />
        <Card>
          <CardHeader title="Signature Trend Heatmap" subtitle="Match density over time" icon={FileSignature} />
          <div className="p-6 flex justify-center items-center h-[300px] text-fg-muted">
             [Heatmap: Signatures / Time]
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Signature Match Log" subtitle="Detailed breakdown of failure mode events" />
        <DataTable<AnomalyRecord> 
          data={journal} 
          columns={columns} 
          rowKey={(row) => row.id} 
          minWidth="100%" 
        />
      </Card>
    </div>
  );
};
